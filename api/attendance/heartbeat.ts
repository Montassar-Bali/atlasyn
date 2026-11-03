import { accrue, dayPublic, getDay, recordEvent } from '../_lib/attendance.js'
import { admin, clientIp, isOnSite, json, requireUser, route } from '../_lib/server.js'

export const POST = route(async (request) => {
  const user = await requireUser(request)
  const db = admin()
  const ip = clientIp(request)
  const onSite = isOnSite(ip)
  const row = await getDay(db, user.id)
  if (row && !row.check_out_at) {
    if (onSite) await accrue(db, row)
    // Off site: stop the clock here so the next on-site signal cannot credit the time away.
    else await db.from('attendance_days').update({ last_seen_at: new Date().toISOString() }).eq('id', row.id)
    await recordEvent(db, user, 'heartbeat', ip, onSite, onSite, onSite ? '' : 'Off the office network', request.headers.get('user-agent') ?? '')
  }
  return json({ on_site: onSite, today: dayPublic(await getDay(db, user.id)) })
})
