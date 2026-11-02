import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Copy, Hand, Link2, Loader2, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Plus, SendHorizontal,
  SmilePlus, Users, Video, VideoOff, X,
} from 'lucide-react'
import { api } from '../workforce/api'
import { useAuth } from '../workforce/AuthGate'
import { Participant, PeerState, openLocalMedia, useMeeting } from './useMeeting'

type MeetingSummary = { code: string; title: string; host: string; created_at: string; participants: { id: string; name: string; initials: string }[] }

const REACTIONS = ['👍', '👏', '🎉', '❤️', '😂', '😮']

function MediaVideo({ stream, muted, mirrored, className }: { stream: MediaStream | null; muted?: boolean; mirrored?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream
  }, [stream])
  return <video ref={ref} className={`${className ?? ''} ${mirrored ? 'mirrored' : ''}`} autoPlay playsInline muted={muted} />
}

/** Pre-join lobby: device preview, start a meeting, or join by code. */
export function MeetPage({ initialCode, onToast }: { initialCode?: string; onToast: (msg: string) => void }) {
  const { user } = useAuth()
  const [media, setMedia] = useState<MediaStream | null>(null)
  const [mediaError, setMediaError] = useState('')
  const [mic, setMic] = useState(true)
  const [cam, setCam] = useState(true)
  const [meetings, setMeetings] = useState<MeetingSummary[]>([])
  const [title, setTitle] = useState('Team sync')
  const [code, setCode] = useState(initialCode ?? '')
  const [joined, setJoined] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    void openLocalMedia().then((result) => { stream = result.stream; setMedia(result.stream); setMediaError(result.error) })
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])

  const loadMeetings = useCallback(() => {
    void api<{ meetings: MeetingSummary[] }>('/meetings').then((d) => setMeetings(d.meetings)).catch(() => undefined)
  }, [])
  useEffect(() => { loadMeetings(); const t = window.setInterval(loadMeetings, 10_000); return () => window.clearInterval(t) }, [loadMeetings])

  useEffect(() => { media?.getAudioTracks().forEach((t) => { t.enabled = mic }) }, [media, mic])
  useEffect(() => { media?.getVideoTracks().forEach((t) => { t.enabled = cam }) }, [media, cam])

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const data = await api<{ code: string }>('/meetings', { body: { title } })
      setJoined(data.code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the meeting.')
    } finally { setBusy(false) }
  }

  async function join(target: string) {
    const clean = target.trim().toLowerCase().replace(/^.*[?&]meet=/, '')
    if (!clean) return
    setBusy(true)
    setError('')
    try {
      await api(`/meetings/${encodeURIComponent(clean)}`)
      setJoined(clean)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Meeting not found.')
    } finally { setBusy(false) }
  }

  if (joined && media) {
    return <MeetingRoom code={joined} localStream={media} initial={{ mic, cam }} onLeave={() => { setJoined(null); loadMeetings() }} onToast={onToast} />
  }

  const hasVideo = Boolean(media?.getVideoTracks().length)
  return (
    <main className="workspace-page meet-lobby">
      <header className="workspace-heading">
        <div>
          <span className="section-label"><i>MT / 09</i>Atlasyn Meet</span>
          <h1>Meet face to face, <em className="serif-accent">securely.</em></h1>
          <p>Video meetings for Atlasyn employees and leadership. Only signed-in colleagues can join, and calls are encrypted end to end between participants.</p>
        </div>
      </header>

      <section className="lobby-grid">
        <div className="lobby-preview">
          {hasVideo && cam
            ? <MediaVideo stream={media} muted mirrored className="lobby-video" />
            : <div className="lobby-avatar"><span>{user.initials}</span><small>{media ? (mediaError || 'Camera is off') : 'Starting camera…'}</small></div>}
          <div className="lobby-name">{user.name}</div>
          <div className="lobby-toggles">
            <button className={mic ? '' : 'off'} onClick={() => setMic(!mic)} aria-label={mic ? 'Mute microphone' : 'Unmute microphone'}>{mic ? <Mic size={20} /> : <MicOff size={20} />}</button>
            <button className={cam ? '' : 'off'} onClick={() => setCam(!cam)} aria-label={cam ? 'Turn camera off' : 'Turn camera on'}>{cam ? <Video size={20} /> : <VideoOff size={20} />}</button>
          </div>
        </div>

        <div className="lobby-actions">
          <form className="workspace-card lobby-card" onSubmit={create}>
            <h3>Start a new meeting</h3>
            <label className="auth-field"><span>Meeting name</span><div><input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></div></label>
            <button className="primary-action" disabled={busy || !media}><Plus size={16} /> New meeting</button>
          </form>
          <form className="workspace-card lobby-card" onSubmit={(e) => { e.preventDefault(); void join(code) }}>
            <h3>Join with a code</h3>
            <label className="auth-field"><span>Code or link</span><div><Link2 size={16} /><input value={code} placeholder="abc-defg-hij" onChange={(e) => setCode(e.target.value)} /></div></label>
            <button className="secondary-action" disabled={busy || !code.trim() || !media}>Join</button>
          </form>
          {error && <div className="auth-error" role="alert">{error}</div>}
        </div>
      </section>

      <section className="workspace-card meeting-list">
        <h3>Recent meetings</h3>
        {meetings.length === 0 && <p className="text-muted">No meetings yet. Start one above.</p>}
        {meetings.map((m) => (
          <div className="meeting-row" key={m.code}>
            <span className={`meeting-dot ${m.participants.length ? 'live' : ''}`} />
            <span><strong>{m.title}</strong><small>{m.code} · hosted by {m.host}</small></span>
            <span className="meeting-people">
              {m.participants.slice(0, 4).map((p) => <i key={p.id} title={p.name}>{p.initials}</i>)}
              {m.participants.length ? <small>{m.participants.length} in call</small> : <small>Empty</small>}
            </span>
            <button className={m.participants.length ? 'primary-action' : 'secondary-action'} disabled={!media} onClick={() => void join(m.code)}>Join</button>
          </div>
        ))}
      </section>
    </main>
  )
}

