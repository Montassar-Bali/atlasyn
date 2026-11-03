-- ATLASYN Workforce schema: employee profiles, verified attendance, meetings.
--
-- Security model
--   * Sign-in is Supabase Auth. Accounts are created only by the server (service role) on an admin's request.
--   * Clients may READ through row-level security, but never WRITE attendance or profiles directly:
--     every write goes through the Vercel functions in /api, which check the caller's network address
--     against the office allow-list before touching these tables.
--   * Meeting signaling uses private Realtime channels "meet:<code>", open only to active employees.

create extension if not exists pgcrypto;

-- ── Profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null,
  title text not null default '',
  role text not null default 'employee' check (role in ('admin', 'employee')),
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Attendance ──────────────────────────────────────────────────────────────
create table if not exists public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  check_in_at timestamptz not null,
  check_in_ip text not null,
  check_out_at timestamptz,
  check_out_ip text,
  last_seen_at timestamptz not null,
  verified_seconds integer not null default 0,
  unique (user_id, day)
);

create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('check_in', 'check_out', 'heartbeat')),
  at timestamptz not null default now(),
  ip text not null,
  on_site boolean not null,
  accepted boolean not null,
  reason text not null default '',
  user_agent text not null default ''
);
create index if not exists attendance_events_user_day on public.attendance_events (user_id, day);
create index if not exists attendance_days_day on public.attendance_days (day);

-- ── Meetings ────────────────────────────────────────────────────────────────
create table if not exists public.meetings (
  code text primary key check (code ~ '^[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  title text not null check (char_length(title) between 1 and 80),
  host_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists meetings_created on public.meetings (created_at desc);

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so policies can check the caller's profile without recursing into profiles' own RLS.
create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and not must_change_password)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'admin')
$$;

revoke all on function public.is_active_member() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_events enable row level security;
alter table public.meetings enable row level security;

-- Profiles: you can always read your own row (needed for the first-password screen);
-- active colleagues can read the company directory (names shown in meetings).
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "members read directory" on public.profiles;
create policy "members read directory" on public.profiles for select to authenticated using (public.is_active_member());

-- Attendance: employees read their own records, admins read everyone's. No client writes at all.
drop policy if exists "read own or admin days" on public.attendance_days;
create policy "read own or admin days" on public.attendance_days for select to authenticated
  using ((user_id = auth.uid() and public.is_active_member()) or public.is_admin());
drop policy if exists "read own or admin events" on public.attendance_events;
create policy "read own or admin events" on public.attendance_events for select to authenticated
  using ((user_id = auth.uid() and public.is_active_member()) or public.is_admin());

-- Meetings: active members can list and create meetings they host.
drop policy if exists "members read meetings" on public.meetings;
create policy "members read meetings" on public.meetings for select to authenticated using (public.is_active_member());
drop policy if exists "members create meetings" on public.meetings;
create policy "members create meetings" on public.meetings for insert to authenticated
  with check (public.is_active_member() and host_id = auth.uid());

-- Clients get only what the policies allow; anonymous visitors get nothing.
revoke all on public.profiles, public.attendance_days, public.attendance_events, public.meetings from anon;
revoke insert, update, delete on public.profiles, public.attendance_days, public.attendance_events from authenticated;
revoke update, delete on public.meetings from authenticated;
grant select on public.profiles, public.attendance_days, public.attendance_events, public.meetings to authenticated;
grant insert on public.meetings to authenticated;

-- ── Realtime: private meeting channels ──────────────────────────────────────
-- Only active members may join "meet:<code>" topics, and only for meetings that exist.
drop policy if exists "members join meeting channels" on realtime.messages;
create policy "members join meeting channels" on realtime.messages for select to authenticated
  using (
    public.is_active_member()
    and exists (select 1 from public.meetings m where 'meet:' || m.code = realtime.topic())
  );
drop policy if exists "members send on meeting channels" on realtime.messages;
create policy "members send on meeting channels" on realtime.messages for insert to authenticated
  with check (
    public.is_active_member()
    and exists (select 1 from public.meetings m where 'meet:' || m.code = realtime.topic())
  );
