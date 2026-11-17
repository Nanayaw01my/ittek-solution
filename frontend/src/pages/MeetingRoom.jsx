import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiAlertTriangle, FiWifiOff,
} from 'react-icons/fi'
import { joinMeeting, leaveMeeting } from '../api/meetings'
import useMeetingRoom from '../hooks/useMeetingRoom'

/**
 * The meeting room.
 *
 * Built for voice first, because that is what the shop asked for and
 * what mobile data can actually carry for eight people. So the room is
 * a wall of names, not a wall of black squares: a name lights up when
 * its owner is speaking, which is the one thing you cannot tell on a
 * voice call and the thing everybody wants to know.
 *
 * A camera, when somebody turns one on, replaces their name with their
 * face in the same tile. The room carries a few of those, not eight —
 * see the cap in the hook.
 */

/** A remote tile's audio has to be played; a video tile plays its own. */
function PeerTile({ peer }) {
  const audioRef = useRef(null)
  const videoRef = useRef(null)

  useEffect(() => {
    if (audioRef.current && peer.stream) {
      audioRef.current.srcObject = peer.stream
      /**
       * Phones will not start audio on their own unless the page has
       * been touched, and refusing is silent. The user tapped Join to
       * get here, so this nearly always succeeds; when it does not,
       * saying nothing is still better than a thrown error on a tile.
       */
      audioRef.current.play?.().catch(() => {})
    }
    if (videoRef.current && peer.stream) videoRef.current.srcObject = peer.stream
  }, [peer.stream, peer.camera])

  /** Do we actually have their voice yet? */
  const connected = Boolean(peer.stream?.getAudioTracks?.().length)

  const initial = (peer.name || '?').charAt(0).toUpperCase()

  return (
    <div className={`relative rounded-2xl overflow-hidden border-4 transition-colors
                     ${peer.speaking ? 'border-orange-400' : 'border-transparent'}
                     bg-gray-800 aspect-[4/3]`}>
      {/* Always present, never shown: this is what carries the voice. */}
      <audio ref={audioRef} autoPlay playsInline />

      {peer.camera && peer.stream?.getVideoTracks?.().length ? (
        <video ref={videoRef} autoPlay playsInline
               className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center
                           text-2xl font-black text-white transition-colors
                           ${peer.speaking ? 'bg-orange-500' : 'bg-gray-600'}`}>
            {initial}
          </div>
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
        <p className="text-white font-bold text-sm truncate">{peer.name}</p>
        {peer.role && <p className="text-white/60 font-semibold text-[11px] truncate">{peer.role}</p>}
      </div>

      {peer.failed && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-3 text-center">
          <FiAlertTriangle className="text-amber-400" size={22} />
          <p className="text-white font-bold text-xs mt-2">
            Could not connect to {peer.name}
          </p>
          <p className="text-white/60 font-semibold text-[11px] mt-1">
            Their network is blocking a direct line.
          </p>
        </div>
      )}

      {!connected && !peer.failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/50 font-bold text-xs">connecting…</p>
        </div>
      )}
    </div>
  )
}

function MeView({ name, speaking, cameraOn, stream, muted }) {
  const videoRef = useRef(null)
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream, cameraOn])

  return (
    <div className={`relative rounded-2xl overflow-hidden border-4 bg-gray-700 aspect-[4/3]
                     ${speaking && !muted ? 'border-orange-400' : 'border-transparent'}`}>
      {cameraOn ? (
        // Mirrored, because a view of yourself that moves the wrong way
        // when you move is quietly disconcerting.
        <video ref={videoRef} autoPlay playsInline muted
               className="w-full h-full object-cover scale-x-[-1]" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center
                           text-2xl font-black text-white
                           ${speaking && !muted ? 'bg-orange-500' : 'bg-gray-600'}`}>
            {(name || '?').charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/70 to-transparent
                      flex items-center gap-1.5">
        <p className="text-white font-bold text-sm">You</p>
        {muted && <FiMicOff className="text-red-400" size={13} />}
      </div>
    </div>
  )
}

export default function MeetingRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [joining, setJoining] = useState(true)
  const [ticket, setTicket] = useState(null)
  const [error, setError] = useState('')

  /**
   * Asking to be let in, before any microphone is touched.
   *
   * The server decides here whether this person is on the list, and only
   * then hands back the room's name and where the phones should look for
   * each other. Doing it in this order means somebody who is not invited
   * never gets a permission prompt for their microphone — they get a
   * sentence telling them so.
   */
  useEffect(() => {
    let dead = false
    joinMeeting(id)
      .then((res) => { if (!dead) { setTicket(res.data); setJoining(false) } })
      .catch((e) => {
        if (dead) return
        setError(e?.response?.data?.message || 'Could not join the meeting.')
        setJoining(false)
      })
    return () => { dead = true }
  }, [id])

  const onError = useCallback((e) => toast.error(e.message), [])

  const room = useMeetingRoom({
    roomKey: ticket?.room_key,
    iceServers: ticket?.ice_servers,
    cameraLimit: ticket?.camera_limit,
    onError,
  })

  const leave = useCallback(() => {
    room.hangUp()
    leaveMeeting(id).catch(() => { /* the socket closing says the same thing */ })
    navigate('/meetings')
  }, [room, id, navigate])

  /**
   * Leaving by closing the tab, which is how most meetings end.
   *
   * Without this the person stays listed in the room until the socket's
   * heartbeat gives up on them, and everyone else sees a name that is no
   * longer there.
   */
  useEffect(() => {
    const bye = () => { leaveMeeting(id).catch(() => {}) }
    window.addEventListener('pagehide', bye)
    return () => window.removeEventListener('pagehide', bye)
  }, [id])

  if (joining) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-white font-bold">Joining…</p>
    </div>
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <FiAlertTriangle className="text-amber-400" size={40} />
        <p className="text-white font-black text-lg mt-4">{error}</p>
        <button onClick={() => navigate('/meetings')}
                className="mt-6 px-6 py-3 rounded-xl font-bold bg-white text-gray-900">
          Back to meetings
        </button>
      </div>
    )
  }

  if (room.status === 'refused') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <FiMicOff className="text-amber-400" size={40} />
        <p className="text-white font-black text-lg mt-4 max-w-sm">{room.refusal}</p>
        <button onClick={() => navigate('/meetings')}
                className="mt-6 px-6 py-3 rounded-xl font-bold bg-white text-gray-900">
          Back to meetings
        </button>
      </div>
    )
  }

  const everyone = room.peers.length + 1

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-white/10">
        <div className="min-w-0">
          <h1 className="text-white font-black text-base truncate">{ticket?.title}</h1>
          <p className="text-white/50 font-semibold text-xs">
            {everyone} {everyone === 1 ? 'person' : 'people'} in the room
            {room.camerasOn > 0 && ` · ${room.camerasOn}/${room.cameraLimit} cameras`}
          </p>
        </div>
        {room.status === 'lost' && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20
                           text-amber-300 text-xs font-bold shrink-0">
            <FiWifiOff size={13} /> Reconnecting
          </span>
        )}
      </div>

      <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
        {room.peers.length === 0 && (
          <p className="text-white/40 font-bold text-center py-8 text-sm">
            Nobody else is here yet. They will appear as they join.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MeView name="You" speaking={room.speaking} cameraOn={room.cameraOn}
                  stream={room.cameraStream} muted={room.muted} />
          {room.peers.map((p) => <PeerTile key={p.id} peer={p} />)}
        </div>
      </div>

      {/*
        The controls sit at the bottom and stay there, because on a phone
        the one thing somebody needs in a hurry is the button that gets
        them out.
      */}
      <div className="p-4 border-t border-white/10 flex items-center justify-center gap-3
                      pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button onClick={room.toggleMute}
                className={`w-14 h-14 rounded-full flex items-center justify-center
                            ${room.muted ? 'bg-red-500 text-white' : 'bg-white/15 text-white'}`}
                aria-label={room.muted ? 'Unmute' : 'Mute'}>
          {room.muted ? <FiMicOff size={22} /> : <FiMic size={22} />}
        </button>

        <button onClick={room.toggleCamera}
                className={`w-14 h-14 rounded-full flex items-center justify-center
                            ${room.cameraOn ? 'bg-orange-500 text-white' : 'bg-white/15 text-white'}`}
                aria-label={room.cameraOn ? 'Turn camera off' : 'Turn camera on'}>
          {room.cameraOn ? <FiVideo size={22} /> : <FiVideoOff size={22} />}
        </button>

        <button onClick={leave}
                className="px-7 h-14 rounded-full bg-red-600 text-white font-black
                           flex items-center gap-2"
                aria-label="Leave the meeting">
          <FiPhoneOff size={20} /> Leave
        </button>
      </div>
    </div>
  )
}
