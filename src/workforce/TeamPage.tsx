import { FormEvent, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Copy, KeyRound, Loader2, UserPlus, UserX, UserCheck, X } from 'lucide-react'
import { AttendanceDay, User, api, formatMinutes, formatTime } from './api'

type BoardRow = { user: User; record: AttendanceDay | null; rejected_attempts: number; offsite_signals: number }

function todayIso() {
  return new Date().toLocaleDateString('en-CA')
}

export function TeamPage({ onToast }: { onToast: (msg: string) => void }) {
  const [day, setDay] = useState(todayIso)
  const [board, setBoard] = useState<{ office: string; people: BoardRow[] } | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [b, u] = await Promise.all([
        api<{ office: string; people: BoardRow[] }>(`/admin/attendance?day=${day}`),
        api<{ users: User[] }>('/admin/users'),
      ])
      setBoard(b)
      setUsers(u.users)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the team.')
    }
  }, [day])

  useEffect(() => { void load() }, [load])

  const present = board?.people.filter((p) => p.record).length ?? 0
  const onSiteNow = board?.people.filter((p) => p.record?.status === 'checked_in').length ?? 0
  const flagged = board?.people.filter((p) => p.rejected_attempts > 0 || p.offsite_signals > 0).length ?? 0
  const totalMinutes = board?.people.reduce((sum, p) => sum + (p.record?.verified_minutes ?? 0), 0) ?? 0

  async function update(user: User, body: { active?: boolean; reset_password?: boolean }) {
    try {
      const data = await api<{ user: User; temporary_password: string | null }>(`/admin/users/${user.id}`, { method: 'PATCH', body })
      if (data.temporary_password) setSecret({ name: user.name, email: user.email, password: data.temporary_password })
      else onToast(`${user.name} is now ${data.user.active ? 'active' : 'deactivated'}.`)
      void load()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Update failed.')
    }
  }

  return (
    <main className="workspace-page team-page">
      <header className="workspace-heading">
        <div>
          <span className="section-label"><i>TM / 08</i>CEO console</span>
          <h1>Team &amp; attendance</h1>
          <p>Verified on-site presence for every employee, plus account management. Refused or off-site attempts are flagged automatically.</p>
        </div>
        <div className="workspace-actions">
          <label className="date-control"><input type="date" value={day} max={todayIso()} onChange={(e) => setDay(e.target.value)} aria-label="Attendance day" /></label>
          <button className="primary-action" onClick={() => setCreating(true)}><UserPlus size={15} /> Add employee</button>
        </div>
      </header>

      <div className="stat-strip">
        <div><span>Present</span><strong>{present}/{board?.people.length ?? 0}</strong><small>checked in on site</small></div>
        <div><span>In the office now</span><strong>{onSiteNow}</strong><small>{board?.office ?? 'Office network'}</small></div>
        <div><span>Verified hours</span><strong>{formatMinutes(totalMinutes)}</strong><small>all employees</small></div>
        <div><span>Flags</span><strong>{flagged}</strong><small className={flagged ? 'negative-text' : ''}>{flagged ? 'off-site attempts' : 'none today'}</small></div>
      </div>

      {error && <div className="auth-error" role="alert">{error}</div>}

      <section className="workspace-card team-table">
        <div className="team-row team-head"><span>Employee</span><span>Status</span><span>In</span><span>Out</span><span>Verified</span><span>Flags</span><span /></div>
        {(board?.people ?? []).map(({ user, record, rejected_attempts, offsite_signals }) => (
          <div className="team-row" key={user.id}>
            <span className="team-person">
              <span className="customer-monogram">{user.initials}</span>
              <span><strong>{user.name}</strong><small>{user.title || user.email}</small></span>
            </span>
            <span>
              <em className={`team-status ${record ? record.status : 'absent'}`}>
                {record ? (record.status === 'checked_in' ? 'On site' : 'Left') : 'Absent'}
              </em>
            </span>
            <span>{formatTime(record?.check_in_at)}</span>
            <span>{formatTime(record?.check_out_at)}</span>
            <span className="team-hours">{formatMinutes(record?.verified_minutes ?? 0)}</span>
            <span>
              {rejected_attempts + offsite_signals > 0
                ? <em className="team-flag" title={`${rejected_attempts} refused check-ins, ${offsite_signals} off-site signals`}><AlertTriangle size={12} /> {rejected_attempts + offsite_signals}</em>
                : <small className="text-muted">—</small>}
            </span>
            <span className="team-actions">
              <button title="Reset password" onClick={() => void update(user, { reset_password: true })}><KeyRound size={14} /></button>
            </span>
          </div>
        ))}
        {!board && <div className="empty-state"><Loader2 className="spin" size={20} /></div>}
      </section>

      <section className="workspace-card team-accounts">
        <h3>Accounts</h3>
        {users.map((user) => (
          <div className="team-account" key={user.id}>
            <span className="customer-monogram">{user.initials}</span>
            <span><strong>{user.name}</strong><small>{user.email} · {user.role === 'admin' ? 'Admin' : 'Employee'}{user.must_change_password ? ' · awaiting first sign-in' : ''}</small></span>
            <em className={`team-status ${user.active ? 'checked_in' : 'absent'}`}>{user.active ? 'Active' : 'Deactivated'}</em>
            {user.role !== 'admin' && (
              <button className="btn btn--outline btn--sm" onClick={() => void update(user, { active: !user.active })}>
                {user.active ? <><UserX size={13} /> Deactivate</> : <><UserCheck size={13} /> Reactivate</>}
              </button>
            )}
          </div>
        ))}
      </section>

      {creating && <CreateEmployee onClose={() => setCreating(false)} onCreated={(name, email, password) => { setCreating(false); setSecret({ name, email, password }); void load() }} />}
      {secret && <TempPassword secret={secret} onClose={() => setSecret(null)} onToast={onToast} />}
    </main>
  )
}

function CreateEmployee({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, email: string, password: string) => void }) {
  const [form, setForm] = useState({ name: '', email: '', title: '', role: 'employee' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api<{ user: User; temporary_password: string }>('/admin/users', { body: form })
      onCreated(data.user.name, data.user.email, data.temporary_password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Add employee">
      <button className="modal-backdrop" aria-label="Close" onClick={onClose} />
      <form className="modal-card" onSubmit={submit}>
        <header><h2>Add an employee</h2><button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <label className="auth-field"><span>Full name</span><div><input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div></label>
        <label className="auth-field"><span>Work email</span><div><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div></label>
        <label className="auth-field"><span>Job title</span><div><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div></label>
        <label className="auth-field"><span>Role</span><div>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="employee">Employee</option>
            <option value="admin">Admin (full access)</option>
          </select>
        </div></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary-action auth-submit" disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : 'Create account'}</button>
      </form>
    </div>
  )
}

function TempPassword({ secret, onClose, onToast }: { secret: { name: string; email: string; password: string }; onClose: () => void; onToast: (msg: string) => void }) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Temporary password">
      <button className="modal-backdrop" aria-label="Close" onClick={onClose} />
      <div className="modal-card">
        <header><h2>Temporary password for {secret.name}</h2><button onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        <p className="text-muted">Give this to {secret.email} in person or over a secure channel. It's shown only once, and they must replace it at first sign-in.</p>
        <div className="secret-box">
          <code>{secret.password}</code>
          <button className="btn btn--outline btn--sm" onClick={() => { void navigator.clipboard.writeText(secret.password).then(() => onToast('Temporary password copied.')) }}><Copy size={13} /> Copy</button>
        </div>
        <button className="primary-action auth-submit" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
