import { supabase } from '../lib/supabase'

export type User = {
  id: string
  email: string
  name: string
  title: string
  role: 'admin' | 'employee'
  must_change_password: boolean
  active: boolean
  initials: string
}

export type AttendanceDay = {
  day: string
  check_in_at: string
  check_out_at: string | null
  last_seen_at: string
  verified_minutes: number
  status: 'checked_in' | 'checked_out'
}

export type AttendanceEvent = { kind: string; at: string; on_site: boolean; accepted: boolean; reason: string }

export type AttendanceStatus = {
  on_site: boolean
  network_label: string
  ip: string
  today: AttendanceDay | null
  events: AttendanceEvent[]
  history: AttendanceDay[]
  heartbeat_seconds: number
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** JSON request to the Atlasyn Vercel functions, authenticated with the signed-in user's Supabase token. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const response = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.'
    throw new ApiError(response.status, detail)
  }
  return data as T
}

export function formatTime(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
