import { statusPayload } from '../_lib/attendance.js'
import { admin, clientIp, requireUser, json, route } from '../_lib/server.js'

export const GET = route(async (request) => {
  const user = await requireUser(request)
  return json(await statusPayload(admin(), user, clientIp(request)))
})
