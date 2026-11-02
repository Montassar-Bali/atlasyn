import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, LogIn, LogOut, MapPinOff, RefreshCw, ShieldCheck, Wifi, WifiOff, XCircle } from 'lucide-react'
import { AttendanceStatus, api, formatMinutes, formatTime } from './api'
import { useAuth } from './AuthGate'

/**
 * While checked in, pings the server every minute. Time is only credited server-side
 * when the ping arrives from the office network, so closing the laptop or leaving stops the clock.
 */
export function usePresenceHeartbeat(active: boolean, onUpdate?: () => void) {
  useEffect(() => {
    if (!active) return
    const beat = () => { void api('/attendance/heartbeat', { method: 'POST' }).then(() => onUpdate?.()).catch(() => undefined) }
    const timer = window.setInterval(beat, 60_000)
    return () => window.clearInterval(timer)
  }, [active, onUpdate])
}

function eventLabel(kind: string) {
  return kind === 'check_in' ? 'Check-in' : kind === 'check_out' ? 'Check-out' : kind
}

export function AttendancePage({ onToast, onStatus }: { onToast: (msg: string) => void; onStatus: (status: AttendanceStatus) => void }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<AttendanceStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<AttendanceStatus>('/attendance/status')
      setStatus(data)
      onStatus(data)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load attendance.')
    }
  }, [onStatus])

  useEffect(() => { void load() }, [load])

  async function act(kind: 'check-in' | 'check-out') {
    setBusy(true)
    setError('')
    try {
      const data = await api<AttendanceStatus>(`/attendance/${kind}`, { method: 'POST' })
      setStatus(data)
      onStatus(data)
      onToast(kind === 'check-in' ? 'Checked in. Your on-site time is now being verified.' : 'Checked out. Have a good evening!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
      void load()
    } finally {
      setBusy(false)
    }
  }

  const today = status?.today
  const checkedIn = today?.status === 'checked_in'
  const verified = today?.verified_minutes ?? 0
  const goal = 8 * 60
  const progress = Math.min(100, (verified / goal) * 100)

  return (
    <main className="workspace-page attendance-page">
      <header className="workspace-heading">
        <div>
          <span className="section-label"><i>AT / 07</i>Verified attendance</span>
          <h1>Good to see you, {user.name.split(' ')[0]}.</h1>
          <p>Check in when you arrive. Only time spent connected to the office network counts toward your verified hours.</p>
        </div>
        <div className="workspace-actions">
          <button className="secondary-action" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>
        </div>
      </header>

      <section className="attendance-hero">
        <div className={`presence-card ${status?.on_site ? 'on-site' : 'off-site'}`}>
          <div className="presence-icon">{status?.on_site ? <Wifi size={26} /> : <WifiOff size={26} />}</div>
          <div>
            <span>Location check</span>
            <strong>{status ? (status.on_site ? 'You are at the office' : 'You are not at the office') : 'Checking…'}</strong>
            <small>{status ? `${status.network_label} · ${status.ip}` : 'Verifying your network with the server'}</small>
          </div>
          {status?.on_site ? <ShieldCheck className="presence-badge" size={20} /> : <MapPinOff className="presence-badge" size={20} />}
        </div>

        <div className="worked-card">
          <div className="worked-ring" style={{ '--p': progress } as React.CSSProperties}>
            <div>
              <strong>{formatMinutes(verified)}</strong>
              <span>verified today</span>
            </div>
          </div>
          <dl>
            <div><dt>Checked in</dt><dd>{formatTime(today?.check_in_at)}</dd></div>
            <div><dt>Checked out</dt><dd>{formatTime(today?.check_out_at)}</dd></div>
            <div><dt>Daily goal</dt><dd>{formatMinutes(goal)}</dd></div>
          </dl>
          <div className="attendance-actions">
            {checkedIn ? (
              <button className="checkout-action" disabled={busy} onClick={() => void act('check-out')}><LogOut size={17} /> Check out</button>
            ) : (
              <button className="primary-action checkin-action" disabled={busy || !status?.on_site} onClick={() => void act('check-in')}>
                <LogIn size={17} /> {today ? 'Check in again' : 'Check in'}
              </button>
            )}
            {!status?.on_site && !checkedIn && <p className="attendance-hint">Connect to the office Wi-Fi to check in.</p>}
            {checkedIn && <p className="attendance-hint"><span className="live-pulse" /> Verifying presence every minute while this app is open.</p>}
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
        </div>
      </section>

      <section className="attendance-grid">
        <div className="workspace-card">
          <h3>Today's timeline</h3>
          {status?.events.length ? (
            <ol className="timeline">
              {status.events.map((event) => (
                <li key={event.at} className={event.accepted ? 'ok' : 'rejected'}>
                  {event.accepted ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  <div>
                    <strong>{eventLabel(event.kind)} {event.accepted ? '' : 'refused'}</strong>
                    <small>{event.on_site ? 'Office network' : event.reason || 'Outside the office network'}</small>
                  </div>
                  <time>{formatTime(event.at)}</time>
                </li>
              ))}
            </ol>
          ) : <p className="text-muted">Nothing yet today.</p>}
        </div>
        <div className="workspace-card">
          <h3>Last 14 days</h3>
          <div className="history-bars">
            {(status?.history ?? []).slice().reverse().map((day) => (
              <div key={day.day} title={`${day.day}: ${formatMinutes(day.verified_minutes)}`}>
                <i style={{ height: `${Math.max(4, Math.min(100, (day.verified_minutes / goal) * 100))}%` }} />
                <span>{new Date(day.day).toLocaleDateString('en-GB', { weekday: 'narrow' })}</span>
              </div>
            ))}
            {!status?.history.length && <p className="text-muted">Your history will appear here.</p>}
          </div>
          <p className="text-muted security-explainer"><Clock3 size={14} /> Hours are measured by the server from office-network signals. Time away from the office, or with the app closed, isn't counted.</p>
        </div>
      </section>
    </main>
  )
}
