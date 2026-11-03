import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { api } from '../workforce/api'

export type PeerState = { mic: boolean; cam: boolean; screen: boolean; hand: boolean }
export type Participant = {
  id: string
  name: string
  initials: string
  role: string
  title: string
  state: PeerState
  stream: MediaStream | null
  speaking: boolean
}
export type ChatMessage = { id: string; from: string; name: string; text: string; at: string }
export type Reaction = { key: string; emoji: string; name: string }

type PresenceMeta = Omit<Participant, 'stream' | 'speaking'> & { joined_at: string }
export type SelfInfo = { name: string; initials: string; role: string; title: string }
type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

const SPEAKING_THRESHOLD = 0.04
const MAX_ROOM_SIZE = 8

/** Microphone + camera, degrading gracefully when either is unavailable or refused. */
export async function openLocalMedia(): Promise<{ stream: MediaStream; error: string }> {
  const stream = new MediaStream()
  let error = ''
  if (!navigator.mediaDevices?.getUserMedia) return { stream, error: 'This browser cannot access a camera or microphone.' }
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
    media.getTracks().forEach((t) => stream.addTrack(t))
  } catch {
    // Try each device on its own so a missing camera doesn't also cost the microphone.
    for (const kind of ['audio', 'video'] as const) {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ [kind]: true })
        media.getTracks().forEach((t) => stream.addTrack(t))
      } catch {
        error = kind === 'video' ? 'Camera unavailable or blocked.' : 'Microphone unavailable or blocked.'
      }
    }
  }
  return { stream, error }
}

/**
 * Mesh WebRTC meeting signaled over a private Supabase Realtime channel ("meet:<code>").
 * Presence says who is in the room (and their mic/camera state); broadcast carries the
 * WebRTC handshake, chat and reactions. Whoever joined later sends the offer, which avoids
 * offer collisions. Only active employees can open the channel (row-level security on realtime.messages).
 */