function useElapsed(since: string) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

type Tile = { id: string; name: string; initials: string; stream: MediaStream | null; state: PeerState; speaking: boolean; self: boolean; title?: string }

function ParticipantTile({ tile, large }: { tile: Tile; large?: boolean }) {
  const showVideo = tile.stream && (tile.state.cam || tile.state.screen) && tile.stream.getVideoTracks().length > 0
  return (
    <div className={`meet-tile ${tile.speaking ? 'speaking' : ''} ${large ? 'large' : ''}`}>
      {showVideo
        ? <MediaVideo stream={tile.stream} muted={tile.self} mirrored={tile.self && !tile.state.screen} className={tile.state.screen ? 'contain' : ''} />
        : <div className="meet-tile-avatar"><span>{tile.initials}</span></div>}
      {tile.state.hand && <span className="meet-hand"><Hand size={15} /> Hand raised</span>}
      <div className="meet-tile-label">
        {!tile.state.mic && <MicOff size={13} />}
        <span>{tile.self ? `${tile.name} (You)` : tile.name}</span>
        {tile.state.screen && <em>Presenting</em>}
      </div>
    </div>
  )
}

function MeetingRoom({ code, localStream, initial, onLeave, onToast }: { code: string; localStream: MediaStream; initial: { mic: boolean; cam: boolean }; onLeave: () => void; onToast: (msg: string) => void }) {
  const { user } = useAuth()
  const meeting = useMeeting(code, localStream, initial)
  const [panel, setPanel] = useState<'chat' | 'people' | null>(null)
  const [reactionsOpen, setReactionsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [unread, setUnread] = useState(0)
  const elapsed = useElapsed(meeting.startedAt)
  const chatEnd = useRef<HTMLDivElement>(null)
  const seen = useRef(0)

  useEffect(() => {
    const fresh = meeting.messages.length - seen.current
    if (panel === 'chat') { seen.current = meeting.messages.length; setUnread(0) } else if (fresh > 0) setUnread(fresh)
    chatEnd.current?.scrollIntoView({ block: 'end' })
  }, [meeting.messages, panel])

  const tiles: Tile[] = useMemo(() => [
    {
      id: 'self', name: user.name, initials: user.initials, self: true, speaking: meeting.localSpeaking, state: meeting.local,
      stream: meeting.screenStream ?? localStream,
    },
    ...meeting.peers.map((p: Participant) => ({ id: p.id, name: p.name, initials: p.initials, stream: p.stream, state: p.state, speaking: p.speaking, self: false, title: p.title })),
  ], [user, meeting.localSpeaking, meeting.local, meeting.screenStream, localStream, meeting.peers])

  const presenter = tiles.find((t) => t.state.screen)
  const shareLink = `${location.origin}/?meet=${code}`

  function leave() {
    localStream.getTracks().forEach((t) => { t.enabled = true })
    onLeave()
  }

  if (meeting.status === 'full' || meeting.status === 'error' || meeting.status === 'ended') {
    return (
      <div className="meet-room meet-ended">
        <div>
          <h2>{meeting.status === 'full' ? 'This meeting is full' : meeting.status === 'ended' ? 'You left the meeting' : "Couldn't join the meeting"}</h2>
          <p>{meeting.status === 'full' ? 'Up to 8 people can join a call.' : meeting.status === 'error' ? 'Your session may have expired. Sign in again and retry.' : 'The connection to the meeting server closed.'}</p>
          <button className="primary-action" onClick={leave}>Back to meetings</button>
        </div>
      </div>
    )
  }

  return (
    <div className="meet-room" role="dialog" aria-label={`Meeting ${meeting.title}`}>
      <header className="meet-topbar">
        <span className="brand-lockup"><img src="/atlasyn-logo.png" alt="" /></span>
        <div className="meet-title">
          <strong>{meeting.title || 'Connecting…'}</strong>
          <span>{elapsed} · {tiles.length} {tiles.length === 1 ? 'person' : 'people'}</span>
        </div>
        <button className="meet-code" onClick={() => { void navigator.clipboard.writeText(shareLink).then(() => onToast('Meeting link copied.')) }}>
          <Copy size={14} /> {code}
        </button>
        <span className="meet-secure"><span className="live-pulse" /> Encrypted</span>
      </header>

      <div className={`meet-body ${panel ? 'with-panel' : ''}`}>
        <section className={`meet-stage ${presenter ? 'spotlight' : ''}`} data-count={Math.min(tiles.length, 9)}>
          {meeting.status === 'connecting' && <div className="meet-connecting"><Loader2 className="spin" size={22} /> Joining…</div>}
          {presenter && <ParticipantTile tile={presenter} large />}
          <div className={presenter ? 'meet-filmstrip' : 'meet-grid'}>
            {tiles.filter((t) => t !== presenter).map((tile) => <ParticipantTile key={tile.id} tile={tile} />)}
          </div>
          {tiles.length === 1 && meeting.status === 'live' && (
            <div className="meet-invite">
              <strong>You're the only one here</strong>
              <span>Share the link so colleagues can join.</span>
              <button className="secondary-action" onClick={() => { void navigator.clipboard.writeText(shareLink).then(() => onToast('Meeting link copied.')) }}><Copy size={14} /> Copy invite link</button>
            </div>
          )}
          <div className="meet-reactions" aria-live="polite">
            {meeting.reactions.map((r) => <span key={r.key} style={{ left: `${10 + (parseInt(r.key.slice(-2), 36) % 80)}%` }}>{r.emoji}<small>{r.name.split(' ')[0]}</small></span>)}
          </div>
        </section>

        {panel && (
          <aside className="meet-panel">
            <header>
              <h3>{panel === 'chat' ? 'In-call messages' : `People (${tiles.length})`}</h3>
              <button onClick={() => setPanel(null)} aria-label="Close panel"><X size={16} /></button>
            </header>
            {panel === 'chat' ? (
              <>
                <div className="meet-chat">
                  <p className="meet-chat-note">Messages are visible to everyone in the call and disappear when it ends.</p>
                  {meeting.messages.map((m) => (
                    <div key={m.id} className={`meet-msg ${m.from === meeting.selfId ? 'mine' : ''}`}>
                      <span><strong>{m.from === meeting.selfId ? 'You' : m.name}</strong> {new Date(m.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      <p>{m.text}</p>
                    </div>
                  ))}
                  <div ref={chatEnd} />
                </div>
                <form className="meet-chat-input" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { meeting.sendChat(draft); setDraft('') } }}>
                  <input value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} placeholder="Send a message" aria-label="Message" />
                  <button aria-label="Send" disabled={!draft.trim()}><SendHorizontal size={16} /></button>
                </form>
              </>
            ) : (
              <div className="meet-people">
                {tiles.map((t) => (
                  <div key={t.id}>
                    <span className="customer-monogram">{t.initials}</span>
                    <span><strong>{t.self ? `${t.name} (You)` : t.name}</strong><small>{t.self ? user.title : t.title}</small></span>
                    {t.state.hand && <Hand size={15} className="meet-people-hand" />}
                    {t.state.mic ? <Mic size={15} /> : <MicOff size={15} className="muted" />}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="meet-dock">
        <span className="meet-dock-time">{new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {code}</span>
        <div className="meet-controls">
          <button className={meeting.local.mic ? '' : 'off'} onClick={meeting.toggleMic} aria-label={meeting.local.mic ? 'Mute' : 'Unmute'} title={meeting.local.mic ? 'Mute' : 'Unmute'}>{meeting.local.mic ? <Mic size={20} /> : <MicOff size={20} />}</button>
          <button className={meeting.local.cam ? '' : 'off'} onClick={meeting.toggleCam} aria-label={meeting.local.cam ? 'Camera off' : 'Camera on'} title={meeting.local.cam ? 'Turn camera off' : 'Turn camera on'}>{meeting.local.cam ? <Video size={20} /> : <VideoOff size={20} />}</button>
          <button className={meeting.local.screen ? 'active' : ''} onClick={() => void meeting.toggleScreenShare()} aria-label="Present screen" title="Present your screen"><MonitorUp size={20} /></button>
          <button className={meeting.local.hand ? 'active' : ''} onClick={meeting.toggleHand} aria-label="Raise hand" title="Raise hand"><Hand size={20} /></button>
          <div className="meet-reaction-picker">
            <button className={reactionsOpen ? 'active' : ''} onClick={() => setReactionsOpen(!reactionsOpen)} aria-label="Send a reaction" title="Reactions"><SmilePlus size={20} /></button>
            {reactionsOpen && (
              <div className="meet-reaction-menu">
                {REACTIONS.map((emoji) => <button key={emoji} onClick={() => { meeting.sendReaction(emoji); setReactionsOpen(false) }}>{emoji}</button>)}
              </div>
            )}
          </div>
          <button className="meet-leave" onClick={leave} aria-label="Leave call" title="Leave call"><PhoneOff size={20} /></button>
        </div>
        <div className="meet-side-controls">
          <button className={panel === 'people' ? 'active' : ''} onClick={() => setPanel(panel === 'people' ? null : 'people')} aria-label="People"><Users size={19} /><b>{tiles.length}</b></button>
          <button className={panel === 'chat' ? 'active' : ''} onClick={() => setPanel(panel === 'chat' ? null : 'chat')} aria-label="Chat"><MessageSquare size={19} />{unread > 0 && <b className="unread">{unread}</b>}</button>
        </div>
      </footer>
    </div>
  )
}
