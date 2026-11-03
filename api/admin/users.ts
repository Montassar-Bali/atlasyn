import { HttpError, Profile, admin, json, publicUser, readJson, requireUser, route, temporaryPassword } from '../_lib/server.js'

export const GET = route(async (request) => {
  await requireUser(request, { admin: true })
  const { data } = await admin().from('profiles').select('*').order('role').order('name')
  return json({ users: (data ?? []).map((p) => publicUser(p as Profile)) })
})

export const POST = route(async (request) => {
  await requireUser(request, { admin: true })
  const body = await readJson<{ name?: string; email?: string; title?: string; role?: string }>(request)
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const title = String(body.title ?? '').trim().slice(0, 80)
  const role = body.role === 'admin' ? 'admin' : 'employee'
  if (name.length < 2 || name.length > 80) throw new HttpError(400, 'Enter the full name.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid work email.')

  const db = admin()
  const temp = temporaryPassword()
  const { data: created, error } = await db.auth.admin.createUser({ email, password: temp, email_confirm: true, user_metadata: { name } })
  if (error || !created.user) throw new HttpError(409, error?.message.includes('already') ? 'An account with this email already exists.' : error?.message ?? 'Could not create the account.')
  const { data: profile, error: profileError } = await db.from('profiles')
    .insert({ id: created.user.id, email, name, title, role, must_change_password: true })
    .select('*').single()
  if (profileError) {
    await db.auth.admin.deleteUser(created.user.id)
    throw new HttpError(500, 'Could not create the account profile.')
  }
  // Returned exactly once so the admin can hand it over; it is never stored in clear.
  return json({ user: publicUser(profile as Profile), temporary_password: temp })
})

export const PATCH = route(async (request) => {
  const me = await requireUser(request, { admin: true })
  const id = new URL(request.url).searchParams.get('id') ?? ''
  const body = await readJson<{ active?: boolean; reset_password?: boolean }>(request)
  if (id === me.id && body.active === false) throw new HttpError(400, 'You cannot deactivate your own account.')
  const db = admin()
  const { data: target } = await db.from('profiles').select('*').eq('id', id).maybeSingle()
  if (!target) throw new HttpError(404, 'User not found.')

  let temp: string | null = null
  if (typeof body.active === 'boolean') {
    // Banning in Supabase Auth also blocks new sign-ins and token refreshes, not just our API.
    await db.auth.admin.updateUserById(id, { ban_duration: body.active ? 'none' : '876000h' })
    await db.from('profiles').update({ active: body.active }).eq('id', id)
  }
  if (body.reset_password) {
    temp = temporaryPassword()
    await db.auth.admin.updateUserById(id, { password: temp })
    await db.auth.admin.signOut(id).catch(() => undefined)
    await db.from('profiles').update({ must_change_password: true }).eq('id', id)
  }
  const { data } = await db.from('profiles').select('*').eq('id', id).single()
  return json({ user: publicUser(data as Profile), temporary_password: temp })
})
