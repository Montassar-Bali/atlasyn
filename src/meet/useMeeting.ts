import { useCallback, useEffect, useRef, useState } from 'react'
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

type ServerPeer = Omit<Participant, 'stream' | 'speaking'>
type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

const SPEAKING_THRESHOLD = 0.04

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
 * Mesh WebRTC meeting over the Atlasyn signaling socket. Newcomers send offers to everyone
 * already in the room; existing members only answer, which avoids offer collisions.
 */
export function useMeeting(code: string, localStream: MediaStream, initial: { mic: boolean; cam: boolean }) {
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

  const ws = useRef<WebSocket | null>(null)
  const pcs = useRef(new Map<string, RTCPeerConnection>())
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>())
  const remoteStreams = useRef(new Map<string, MediaStream>())
  const iceServers = useRef<RTCIceServer[]>([])
  const localRef = useRef(local)
  localRef.current = local
  const screenTrack = useRef<MediaStreamTrack | null>(null)

  const send = useCallback((message: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(message))
  }, [])

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
    async function connect() {
      try {
        iceServers.current = (await api<{ iceServers: RTCIceServer[] }>('/meetings/ice-config')).iceServers
      } catch { iceServers.current = [{ urls: 'stun:stun.l.google.com:19302' }] }
      if (cancelled) return
      localStream.getAudioTracks().forEach((t) => { t.enabled = initial.mic })
      localStream.getVideoTracks().forEach((t) => { t.enabled = initial.cam })

      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/meetings/${encodeURIComponent(code)}/ws`)
      ws.current = socket
      socket.onmessage = async (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'welcome') {
          setSelfId(msg.self)
          setTitle(msg.title)
          setStartedAt(msg.started_at)
          setStatus('live')
          send({ type: 'state', state: localRef.current })
          const initialPeers: Record<string, Participant> = {}
          msg.peers.forEach((p: ServerPeer) => { initialPeers[p.id] = { ...p, stream: null, speaking: false } })
          setPeers(initialPeers)
          for (const p of msg.peers as ServerPeer[]) {
            const pc = createPeerConnection(p.id, true)
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            send({ type: 'signal', to: p.id, data: { sdp: pc.localDescription } })
          }
        } else if (msg.type === 'peer-joined') {
          setPeers((current) => ({ ...current, [msg.peer.id]: { ...msg.peer, stream: null, speaking: false } }))
        } else if (msg.type === 'peer-left') {
          closePeer(msg.id)
        } else if (msg.type === 'peer-state') {
          patchPeer(msg.id, { state: msg.state })
        } else if (msg.type === 'signal') {
          await handleSignal(msg.from, msg.data)
        } else if (msg.type === 'chat') {
          setMessages((current) => [...current, msg].slice(-200))
        } else if (msg.type === 'reaction') {
          const key = `${Date.now()}-${Math.random()}`
          setReactions((current) => [...current, { key, emoji: msg.emoji, name: msg.name }])
          window.setTimeout(() => setReactions((current) => current.filter((r) => r.key !== key)), 3200)
        }
      }
      socket.onclose = (event) => {
        if (cancelled) return
        setStatus(event.code === 4429 ? 'full' : event.code >= 4400 ? 'error' : 'ended')
      }
    }
    void connect()
    return () => {
      cancelled = true
      ws.current?.close()
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
      send({ type: 'state', state: next })
      return next
    })
  }, [send])

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
  const sendChat = useCallback((text: string) => send({ type: 'chat', text }), [send])
  const sendReaction = useCallback((emoji: string) => send({ type: 'reaction', emoji }), [send])

  return {
    selfId, title, startedAt, status, local, localSpeaking, screenStream,
    peers: Object.values(peers), messages, reactions,
    toggleMic, toggleCam, toggleScreenShare, toggleHand, sendChat, sendReaction,
  }
}
