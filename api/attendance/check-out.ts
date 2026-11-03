import { accrue, getDay, recordEvent, statusPayload } from '../_lib/attendance.js'
import { HttpError, admin, clientIp, isOnSite, json, requireUser, route } from '../_lib/server.js'

export const POST = route(async (request) => {
  const user = await requireUser(request)
  const db = admin()
  const ip = clientIp(request)
  const onSite = isOnSite(ip)
  const row = await getDay(db, user.id)
  if (!row || row.check_out_at) throw new HttpError(409, "You're not checked in.")
  if (onSite) await accrue(db, row)
  await db.from('attendance_days').update({ check_out_at: new Date().toISOString(), check_out_ip: ip }).eq('id', row.id)
  await recordEvent(db, user, 'check_out', ip, onSite, true, onSite ? '' : 'Checked out off-site; time after leaving was not counted', request.headers.get('user-agent') ?? '')
  return json(await statusPayload(db, user, ip))
})
