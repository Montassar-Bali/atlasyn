import { FormEvent, ReactNode, Suspense, createContext, lazy, useCallback, useContext, useEffect, useState } from 'react'
import { ArrowRight, KeyRound, Loader2, LockKeyhole, Mail, ShieldCheck, Wifi } from 'lucide-react'
import { ApiError, User, api } from './api'

const HeroScene = lazy(() => import('../hero3d/HeroScene'))

type AuthValue = { user: User; signOut: () => Promise<void>; refresh: () => Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthGate>')
  return value
}

/** Shows sign-in (and the forced first-password change) until there is a fully active session. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>('loading')

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: User }>('/auth/me')
      setUser(data.user)
      setState('ready')
    } catch (error) {
      setUser(null)
      setState(error instanceof ApiError && error.status === 401 ? 'ready' : 'offline')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
  }, [])

  if (state === 'loading') return <div className="auth-loading"><Loader2 className="spin" size={22} /></div>
  if (!user) return <LoginScreen offline={state === 'offline'} onSignedIn={(u) => { setUser(u); setState('ready') }} onRetry={refresh} />
  if (user.must_change_password) return <ChangePasswordScreen user={user} onDone={setUser} onSignOut={signOut} />
  return <AuthContext.Provider value={{ user, signOut, refresh }}>{children}</AuthContext.Provider>
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <section className="auth-visual" aria-hidden="true">
        <div className="auth-visual-copy">
          <span className="brand-lockup"><img src="/atlasyn-logo.png" alt="" /><span><strong>ATLASYN</strong><small>Insight</small></span></span>
          <h1>Your company,<br /><em>in one place.</em></h1>
          <p>Executive intelligence, verified attendance and team meetings, all behind one secure sign-in.</p>
          <ul>
            <li><ShieldCheck size={15} /> Sessions are encrypted and expire after 12 hours</li>
            <li><Wifi size={15} /> Check-in only works from the office network</li>
          </ul>
        </div>
        <div className="auth-avatar">
          <Suspense fallback={null}><HeroScene reactKey={0} /></Suspense>
        </div>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  )
}

function LoginScreen({ offline, onSignedIn, onRetry }: { offline: boolean; onSignedIn: (user: User) => void; onRetry: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api<{ user: User }>('/auth/login', { body: { email, password } })
      onSignedIn(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={submit}>
        <span className="section-label"><i>SECURE</i>Employee sign-in</span>
        <h2>Welcome back</h2>
        <p>Sign in with the company account your administrator created for you.</p>
        {offline && (
          <div className="auth-error" role="alert">
            The Atlasyn server isn't reachable. <button type="button" onClick={onRetry}>Retry</button>
          </div>
        )}
        <label className="auth-field">
          <span>Work email</span>
          <div><Mail size={16} /><input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@atlasyn.com" /></div>
        </label>
        <label className="auth-field">
          <span>Password</span>
          <div><LockKeyhole size={16} /><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" /></div>
        </label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary-action auth-submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={16} /> : <>Sign in <ArrowRight size={15} /></>}
        </button>
        <small className="auth-note">No account? Ask your administrator. Accounts are created by the CEO's office.</small>
      </form>
    </AuthShell>
  )
}

function ChangePasswordScreen({ user, onDone, onSignOut }: { user: User; onDone: (user: User) => void; onSignOut: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const checks = [
    { ok: next.length >= 10, label: 'At least 10 characters' },
    { ok: /[a-z]/.test(next) && /[A-Z]/.test(next), label: 'Upper and lower case' },
    { ok: /\d/.test(next), label: 'At least one number' },
    { ok: next.length > 0 && next === confirm, label: 'Passwords match' },
  ]

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!checks.every((c) => c.ok)) { setError('Your new password does not meet every rule yet.'); return }
    setBusy(true)
    setError('')
    try {
      const data = await api<{ user: User }>('/auth/change-password', { body: { current_password: current, new_password: next } })
      onDone(data.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <form className="auth-card" onSubmit={submit}>
        <span className="section-label"><i>STEP 2</i>Secure your account</span>
        <h2>Hi {user.name.split(' ')[0]}, set your password</h2>
        <p>You signed in with a temporary password. Choose your own to continue.</p>
        <label className="auth-field">
          <span>Temporary password</span>
          <div><KeyRound size={16} /><input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
        </label>
        <label className="auth-field">
          <span>New password</span>
          <div><LockKeyhole size={16} /><input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} /></div>
        </label>
        <label className="auth-field">
          <span>Confirm new password</span>
          <div><LockKeyhole size={16} /><input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        </label>
        <ul className="password-rules">
          {checks.map((c) => <li key={c.label} className={c.ok ? 'ok' : ''}>{c.label}</li>)}
        </ul>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="primary-action auth-submit" disabled={busy}>
          {busy ? <Loader2 className="spin" size={16} /> : <>Save and continue <ArrowRight size={15} /></>}
        </button>
        <button type="button" className="ghost-action" onClick={onSignOut}>Sign out</button>
      </form>
    </AuthShell>
  )
}