export function useMeeting(code: string, localStream: MediaStream, initial: { mic: boolean; cam: boolean }, me: SelfInfo) {
  const [selfId, setSelfId] = useState('')
  const [title, setTitle] = useState('')
  const [startedAt, setStartedAt] = useState<string>(new Date().toISOString())
  const [peers, setPeers] = useState<Record<string, Participant>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [status, setStatus] = useState<'connecting' | 'live' | 'full' | 'ended' | 'error'>('connecting')
  const [local, setLocal] = useState<PeerState>({ mic: initial.mic, cam: initial.cam, screen: false, hand: false })
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [localSpeaking, setLocalSpeaking] = useState(false)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const peerId = useRef(crypto.randomUUID())
  const joinedAt = useRef(new Date().toISOString())
  const pcs = useRef(new Map<string, RTCPeerConnection>())
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>())
  const remoteStreams = useRef(new Map<string, MediaStream>())
  const iceServers = useRef<RTCIceServer[]>([])
  const localRef = useRef(local)
  localRef.current = local
  const screenTrack = useRef<MediaStreamTrack | null>(null)

  const send = useCallback((message: { type: string } & Record<string, unknown>) => {
    void channelRef.current?.send({ type: 'broadcast', event: message.type, payload: { ...message, from: peerId.current } })
  }, [])

  /** Publishes our name and mic/camera/hand state to everyone in the room. */
  const track = useCallback((state: PeerState) => {
    void channelRef.current?.track({ id: peerId.current, ...me, state, joined_at: joinedAt.current } satisfies PresenceMeta)
  }, [me])

  const patchPeer = useCallback((id: string, patch: Partial<Participant>) => {
    setPeers((current) => current[id] ? { ...current, [id]: { ...current[id], ...patch } } : current)
  }, [])

  const outgoingVideo = useCallback(() => screenTrack.current ?? localStream.getVideoTracks()[0] ?? null, [localStream])

  const createPeerConnection = useCallback((peerId: string, initiator: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: iceServers.current })
    pcs.current.set(peerId, pc)
    const stream = new MediaStream()
    remoteStreams.current.set(peerId, stream)

    if (initiator) {
      // Always negotiate one audio and one video slot, even without devices, so tracks can be swapped in later.
      pc.addTransceiver(localStream.getAudioTracks()[0] ?? 'audio', { direction: 'sendrecv', streams: [localStream] })
      pc.addTransceiver(outgoingVideo() ?? 'video', { direction: 'sendrecv', streams: [localStream] })
    }
    pc.onicecandidate = ({ candidate }) => { if (candidate) send({ type: 'signal', to: peerId, data: { candidate: candidate.toJSON() } }) }
    pc.ontrack = ({ track }) => {
      stream.getTracks().filter((t) => t.kind === track.kind).forEach((t) => stream.removeTrack(t))
      stream.addTrack(track)
      patchPeer(peerId, { stream: new MediaStream(stream.getTracks()) })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce()
    }
    return pc
  }, [localStream, outgoingVideo, patchPeer, send])

  const closePeer = useCallback((peerId: string) => {
    pcs.current.get(peerId)?.close()
    pcs.current.delete(peerId)
    pendingIce.current.delete(peerId)
    remoteStreams.current.delete(peerId)
    setPeers((current) => { const next = { ...current }; delete next[peerId]; return next })
  }, [])

  const handleSignal = useCallback(async (from: string, data: Signal) => {
    let pc = pcs.current.get(from)
    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        pc = pc ?? createPeerConnection(from, false)
        await pc.setRemoteDescription(data.sdp)
        // Attach our media to the slots the offer created.
        for (const transceiver of pc.getTransceivers()) {
          const kind = transceiver.receiver.track.kind
          const track = kind === 'audio' ? localStream.getAudioTracks()[0] ?? null : outgoingVideo()
          await transceiver.sender.replaceTrack(track)
          transceiver.direction = 'sendrecv'
        }
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        send({ type: 'signal', to: from, data: { sdp: pc.localDescription } })
      } else if (pc) {
        await pc.setRemoteDescription(data.sdp)
      }
      for (const candidate of pendingIce.current.get(from) ?? []) await pc?.addIceCandidate(candidate).catch(() => undefined)
      pendingIce.current.delete(from)
    } else if (data.candidate) {
      if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => undefined)
      else pendingIce.current.set(from, [...(pendingIce.current.get(from) ?? []), data.candidate])
    }
  }, [createPeerConnection, localStream, outgoingVideo, send])

  // Connect once per meeting.
  useEffect(() => {
    let cancelled = false
    const self = peerId.current
    async function connect() {
      try {
        iceServers.current = (await api<{ iceServers: RTCIceServer[] }>('/meet/ice')).iceServers
      } catch { iceServers.current = [{ urls: 'stun:stun.l.google.com:19302' }] }
      const { data: meeting } = await supabase.from('meetings').select('title').eq('code', code).maybeSingle()
      if (cancelled) return
      if (!meeting) { setStatus('error'); return }
      setTitle(meeting.title)
      setSelfId(self)
      localStream.getAudioTracks().forEach((t) => { t.enabled = initial.mic })
      localStream.getVideoTracks().forEach((t) => { t.enabled = initial.cam })

      // Private channels authorize with the user's access token.
      await supabase.realtime.setAuth()
      const channel = supabase.channel(`meet:${code}`, {
        config: { private: true, broadcast: { self: true }, presence: { key: self } },
      })
      channelRef.current = channel

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceMeta>()
        const metas = Object.values(state).map((list) => list[0]).filter(Boolean)
        const ordered = [...metas].sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id))
        // Over capacity: the most recent arrivals step back out.
        if (ordered.findIndex((m) => m.id === self) >= MAX_ROOM_SIZE) {
          setStatus('full')
          void channel.untrack()
          return
        }
        if (ordered[0]) setStartedAt(ordered[0].joined_at)
        const others = ordered.filter((m) => m.id !== self).slice(0, MAX_ROOM_SIZE - 1)
        const present = new Set(others.map((m) => m.id))
        pcs.current.forEach((_, id) => { if (!present.has(id)) closePeer(id) })
        setPeers((current) => {
          const next: Record<string, Participant> = {}
          for (const m of others) next[m.id] = { ...current[m.id], id: m.id, name: m.name, initials: m.initials, role: m.role, title: m.title, state: m.state, stream: current[m.id]?.stream ?? null, speaking: current[m.id]?.speaking ?? false }
          return next
        })
        // The later arrival offers; ties broken by id so exactly one side starts.
        for (const m of others) {
          const iAmLater = joinedAt.current > m.joined_at || (joinedAt.current === m.joined_at && self > m.id)
          if (iAmLater && !pcs.current.has(m.id)) {
            const pc = createPeerConnection(m.id, true)
            void pc.createOffer().then(async (offer) => {
              await pc.setLocalDescription(offer)
              send({ type: 'signal', to: m.id, data: { sdp: pc.localDescription } })
            })
          }
        }
      })
      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (payload.to === self && payload.from !== self) void handleSignal(payload.from, payload.data)
      })
      channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
        const text = String(payload.text ?? '').trim().slice(0, 1000)
        if (text) setMessages((current) => [...current, { id: payload.id, from: payload.from, name: payload.name, text, at: payload.at }].slice(-200))
      })
      channel.on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const key = `${Date.now()}-${Math.random()}`
        setReactions((current) => [...current, { key, emoji: payload.emoji, name: payload.name }])
        window.setTimeout(() => setReactions((current) => current.filter((r) => r.key !== key)), 3200)
      })
      channel.subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') { setStatus('live'); track(localRef.current) }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus('error')
        else if (status === 'CLOSED') setStatus((s) => (s === 'full' ? s : 'ended'))
      })
    }
    void connect()
    return () => {
      cancelled = true
      const channel = channelRef.current
      channelRef.current = null
      if (channel) { void channel.untrack(); void supabase.removeChannel(channel) }
      pcs.current.forEach((pc) => pc.close())
      pcs.current.clear()
      screenTrack.current?.stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // Active-speaker detection from audio levels.
  useEffect(() => {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const meters = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>()
    const buffer = new Uint8Array(512)
    const level = (analyser: AnalyserNode) => {
      analyser.getByteTimeDomainData(buffer)
      let sum = 0
      for (const v of buffer) sum += ((v - 128) / 128) ** 2
      return Math.sqrt(sum / buffer.length)
    }
    const attach = (id: string, stream: MediaStream | null) => {
      if (meters.has(id) || !stream?.getAudioTracks().length) return
      const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      meters.set(id, { analyser, source })
    }
    const timer = window.setInterval(() => {
      if (ctx.state === 'suspended') void ctx.resume()
      attach('self', localStream)
      remoteStreams.current.forEach((stream, id) => attach(id, stream))
      const self = meters.get('self')
      setLocalSpeaking(Boolean(self && localRef.current.mic && level(self.analyser) > SPEAKING_THRESHOLD))
      setPeers((current) => {
        let changed = false
        const next = { ...current }
        for (const [id, peer] of Object.entries(current)) {
          const meter = meters.get(id)
          const speaking = Boolean(meter && peer.state.mic && level(meter.analyser) > SPEAKING_THRESHOLD)
          if (speaking !== peer.speaking) { next[id] = { ...peer, speaking }; changed = true }
        }
        return changed ? next : current
      })
    }, 250)
    return () => { window.clearInterval(timer); meters.forEach((m) => m.source.disconnect()); void ctx.close() }
  }, [localStream])

  const updateLocal = useCallback((patch: Partial<PeerState>) => {
    setLocal((current) => {
      const next = { ...current, ...patch }
      track(next)
      return next
    })
  }, [track])

  const toggleMic = useCallback(() => {
    const on = !localRef.current.mic
    localStream.getAudioTracks().forEach((t) => { t.enabled = on })
    updateLocal({ mic: on })
  }, [localStream, updateLocal])

  const toggleCam = useCallback(() => {
    const on = !localRef.current.cam
    localStream.getVideoTracks().forEach((t) => { t.enabled = on })
    updateLocal({ cam: on })
  }, [localStream, updateLocal])

  const swapOutgoingVideo = useCallback(async (track: MediaStreamTrack | null) => {
    for (const pc of pcs.current.values()) {
      const sender = pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender
      await sender?.replaceTrack(track).catch(() => undefined)
    }
  }, [])

  const stopScreenShare = useCallback(async () => {
    screenTrack.current?.stop()
    screenTrack.current = null
    setScreenStream(null)
    await swapOutgoingVideo(localStream.getVideoTracks()[0] ?? null)
    updateLocal({ screen: false })
  }, [localStream, swapOutgoingVideo, updateLocal])

  const toggleScreenShare = useCallback(async () => {
    if (screenTrack.current) { await stopScreenShare(); return }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const track = display.getVideoTracks()[0]
      screenTrack.current = track
      track.onended = () => { void stopScreenShare() }
      setScreenStream(display)
      await swapOutgoingVideo(track)
      updateLocal({ screen: true })
    } catch { /* the user cancelled the picker */ }
  }, [stopScreenShare, swapOutgoingVideo, updateLocal])

  const toggleHand = useCallback(() => updateLocal({ hand: !localRef.current.hand }), [updateLocal])
  const sendChat = useCallback((text: string) => send({ type: 'chat', text: text.trim().slice(0, 1000), id: crypto.randomUUID(), name: me.name, at: new Date().toISOString() }), [send, me.name])
  const sendReaction = useCallback((emoji: string) => send({ type: 'reaction', emoji, name: me.name }), [send, me.name])

  return {
    selfId, title, startedAt, status, local, localSpeaking, screenStream,
    peers: Object.values(peers), messages, reactions,
    toggleMic, toggleCam, toggleScreenShare, toggleHand, sendChat, sendReaction,
  }
}
