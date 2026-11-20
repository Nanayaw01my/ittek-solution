import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhoneOff, FiAlertTriangle, FiWifiOff, FiVolume2,
  FiUserX, FiSlash, FiX,
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

/**
 * One other person in the room.
 *
 * Their sound and picture both come out of a single <video> element,
 * even when there is no camera and the tile is showing nothing but a
 * letter in a circle. That looks like a detail and is the difference
 * between a working call and a silent one on an iPhone.
 *
 * Safari will not start a media element that is paused, has never been
 * played and has nothing on screen to draw into. A hidden <audio> tag
 * is all three of those, so it sat there, never started, and the call
 * was silent with nothing to show for it. A <video> element that is
 * actually on the page has a renderer, so it starts.
 *
 * It is also why the element is always mounted rather than swapped in
 * when somebody turns a camera on. Replacing the element mid-call tears
 * down the one that was playing and puts up a fresh one that has never
 * been started — silent again, in the middle of a meeting, for the one
 * person who turned their camera on.
 */
function PeerTile({ peer, onBlocked, hasRelay, canModerate, onModerate }) {
  const mediaRef = useRef(null)

  const showsCamera = Boolean(peer.camera && peer.stream?.getVideoTracks?.().length)

  /**
   * Attach, start, and then check that it really started.
   *
   * play() returning without throwing is not proof on Safari: the
   * element can stay paused with no error at all. So the result is
   * looked at rather than trusted, and when it is still paused the room
   * offers a button — a tap is a gesture, and a gesture always works.
   */
  useEffect(() => {
    const el = mediaRef.current
    if (!el || !peer.stream) return undefined

    if (el.srcObject !== peer.stream) el.srcObject = peer.stream
    /**
     * Silenced by the host means silenced here too.
     *
     * Asking their phone to stop sending is the polite half of a mute.
     * This is the half that holds: every other phone in the room stops
     * playing them, whatever their own app decides to do.
     */
    el.muted = Boolean(peer.hostMuted)
    el.volume = 1

    let dead = false
    const start = () => { el.play?.().catch(() => {}) }
    start()

    // Checked rather than assumed, twice, a beat apart.
    const checks = [700, 2500].map((ms) => setTimeout(() => {
      if (dead || !mediaRef.current) return
      if (mediaRef.current.paused) {
        start()
        if (ms === 2500 && mediaRef.current.paused) onBlocked?.()
      }
    }, ms))

    return () => { dead = true; checks.forEach(clearTimeout) }
    // The stream object changes identity whenever a track arrives, which
    // is what re-attaches it — a renegotiation that brings in another
    // person's tracks has been known to silence the ones already
    // playing, and re-attaching is the cure.
  }, [peer.stream, peer.hostMuted, onBlocked])

  /** Do we actually have their voice yet? */
  const connected = Boolean(peer.stream?.getAudioTracks?.().length)

  /**
   * Long enough in the room for silence to mean something.
   *
   * Judged immediately, every tile would accuse somebody of being
   * silent during the two seconds before their first packet arrives.
   */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 9000)
    return () => clearTimeout(t)
  }, [])

  /**
   * Their voice is arriving and none of it has made a sound.
   *
   * Deliberately NOT phrased as a fault of theirs, because the two
   * causes are indistinguishable from here. A browser only works out
   * how loud an arriving voice is while it is playing it out, so a
   * phone that is not playing anything — an iPhone with the ringer
   * switch set to silent, a device with no output at all — reports the
   * same flat zero as a colleague whose microphone is muted.
   *
   * Measured in a container with no speaker, a perfectly healthy call
   * read: 650,000 samples decoded, nothing concealed, and a loudness of
   * zero. Blaming the other person on that evidence would be wrong as
   * often as it was right, and would send the shop chasing the wrong
   * phone. So the message names both, and the shape of it tells you
   * which: one tile saying this is probably them, every tile saying it
   * is certainly you.
   */
  const noSound = settled && connected && peer.packets && !peer.everHeard

  const initial = (peer.name || '?').charAt(0).toUpperCase()

  return (
    <div className={`relative rounded-2xl overflow-hidden border-4 transition-colors
                     ${peer.speaking ? 'border-orange-400' : 'border-transparent'}
                     bg-gray-800 aspect-[4/3]`}
         onClick={canModerate ? () => onModerate(peer) : undefined}
         role={canModerate ? 'button' : undefined}
         aria-label={canModerate ? `Options for ${peer.name}` : undefined}>
      {/*
        Sound and picture both. Mounted always and never swapped, so it
        keeps playing when a camera goes on or off — and on screen even
        with no camera, because an element with nothing to draw into is
        one Safari will not start.
      */}
      <video ref={mediaRef} autoPlay playsInline
             className={`w-full h-full object-cover ${showsCamera ? '' : 'opacity-0'}`} />

      {!showsCamera && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center
                           text-2xl font-black text-white transition-colors
                           ${peer.speaking ? 'bg-orange-500' : 'bg-gray-600'}`}>
            {initial}
          </div>
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
        <p className="text-white font-bold text-sm truncate flex items-center gap-1.5">
          {peer.name}
          {peer.hostMuted && <FiMicOff className="text-red-400 shrink-0" size={13} />}
        </p>
        {peer.role && <p className="text-white/60 font-semibold text-[11px] truncate">{peer.role}</p>}
      </div>

      {peer.failed && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-3 text-center">
          <FiAlertTriangle className="text-amber-400" size={22} />
          <p className="text-white font-bold text-xs mt-2">
            Could not connect to {peer.name}
          </p>
          {/*
            Not anybody's fault, and not one network's. Two phones on
            different networks often have no route to each other at all
            — a phone on mobile data sits behind an address shared with
            thousands of other customers. Naming the remedy is more use
            than naming a culprit, since only the shop can apply it.
          */}
          <p className="text-white/60 font-semibold text-[11px] mt-1">
            {hasRelay
              ? 'No direct route between your two networks, and the relay could not carry it either.'
              : 'Your two networks have no direct route. The shop needs a relay server set up.'}
          </p>
        </div>
      )}

      {!connected && !peer.failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/50 font-bold text-xs">connecting…</p>
        </div>
      )}

      {noSound && (
        <div className="absolute top-2 inset-x-2">
          <p className="text-[10.5px] font-bold text-amber-300 bg-black/70 rounded-lg px-2 py-1
                        text-center leading-tight">
            Connected, but no sound detected — their microphone, or your
            own volume and silent switch
          </p>
        </div>
      )}
    </div>
  )
}

function MeView({ name, speaking, cameraOn, stream, muted, micWorks, settled, hasCompany, hostMuted }) {
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

      {/*
        Your own microphone, judged by whether it has ever moved.
        "I talk and nobody hears me" is otherwise impossible to tell
        from "nobody is listening", and the two have nothing to do with
        each other.
      */}
      {hostMuted && (
        <div className="absolute top-2 inset-x-2">
          <p className="text-[10.5px] font-bold text-red-300 bg-black/70 rounded-lg px-2 py-1
                        text-center leading-tight">
            The host has muted you
          </p>
        </div>
      )}

      {settled && !micWorks && !muted && !hostMuted && hasCompany && (
        <div className="absolute top-2 inset-x-2">
          <p className="text-[10.5px] font-bold text-amber-300 bg-black/70 rounded-lg px-2 py-1
                        text-center leading-tight">
            Your microphone is not picking up anything — say something
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * What the host can do to one person, asked for by tapping their tile.
 *
 * A sheet rather than buttons on the tile itself: at four people to a
 * row on a phone there is no room for them, and putting a Remove button
 * permanently under somebody's face invites the accidental tap.
 */
function ModerateSheet({ peer, onClose, onMute, onAllow, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center"
         onClick={onClose}>
      <div className="bg-gray-900 border-t-2 sm:border-2 border-white/15 w-full sm:max-w-sm
                      rounded-t-2xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-white font-black text-base truncate">{peer.name}</p>
            {peer.role && <p className="text-white/50 font-semibold text-xs">{peer.role}</p>}
          </div>
          <button onClick={onClose} className="text-white/60 p-1" aria-label="Close">
            <FiX size={20} />
          </button>
        </div>

        {peer.hostMuted ? (
          <button onClick={() => { onAllow(peer.id); onClose() }}
                  className="w-full py-3.5 rounded-xl font-bold bg-orange-500 text-white
                             flex items-center justify-center gap-2">
            <FiMic size={17} /> Let {peer.name} talk
          </button>
        ) : (
          <button onClick={() => { onMute(peer.id); onClose() }}
                  className="w-full py-3.5 rounded-xl font-bold bg-white/10 text-white
                             flex items-center justify-center gap-2">
            <FiMicOff size={17} /> Mute {peer.name}
          </button>
        )}

        {peer.hostMuted && (
          <p className="text-white/40 font-semibold text-[11px] text-center mt-2 leading-snug">
            They tap their own microphone to speak — no app can switch on
            somebody else's.
          </p>
        )}

        {/*
          Two taps, because it cannot be undone from here: they are out
          of the room and the server will not let them back in.
        */}
        {confirmRemove ? (
          <button onClick={() => { onRemove(peer.id); onClose() }}
                  className="w-full mt-3 py-3.5 rounded-xl font-black bg-red-600 text-white
                             flex items-center justify-center gap-2">
            <FiUserX size={17} /> Yes, remove them for good
          </button>
        ) : (
          <button onClick={() => setConfirmRemove(true)}
                  className="w-full mt-3 py-3.5 rounded-xl font-bold border-2 border-red-500/60
                             text-red-300 flex items-center justify-center gap-2">
            <FiUserX size={17} /> Remove from the meeting
          </button>
        )}
      </div>
    </div>
  )
}

export default function MeetingRoom() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [joining, setJoining] = useState(true)
  /** The phone refused to start the sound until the screen is touched. */
  const [soundBlocked, setSoundBlocked] = useState(false)
  /**
   * Stable, because a tile's playback effect depends on it. An inline
   * arrow would be a new function on every render, restarting the
   * attach-and-check cycle several times a second and never settling.
   */
  const blocked = useCallback(() => setSoundBlocked(true), [])

  /** The person whose tile the host tapped, if any. */
  const [moderating, setModerating] = useState(null)

  /** Long enough in the room that silence is worth remarking on. */
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 9000)
    return () => clearTimeout(t)
  }, [])
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

      {moderating && (
        <ModerateSheet
          peer={room.peers.find((p) => p.id === moderating.id) || moderating}
          onClose={() => setModerating(null)}
          onMute={room.mutePeer} onAllow={room.allowPeer} onRemove={room.removePeer}
        />
      )}

      {/*
        One tap for a shop meeting where eight phones are each picking
        up a different corner of the room. Everyone can be let back in
        to speak one at a time.
      */}
      {room.moderates && room.peers.length > 0 && (
        <button onClick={room.muteEveryone}
                className="mx-3 mt-3 py-2.5 rounded-xl bg-white/10 text-white font-bold text-sm
                           flex items-center justify-center gap-2">
          <FiSlash size={15} /> Mute everyone
        </button>
      )}

      {soundBlocked && (
        <button
          onClick={() => {
            document.querySelectorAll('video, audio').forEach((el) => {
              el.muted = false
              el.play?.().catch(() => {})
            })
            setSoundBlocked(false)
          }}
          className="mx-3 mt-3 py-3 rounded-xl bg-amber-400 text-gray-900 font-black
                     flex items-center justify-center gap-2">
          <FiVolume2 size={18} /> Tap here to turn the sound on
        </button>
      )}

      <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
        {room.peers.length === 0 && (
          <p className="text-white/40 font-bold text-center py-8 text-sm">
            Nobody else is here yet. They will appear as they join.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MeView name="You" speaking={room.speaking} cameraOn={room.cameraOn}
                  stream={room.cameraStream} muted={room.muted}
                  micWorks={room.micWorks} settled={settled} hostMuted={room.hostMuted}
                  hasCompany={room.peers.length > 0} />
          {room.peers.map((p) => (
            <PeerTile key={p.id} peer={p} hasRelay={ticket?.has_relay} onBlocked={blocked}
                      canModerate={room.moderates} onModerate={setModerating} />
          ))}
        </div>
      </div>

      {/*
        The controls sit at the bottom and stay there, because on a phone
        the one thing somebody needs in a hurry is the button that gets
        them out.
      */}
      <div className="p-4 border-t border-white/10 flex items-center justify-center gap-3
                      pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button onClick={room.toggleMute} disabled={room.hostMuted}
                className={`w-14 h-14 rounded-full flex items-center justify-center
                            ${room.muted ? 'bg-red-500 text-white' : 'bg-white/15 text-white'}
                            ${room.hostMuted ? 'opacity-50' : ''}`}
                aria-label={room.hostMuted ? 'Muted by the host'
                  : room.muted ? 'Unmute' : 'Mute'}>
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
