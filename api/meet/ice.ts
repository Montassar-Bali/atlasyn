import { json, requireUser, route } from '../_lib/server.js'

export const GET = route(async (request) => {
  await requireUser(request)
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  if (process.env.ATLASYN_TURN_URL) {
    servers.push({ urls: process.env.ATLASYN_TURN_URL, username: process.env.ATLASYN_TURN_USERNAME, credential: process.env.ATLASYN_TURN_CREDENTIAL })
  }
  return json({ iceServers: servers })
})
