import { getDay, recordEvent, statusPayload } from '../_lib/attendance.js'
import { HttpError, admin, clientIp, isOnSite, json, requireUser, route, today } from '../_lib/server.js'

export const POST = route(async (request) => {
  const user = await requireUser(request)
  const db = admin()
  const ip = clientIp(request)
  const ua = request.headers.get('user-agent') ?? ''
  if (!isOnSite(ip)) {
    // Refused attempts are kept so the CEO console can flag them.
    await recordEvent(db, user, 'check_in', ip, false, false, 'Request did not come from the office network', ua)
    throw new HttpError(403, "Check-in refused: you're not connected to the office network.")
  }
  const existing = await getDay(db, user.id)
  if (existing && !existing.check_out_at) throw new HttpError(409, "You're already checked in.")
  const now = new Date().toISOString()
  if (existing) {
    // Returning after checking out: resume the day without crediting the time away.
    await db.from('attendance_days').update({ check_out_at: null, check_out_ip: null, last_seen_at: now }).eq('id', existing.id)
  } else {
    const { error } = await db.from('attendance_days').insert({ user_id: user.id, day: today(), check_in_at: now, check_in_ip: ip, last_seen_at: now })
    if (error) throw new HttpError(409, "You're already checked in.")
  }
  await recordEvent(db, user, 'check_in', ip, true, true, '', ua)
  return json(await statusPayload(db, user, ip))
})
