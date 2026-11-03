// End-to-end security smoke test for the Supabase + Vercel workforce stack.
// Usage: DEMO_PASSWORD=... node --env-file=.env.development.local scripts/smoke-test.mjs [baseUrl]
// Signs in as the demo employee, exercises attendance, checks row-level security, then
// tests the admin API with a throwaway admin. Everything it creates is deleted at the end.
import { createClient } from '@supabase/supabase-js'

const base = process.argv[2] ?? 'http://localhost:3000'
const url = process.env.SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const demoEmail = process.env.DEMO_EMAIL ?? 'sara.demo@atlasyn.com'
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(new Date())

let failures = 0
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${cond || !extra ? '' : `  (${extra})`}`); if (!cond) failures++ }

async function signIn(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return { client, token: data.session.access_token, id: data.user.id }
}
const call = (token, path, method = 'GET', body) => fetch(`${base}/api${path}`, {
  method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }))

const cleanup = []
try {
  const emp = await signIn(demoEmail, process.env.DEMO_PASSWORD)
  ok('anonymous API call rejected', (await call(null, '/attendance/status')).status === 401)
  ok('forged token rejected', (await call('not-a-token', '/attendance/status')).status === 401)

  const status = await call(emp.token, '/attendance/status')
  ok('employee reads attendance status', status.status === 200, JSON.stringify(status.data))
  if (status.data.today?.status === 'checked_in') await call(emp.token, '/attendance/check-out', 'POST')
  const checkIn = await call(emp.token, '/attendance/check-in', 'POST')
  ok(`check-in from on-site network (${status.data.ip})`, checkIn.status === 200, JSON.stringify(checkIn.data))
  ok('double check-in refused', (await call(emp.token, '/attendance/check-in', 'POST')).status === 409)
  ok('heartbeat accepted', (await call(emp.token, '/attendance/heartbeat', 'POST')).status === 200)
  const out = await call(emp.token, '/attendance/check-out', 'POST')
  ok('check-out', out.status === 200 && out.data.today?.status === 'checked_out', JSON.stringify(out.data))
  ok('employee blocked from admin API', (await call(emp.token, '/admin/users')).status === 403)

  // Row-level security, straight against Supabase with the employee's session.
  const { error: roleError, data: roleRows } = await emp.client.from('profiles').update({ role: 'admin' }).eq('id', emp.id).select()
  ok('employee cannot promote themselves', Boolean(roleError) || !roleRows?.length)
  const { error: insertError } = await emp.client.from('attendance_days').insert({ user_id: emp.id, day: '2000-01-01', check_in_at: new Date().toISOString(), check_in_ip: '1.1.1.1', last_seen_at: new Date().toISOString(), verified_seconds: 99999 })
  ok('employee cannot write attendance directly', Boolean(insertError))
  const { data: othersDays } = await emp.client.from('attendance_days').select('user_id').neq('user_id', emp.id)
  ok("employee cannot read others' attendance", (othersDays ?? []).length === 0)
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: anonProfiles } = await anon.from('profiles').select('email')
  ok('anonymous visitor reads no profiles', (anonProfiles ?? []).length === 0)

  // Realtime: a channel for a meeting that doesn't exist must be refused.
  const code = 'zzz-test-' + 'abc'
  const subscribe = (client, topic) => new Promise((resolve) => {
    client.realtime.setAuth().then(() => {
      const ch = client.channel(topic, { config: { private: true } })
      const timer = setTimeout(() => resolve('TIMEOUT'), 10000)
      ch.subscribe((s) => { if (s !== 'CLOSED') { clearTimeout(timer); resolve(s); client.removeChannel(ch) } })
    })
  })
  ok('unknown meeting channel refused', (await subscribe(emp.client, `meet:${code}`)) !== 'SUBSCRIBED')
  const meetCode = 'tst-' + Math.random().toString(36).replace(/[^a-z]/g, '').padEnd(7, 'q').slice(0, 4) + '-ing'
  const { error: meetError } = await emp.client.from('meetings').insert({ code: meetCode, title: 'Smoke test', host_id: emp.id })
  ok('employee creates a meeting', !meetError, meetError?.message)
  cleanup.push(() => service.from('meetings').delete().eq('code', meetCode))
  ok('meeting channel opens for an employee', (await subscribe(emp.client, `meet:${meetCode}`)) === 'SUBSCRIBED')
  const { error: spoofHost } = await emp.client.from('meetings').insert({ code: 'abc-defg-hij', title: 'x', host_id: '00000000-0000-0000-0000-000000000000' })
  ok('cannot create a meeting as someone else', Boolean(spoofHost))

  // Admin API with a throwaway admin.
  const adminEmail = `smoke.admin.${Date.now()}@atlasyn.test`
  const adminPassword = 'Smoke-' + crypto.randomUUID() + 'A1'
  const { data: created } = await service.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true })
  cleanup.push(() => service.auth.admin.deleteUser(created.user.id))
  await service.from('profiles').insert({ id: created.user.id, email: adminEmail, name: 'Smoke Admin', role: 'admin', must_change_password: false })
  const adm = await signIn(adminEmail, adminPassword)
  ok('admin lists users', (await call(adm.token, '/admin/users')).status === 200)
  const board = await call(adm.token, `/admin/attendance?day=${today}`)
  ok('admin attendance board', board.status === 200 && board.data.people.some((p) => p.user.email === demoEmail))
  const newUser = await call(adm.token, '/admin/users', 'POST', { name: 'Smoke Employee', email: `smoke.emp.${Date.now()}@atlasyn.test`, title: 'Tester' })
  ok('admin creates an employee', newUser.status === 200 && newUser.data.temporary_password, JSON.stringify(newUser.data))
  if (newUser.data.user) cleanup.push(() => service.auth.admin.deleteUser(newUser.data.user.id))
  const fresh = await signIn(newUser.data.user.email, newUser.data.temporary_password)
  ok('new employee must change password first', (await call(fresh.token, '/attendance/status')).status === 403)
  const weak = await call(fresh.token, '/account/change-password', 'POST', { current_password: newUser.data.temporary_password, new_password: 'short' })
  ok('weak password refused', weak.status === 400)
  const changed = await call(fresh.token, '/account/change-password', 'POST', { current_password: newUser.data.temporary_password, new_password: 'Str0ng-Passw0rd' })
  ok('employee sets own password', changed.status === 200, JSON.stringify(changed.data))
  const deact = await call(adm.token, `/admin/users?id=${newUser.data.user.id}`, 'PATCH', { active: false })
  ok('admin deactivates an account', deact.status === 200 && deact.data.user.active === false)
  const { error: bannedLogin } = await createClient(url, anonKey, { auth: { persistSession: false } }).auth.signInWithPassword({ email: newUser.data.user.email, password: 'Str0ng-Passw0rd' })
  ok('deactivated account cannot sign in', Boolean(bannedLogin))
} catch (error) {
  failures++
  console.log('FAIL', error.message)
} finally {
  for (const fn of cleanup.reverse()) await Promise.resolve().then(fn).catch(() => undefined)
  // Leave the demo account's attendance as it was before the test.
  const { data: demo } = await service.from('profiles').select('id').eq('email', demoEmail).single()
  if (demo) {
    await service.from('attendance_events').delete().eq('user_id', demo.id).eq('day', today)
    await service.from('attendance_days').delete().eq('user_id', demo.id).eq('day', today)
  }
}
console.log(failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
