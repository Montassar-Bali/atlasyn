import { SupabaseClient } from '@supabase/supabase-js'
import { HEARTBEAT_MAX_GAP_SECONDS, OFFICE_LABEL, Profile, isOnSite, today } from './server.js'

type DayRow = {
  id: string
  user_id: string
  day: string
  check_in_at: string
  check_in_ip: string
  check_out_at: string | null
  check_out_ip: string | null
  last_seen_at: string
  verified_seconds: number
}

export function dayPublic(row: DayRow | null) {
  if (!row) return null
  return {
    day: row.day,
    check_in_at: row.check_in_at,
    check_out_at: row.check_out_at,
    last_seen_at: row.last_seen_at,
    verified_minutes: Math.floor(row.verified_seconds / 60),
    status: row.check_out_at ? 'checked_out' : 'checked_in',
  }
}

export async function getDay(db: SupabaseClient, userId: string, day = today()): Promise<DayRow | null> {
  const { data } = await db.from('attendance_days').select('*').eq('user_id', userId).eq('day', day).maybeSingle<DayRow>()
  return data
}

export async function recordEvent(db: SupabaseClient, user: Profile, kind: string, ip: string, onSite: boolean, accepted: boolean, reason: string, userAgent: string) {
  await db.from('attendance_events').insert({
    user_id: user.id, day: today(), kind, ip, on_site: onSite, accepted, reason, user_agent: userAgent.slice(0, 300),
  })
}

/** Credit time since the last on-site signal, capped so time away from the office never counts. */
export async function accrue(db: SupabaseClient, row: DayRow) {
  const gap = Math.max(0, Math.min((Date.now() - new Date(row.last_seen_at).getTime()) / 1000, HEARTBEAT_MAX_GAP_SECONDS))
  await db.from('attendance_days')
    .update({ verified_seconds: row.verified_seconds + Math.floor(gap), last_seen_at: new Date().toISOString() })
    .eq('id', row.id)
}

export async function statusPayload(db: SupabaseClient, user: Profile, ip: string) {
  const day = today()
  const [{ data: events }, { data: history }, todayRow] = await Promise.all([
    db.from('attendance_events').select('kind, at, on_site, accepted, reason')
      .eq('user_id', user.id).eq('day', day).neq('kind', 'heartbeat').order('at'),
    db.from('attendance_days').select('*').eq('user_id', user.id).order('day', { ascending: false }).limit(14),
    getDay(db, user.id, day),
  ])
  const onSite = isOnSite(ip)
  return {
    on_site: onSite,
    network_label: onSite ? OFFICE_LABEL : 'Outside the office network',
    ip,
    today: dayPublic(todayRow),
    events: events ?? [],
    history: (history ?? []).map((h) => dayPublic(h as DayRow)),
    heartbeat_seconds: 60,
  }
}
