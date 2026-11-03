import { dayPublic } from '../_lib/attendance.js'
import { HttpError, OFFICE_LABEL, Profile, admin, json, publicUser, requireUser, route, today } from '../_lib/server.js'

export const GET = route(async (request) => {
  await requireUser(request, { admin: true })
  const day = new URL(request.url).searchParams.get('day') || today()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'Use YYYY-MM-DD.')
  const db = admin()
  const [{ data: people }, { data: days }, { data: events }] = await Promise.all([
    db.from('profiles').select('*').eq('active', true).order('name'),
    db.from('attendance_days').select('*').eq('day', day),
    db.from('attendance_events').select('user_id, kind, on_site, accepted').eq('day', day).or('accepted.eq.false,on_site.eq.false'),
  ])
  return json({
    day,
    office: OFFICE_LABEL,
    people: (people ?? []).map((p) => ({
      user: publicUser(p as Profile),
      record: dayPublic((days ?? []).find((d) => d.user_id === p.id) ?? null),
      rejected_attempts: (events ?? []).filter((e) => e.user_id === p.id && !e.accepted && e.kind !== 'heartbeat').length,
      offsite_signals: (events ?? []).filter((e) => e.user_id === p.id && e.kind === 'heartbeat' && !e.on_site).length,
    })),
  })
})
