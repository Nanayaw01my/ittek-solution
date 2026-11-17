import { useCallback, useEffect, useRef, useState } from 'react'
import { signalUrl } from '../api/meetings'

/**
 * A meeting room, as the browser sees it.
 *
 * Everybody in the room holds a direct connection to everybody else —
 * a "mesh". With five people that is four connections each, which is
 * why the room is built around voice: an audio stream is roughly a
 * fortieth of a video one, so eight people talking is comfortable where
 * eight people on camera would not be.
 *
 * Two decisions here are worth knowing about before changing anything.
 *
 * First, only the newcomer offers. When somebody joins they are told
 * who is already in the room and they call each of them; the people
 * already there wait to be called. If both sides offered, two people
 * joining at the same moment would open two connections for one
 * conversation and then argue about which to keep — the problem WebRTC
 * calls glare, and this sidesteps it rather than solving it.
 *
 * Second, the video channel exists from the start, empty. Turning a
 * camera on mid-call would otherwise mean renegotiating the whole
 * connection with every other person in the room, which is the most
 * common way a working call suddenly isn't. Instead each connection is
 * built with a video slot that holds nothing, and the camera is put
 * into the slot it was already carrying.
 */

const MIC = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
}

export default function useMeetingRoom({ roomKey, iceServers, cameraLimit = 3, onError }) {
  const [peers, setPeers] = useState([])          // [{ id, name, role, camera, stream, speaking }]
  const [status, setStatus] = useState('connecting') // connecting | live | lost | refused
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [refusal, setRefusal] = useState('')
  /**
   * The camera's own stream, for showing yourself.
   *
   * Held in state rather than read off the ref, because the preview is
   * rendered and a ref changing does not re-render anything — which
   * shows as a camera that is on everywhere except on your own screen.
   */
  const [cameraStream, setCameraStream] = useState(null)

  const ws = useRef(null)
  const pcs = useRef(new Map())        // peerId -> RTCPeerConnection
  const senders = useRef(new Map())    // peerId -> { audio, video }
  const localStream = useRef(null)
  const remote = useRef(new Map())     // peerId -> what we have received from them
  const cameraTrack = useRef(null)
  const meters = useRef([])            // audio meters to tear down
  const retry = useRef(null)
  const closing = useRef(false)

  const patchPeer = useCallback((id, patch) => {
    setPeers((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  const say = useCallback((msg) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg))
  }, [])

  /**
   * How loud our own microphone is, for the ring around our own tile.
   *
   * THIS MUST NEVER BE POINTED AT A STREAM FROM ANOTHER PERSON.
   *
   * createMediaStreamSource does not observe a stream, it *takes* it:
   * the stream's playback is re-routed into the Web Audio graph, and
   * whatever the graph does not send onward to a destination is simply
   * not heard. This was first written to light up a name when its owner
   * spoke, and it was pointed at every arriving voice — each of which
   * was then quietly diverted into an analyser that led nowhere.
   *
   * The effect was a meeting that worked perfectly and was completely
   * silent. The connection was real, the tiles were right, the bytes
   * arrived and were decoded; the sound was simply taken somewhere
   * other than the speaker. Nothing on screen could show it, and no
   * measurement of the stream could either, because the audio was all
   * still there.
   *
   * Our own microphone is safe because it is never played back — doing
   * so would be an echo, not a feature. Everybody else's loudness now
   * comes from the connection's own statistics, below, which only
   * reads.
   */
  const meter = useCallback((stream, report) => {
    /**
     * Only ever our own microphone. Never a stream arriving from
     * somebody else — see the warning above this function.
     */
    let ctx
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
    } catch {
      return () => {}
    }
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    let on = false
    let quietFor = 0

    const tick = setInterval(() => {
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i += 1) sum += data[i]
      const level = sum / data.length

      if (level > 12) {
        quietFor = 0
        if (!on) { on = true; report(true) }
      } else if (on) {
        // A pause between words is not the end of a sentence; without
        // this the name flickers on and off while somebody speaks.
        quietFor += 1
        if (quietFor > 6) { on = false; report(false) }
      }
    }, 100)

    const stop = () => {
      clearInterval(tick)
      try { source.disconnect() } catch { /* already gone */ }
      try { ctx.close() } catch { /* already closed */ }
    }
    meters.current.push(stop)
    return stop
  }, [])

  /**
   * The connection to one other person, with its handlers but no media
   * yet. Which media slots it carries, and in which order, depends on
   * whether we are calling them or answering them — see below.
   */
  const connectionTo = useCallback((peerId) => {
    if (pcs.current.has(peerId)) return pcs.current.get(peerId)

    const pc = new RTCPeerConnection({ iceServers })

    pc.onicecandidate = (e) => {
      if (e.candidate) say({ type: 'ice', to: peerId, candidate: e.candidate })
    }

    /**
     * The other person's sound and picture, as they arrive.
     *
     * The stream is assembled here rather than taken from e.streams,
     * which is usually empty for us: a track only carries a stream when
     * the sender attached one, and ours are put into their slots with
     * replaceTrack, which attaches nothing. Trusting e.streams meant
     * every arriving track was dropped on the floor — the bytes came in
     * and were never given to an audio element, so a working call was
     * completely silent and every tile read "connecting…" for ever.
     *
     * A new MediaStream is built each time rather than added to, so the
     * object's identity changes and the tile re-attaches it. Mutating
     * one in place changes nothing React can see, which is the same
     * silence by a different route.
     */
    pc.ontrack = (e) => {
      const held = remote.current.get(peerId)
      const tracks = [...(held ? held.getTracks() : []), e.track]
        .filter((t, i, all) => all.indexOf(t) === i)
      const stream = new MediaStream(tracks)
      remote.current.set(peerId, stream)
      patchPeer(peerId, { stream })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        /**
         * The connection could not be made at all.
         *
         * Almost always this is two phones on mobile networks that
         * cannot reach each other directly and no relay configured to
         * carry them. Saying so on the one person's tile is better than
         * a silent empty square, because the meeting carries on for
         * everybody else and nobody would otherwise know they were
         * missing.
         */
        patchPeer(peerId, { failed: true })
      }
    }

    pcs.current.set(peerId, pc)
    return pc
  }, [iceServers, say, patchPeer, meter])

  /** Put our microphone, and the camera if it is on, into these slots. */
  const fill = useCallback((peerId, audio, video) => {
    senders.current.set(peerId, { audio: audio.sender, video: video.sender })
    audio.direction = 'sendrecv'
    video.direction = 'sendrecv'
    audio.sender.replaceTrack(localStream.current.getAudioTracks()[0])
    video.sender.replaceTrack(cameraTrack.current || null)
  }, [])

  /** Calling somebody who was already in the room. */
  const callPeer = useCallback(async (peerId) => {
    const pc = connectionTo(peerId)
    // We decide the shape of the conversation: one audio slot, one video
    // slot held open for a camera that may never come on.
    const audio = pc.addTransceiver('audio', { direction: 'sendrecv' })
    const video = pc.addTransceiver('video', { direction: 'sendrecv' })
    fill(peerId, audio, video)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    say({ type: 'offer', to: peerId, sdp: pc.localDescription })
  }, [connectionTo, fill, say])

  /**
   * Answering somebody who has just joined.
   *
   * The remote description is applied *first*, and our microphone goes
   * into the slots it brings with it. Adding our own slots beforehand
   * looks equivalent and is not: the browser then cannot match them to
   * the ones in the offer, so it makes a second, receive-only pair for
   * the offer and leaves ours unnegotiated. The call connects, the
   * newcomer is heard by everybody, and nobody is heard by the newcomer
   * — which is the shape of a bug that looks like a bad network.
   */
  const answerPeer = useCallback(async (peerId, sdp) => {
    const pc = connectionTo(peerId)
    await pc.setRemoteDescription(sdp)

    const slots = pc.getTransceivers()
    const audio = slots.find((t) => t.receiver?.track?.kind === 'audio')
    const video = slots.find((t) => t.receiver?.track?.kind === 'video')
    if (audio && video) fill(peerId, audio, video)

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    say({ type: 'answer', to: peerId, sdp: pc.localDescription })
  }, [connectionTo, fill, say])

  const drop = useCallback((peerId) => {
    const pc = pcs.current.get(peerId)
    if (pc) { try { pc.close() } catch { /* already closed */ } }
    pcs.current.delete(peerId)
    senders.current.delete(peerId)
    remote.current.delete(peerId)
    setPeers((list) => list.filter((p) => p.id !== peerId))
  }, [])

  // ── Joining, and staying joined ────────────────────────────────────

  useEffect(() => {
    if (!roomKey) return undefined
    let dead = false

    const open = async () => {
      try {
        if (!localStream.current) {
          localStream.current = await navigator.mediaDevices.getUserMedia(MIC)
          meter(localStream.current, setSpeaking)
        }
      } catch (err) {
        /**
         * No microphone, or permission refused.
         *
         * This is not a failure to connect and should not read as one:
         * the usual cause is the browser's own permission prompt being
         * dismissed, and the fix is a sentence of instruction rather
         * than anything technical.
         */
        setStatus('refused')
        setRefusal(err.name === 'NotAllowedError'
          ? 'Your browser blocked the microphone. Allow it for this site and rejoin.'
          : 'No microphone was found on this device.')
        onError?.(err)
        return
      }

      const socket = new WebSocket(signalUrl(roomKey))
      ws.current = socket

      socket.onopen = () => { if (!dead) setStatus('live') }

      socket.onmessage = async (event) => {
        let msg
        try { msg = JSON.parse(event.data) } catch { return }

        if (msg.type === 'refused') {
          /**
           * A refusal is final, and has to say so before the socket
           * closes behind it.
           *
           * The server sends this and then hangs up, which fires
           * onclose — and onclose used to set the status to 'lost' and
           * schedule a retry. So somebody who was not on the list was
           * told "Reconnecting" for ever instead of being told they
           * were not invited, and the app quietly hammered the server
           * every two seconds about it.
           */
          closing.current = true
          setStatus('refused')
          setRefusal(msg.reason || 'You are not on the list for this meeting.')
          return
        }

        if (msg.type === 'replaced') {
          // The same account joined from somewhere else.
          closing.current = true
          setStatus('refused')
          setRefusal('You joined this meeting on another device.')
          return
        }

        if (msg.type === 'welcome') {
          setPeers(msg.peers.map((p) => ({ ...p, stream: null, speaking: false })))
          // The newcomer calls everybody already here.
          for (const p of msg.peers) await callPeer(p.id)
          return
        }

        if (msg.type === 'joined') {
          setPeers((list) => (list.some((p) => p.id === msg.peer.id)
            ? list
            : [...list, { ...msg.peer, stream: null, speaking: false }]))
          return
        }

        if (msg.type === 'offer') { await answerPeer(msg.from, msg.sdp); return }

        if (msg.type === 'answer') {
          const pc = pcs.current.get(msg.from)
          if (pc) await pc.setRemoteDescription(msg.sdp)
          return
        }

        if (msg.type === 'ice') {
          const pc = pcs.current.get(msg.from)
          if (!pc || !msg.candidate) return
          try { await pc.addIceCandidate(msg.candidate) } catch { /* arrived too late to matter */ }
          return
        }

        if (msg.type === 'camera') { patchPeer(msg.from, { camera: msg.on }); return }
        if (msg.type === 'left') drop(msg.id)
      }

      socket.onclose = () => {
        if (dead || closing.current) return
        setStatus('lost')
        /**
         * Mobile data drops. Rejoining quietly is what a person expects
         * of a phone call that stutters, rather than being thrown out of
         * the meeting and having to find it again.
         */
        retry.current = setTimeout(() => { if (!dead) open() }, 2000)
      }
    }

    open()

    return () => {
      dead = true
      clearTimeout(retry.current)
      try { ws.current?.close() } catch { /* already closed */ }
      pcs.current.forEach((pc) => { try { pc.close() } catch { /* already closed */ } })
      pcs.current.clear()
      senders.current.clear()
      remote.current.clear()
      meters.current.forEach((stop) => stop())
      meters.current = []
      localStream.current?.getTracks().forEach((t) => t.stop())
      cameraTrack.current?.stop()
      localStream.current = null
      cameraTrack.current = null
    }
  }, [roomKey, callPeer, answerPeer, say, patchPeer, drop, meter, onError])

  /**
   * Who else is talking, read from each connection's own statistics.
   *
   * WebRTC already measures the loudness of every voice it decodes and
   * will hand the figure over for the asking. Asking costs a poll and
   * changes nothing about where the sound goes, which is the entire
   * point: the previous way of answering this question was what made
   * the room silent.
   *
   * `heard` is kept beside it as plain diagnostics — whether any sound
   * at all is arriving from that person — so a silent meeting can be
   * told apart from a meeting where nobody is speaking.
   */
  useEffect(() => {
    const tick = setInterval(async () => {
      for (const [peerId, pc] of pcs.current.entries()) {
        if (pc.connectionState !== 'connected') continue
        try {
          const stats = await pc.getStats()
          let level = null
          stats.forEach((r) => {
            // Chrome reports it on inbound-rtp; older builds on `track`.
            if ((r.type === 'inbound-rtp' || r.type === 'track')
                && (r.kind === 'audio' || r.trackIdentifier)
                && typeof r.audioLevel === 'number') {
              level = Math.max(level ?? 0, r.audioLevel)
            }
          })
          if (level !== null) {
            patchPeer(peerId, { speaking: level > 0.02, heard: true })
          }
        } catch { /* a connection that closed mid-poll */ }
      }
    }, 400)
    return () => clearInterval(tick)
  }, [patchPeer])

  // ── The three controls ─────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const track = localStream.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
  }, [])

  const camerasOn = peers.filter((p) => p.camera).length + (cameraOn ? 1 : 0)

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      senders.current.forEach(({ video }) => video.replaceTrack(null))
      cameraTrack.current?.stop()
      cameraTrack.current = null
      setCameraStream(null)
      setCameraOn(false)
      say({ type: 'camera', on: false })
      return
    }

    if (camerasOn >= cameraLimit) {
      onError?.(new Error(`Only ${cameraLimit} cameras at a time — ask someone to turn theirs off.`))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20 } },
      })
      const track = stream.getVideoTracks()[0]
      cameraTrack.current = track
      // Into the slot every connection has been carrying since it opened.
      senders.current.forEach(({ video }) => video.replaceTrack(track))
      setCameraStream(stream)
      setCameraOn(true)
      say({ type: 'camera', on: true })
    } catch (err) {
      onError?.(new Error(err.name === 'NotAllowedError'
        ? 'Your browser blocked the camera.'
        : 'No camera was found on this device.'))
    }
  }, [cameraOn, camerasOn, cameraLimit, say, onError])

  const hangUp = useCallback(() => {
    closing.current = true
    say({ type: 'bye' })
    try { ws.current?.close() } catch { /* already closed */ }
  }, [say])

  return {
    peers, status, refusal, muted, cameraOn, speaking,
    camerasOn, cameraLimit,
    cameraStream,
    toggleMute, toggleCamera, hangUp,
  }
}
