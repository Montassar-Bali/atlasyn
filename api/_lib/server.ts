/**
 * Shared server helpers for the Atlasyn Vercel functions.
 *
 * Attendance is verified here, on the server: the caller's network address comes from Vercel's
 * edge (which overwrites X-Forwarded-For / X-Real-IP, so a browser cannot spoof it) and is checked
 * against ATLASYN_OFFICE_NETWORKS. Nothing the browser sends can claim to be "on site".
 */
import { BlockList, isIP } from 'node:net'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type Profile = {
  id: string
  email: string
  name: string
  title: string
  role: 'admin' | 'employee'
  must_change_password: boolean
  active: boolean
  created_at: string
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

export const OFFICE_LABEL = process.env.ATLASYN_OFFICE_LABEL ?? 'ATLASYN HQ network'
export const COMPANY_TZ = process.env.ATLASYN_TIMEZONE ?? 'Africa/Tunis'
/** Longest gap between presence signals that still counts as worked time. */
export const HEARTBEAT_MAX_GAP_SECONDS = 6 * 60

/** Service-role client: bypasses RLS, so it must only ever run on the server. */
export function admin(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new HttpError(500, 'Server is missing its Supabase configuration.')
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Anonymous client, used only to re-check a password during a password change. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

function officeNetworks(): BlockList {
  const list = new BlockList()
  // Unset means "no office configured": in local development only this machine counts as on site.
  const raw = process.env.ATLASYN_OFFICE_NETWORKS ?? '127.0.0.1/32,::1/128'
  for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [address, prefix] = entry.split('/')
    const family = isIP(address) === 6 ? 'ipv6' : 'ipv4'
    const bits = prefix ? Number(prefix) : family === 'ipv6' ? 128 : 32
    if (isIP(address) && Number.isInteger(bits)) list.addSubnet(address, bits, family)
  }
  return list
}

export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim()
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = real || forwarded || '0.0.0.0'
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}

export function isOnSite(ip: string): boolean {
  const family = isIP(ip)
  if (!family) return false
  return officeNetworks().check(ip, family === 6 ? 'ipv6' : 'ipv4')
}

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COMPANY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

export function publicUser(p: Profile) {
  return { ...p, initials: initials(p.name) }
}

/** The signed-in caller, from the Supabase access token in the Authorization header. */
export async function requireUser(request: Request, opts: { allowPasswordChange?: boolean; admin?: boolean } = {}): Promise<Profile> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Please sign in.')
  const db = admin()
  const { data: auth, error } = await db.auth.getUser(token)
  if (error || !auth.user) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  const { data: profile } = await db.from('profiles').select('*').eq('id', auth.user.id).single<Profile>()
  if (!profile || !profile.active) throw new HttpError(403, 'This account is disabled.')
  if (profile.must_change_password && !opts.allowPasswordChange) throw new HttpError(403, 'Change your temporary password first.')
  if (opts.admin && profile.role !== 'admin') throw new HttpError(403, 'Admins only.')
  return profile
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/** Wraps a handler so thrown HttpErrors become JSON error responses. */
export function route(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await handler(request)
    } catch (error) {
      if (error instanceof HttpError) return json({ detail: error.message }, error.status)
      console.error(error)
      return json({ detail: 'Something went wrong. Please try again.' }, 500)
    }
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Invalid request body.')
  }
}

export function validatePassword(password: string) {
  if (password.length < 10) throw new HttpError(400, 'Use at least 10 characters.')
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, 'Mix upper and lower case letters and at least one number.')
  }
}

export function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return 'Tmp-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('') + '9'
}
