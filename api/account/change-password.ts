import { HttpError, admin, anonClient, json, publicUser, readJson, requireUser, route, validatePassword } from '../_lib/server.js'

export const POST = route(async (request) => {
  const user = await requireUser(request, { allowPasswordChange: true })
  const body = await readJson<{ current_password?: string; new_password?: string }>(request)
  const current = String(body.current_password ?? '')
  const next = String(body.new_password ?? '')
  // Re-check the current password so a stolen session alone cannot take over the account.
  const { error: wrong } = await anonClient().auth.signInWithPassword({ email: user.email, password: current })
  if (wrong) throw new HttpError(400, 'Current password is incorrect.')
  if (next === current) throw new HttpError(400, 'Choose a password different from the current one.')
  validatePassword(next)
  const db = admin()
  const { error } = await db.auth.admin.updateUserById(user.id, { password: next })
  if (error) throw new HttpError(400, error.message)
  const { data } = await db.from('profiles').update({ must_change_password: false }).eq('id', user.id).select('*').single()
  return json({ user: publicUser(data) })
})
