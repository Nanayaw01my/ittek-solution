const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { OWNER_ROLES } = require('../middleware/rbac');
const User = require('../models/User');
const Meeting = require('../models/Meeting');

/**
 * The introduction service for staff meetings.
 *
 * Two phones cannot start talking to each other out of nothing. One has
 * to describe how it can be reached — its addresses, the audio formats
 * it speaks — and the other has to answer in kind. That exchange is all
 * this file does. It is a few hundred bytes per person, passed on
 * unopened.
 *
 * What this server never carries is the call itself. Once the two phones
 * have been introduced they send audio and video straight to each other,
 * and this process could be restarted mid-meeting without a word of the
 * conversation passing through it. That is the whole reason a shop's
 * small Render instance can host meetings at all.
 *
 * Rooms live in memory, deliberately. A room is only meaningful while
 * people are in it, and a restart drops the calls anyway — writing the
 * membership to MongoDB would buy a record of who was in a room that no
 * longer exists. Who attended is a different question, and the Meeting
 * document answers it.
 */

/** roomKey -> Map(socketId -> { ws, userId, name, role, camera }) */
const rooms = new Map();

let nextId = 1;

const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(payload)); } catch { /* a closing socket */ }
  }
};

const roomOf = (key) => {
  if (!rooms.has(key)) rooms.set(key, new Map());
  return rooms.get(key);
};

/** Everybody in the room except the one being told. */
const others = (key, exceptId) =>
  [...roomOf(key).entries()].filter(([id]) => id !== exceptId);

const describe = (id, peer) => ({
  id, user_id: peer.userId, name: peer.name, role: peer.role,
  camera: peer.camera, host_muted: peer.hostMuted,
});

/**
 * Who is allowed into a room.
 *
 * The room key alone is not enough. A key is handed to a person when
 * they join, and a person can pass it on — to a friend, or by leaving a
 * phone unlocked. So the socket must also carry a valid login, and that
 * account must be on the meeting's invitation list, checked against the
 * same Meeting.invites() the join route used.
 */
const authorise = async (token, roomKey) => {
  if (!token || !roomKey) return null;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }

  const [user, meeting] = await Promise.all([
    User.findById(payload.id).select('username role is_active').lean(),
    Meeting.findOne({ room_key: roomKey }).lean(),
  ]);

  if (!user || user.is_active === false) return null;
  if (!meeting) return null;
  if (meeting.status === 'ended' || meeting.status === 'cancelled') return null;
  if (!Meeting.invites(meeting, { ...user, _id: payload.id })) return null;

  return {
    userId: String(payload.id),
    name: user.username,
    role: user.role,
    meeting,
    /**
     * Whether this socket may silence or remove anybody, decided once
     * at the door from the account and the meeting — never from
     * anything the client says about itself later.
     */
    moderates: Meeting.moderatedBy(
      meeting, { _id: payload.id }, OWNER_ROLES.includes(user.role)
    ),
  };
};

/**
 * Messages a client may send.
 *
 * 'offer', 'answer' and 'ice' are the WebRTC handshake and are passed
 * through to one named peer without being read — this server has no
 * business understanding them, and not parsing them means it cannot be
 * broken by a malformed one. 'camera' and 'speaking' are ours, and are
 * broadcast to the room so everyone's screen agrees about who has a
 * camera on and who is talking.
 */
const RELAYED = new Set(['offer', 'answer', 'ice']);

const attach = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return socket.destroy();
    }
    if (url.pathname !== '/ws/meeting') return socket.destroy();

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, url);
    });
  });

  wss.on('connection', async (ws, req, url) => {
    /**
     * The token travels in the query string rather than a header.
     *
     * Browsers give no way to set headers on a WebSocket, so this is the
     * only place it can go. It is the same short-lived login token the
     * app already uses, the connection is wss:// in production so the
     * query string is encrypted on the wire, and the server does not log
     * request URLs for this path.
     */
    const token = url.searchParams.get('token');
    const roomKey = url.searchParams.get('room');

    const who = await authorise(token, roomKey);
    if (!who) {
      send(ws, { type: 'refused', reason: 'You are not on the list for this meeting.' });
      return ws.close();
    }

    const id = String(nextId++);
    const room = roomOf(roomKey);

    /**
     * One seat per person.
     *
     * A phone that reconnects after a bad line would otherwise sit in the
     * room twice, and everybody else would try to hold two calls with
     * them — which sounds, to the room, like an echo of the person who
     * just came back.
     */
    for (const [otherId, peer] of room.entries()) {
      if (peer.userId === who.userId) {
        send(peer.ws, { type: 'replaced' });
        peer.ws.close();
        room.delete(otherId);
      }
    }

    const me = {
      ws, userId: who.userId, name: who.name, role: who.role,
      camera: false, hostMuted: false, moderates: who.moderates,
    };
    room.set(id, me);

    // Who is already here. The newcomer calls them, not the other way
    // round, so that two people joining at once do not call each other
    // twice and end up with two connections for one conversation.
    send(ws, {
      type: 'welcome',
      id,
      title: who.meeting.title,
      moderates: who.moderates,
      peers: others(roomKey, id).map(([pid, p]) => describe(pid, p)),
    });

    others(roomKey, id).forEach(([, p]) => send(p.ws, { type: 'joined', peer: describe(id, me) }));

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;

      if (RELAYED.has(msg.type)) {
        const target = room.get(String(msg.to));
        if (!target) return;
        // from is set by the server, never taken from the message: a
        // client that could name its own sender could impersonate
        // anybody else in the room.
        return send(target.ws, { ...msg, to: undefined, from: id });
      }

      if (msg.type === 'camera') {
        me.camera = Boolean(msg.on);
        return others(roomKey, id).forEach(([, p]) =>
          send(p.ws, { type: 'camera', from: id, on: me.camera }));
      }

      if (msg.type === 'bye') {
        return ws.close();
      }

      /**
       * The host's powers.
       *
       * Checked against the socket's own `moderates`, settled at the
       * door from the account and the meeting. A client that simply
       * said it was the host would otherwise be the host, and the one
       * thing a moderation feature must not be is advisory.
       */
      if (!me.moderates) return;

      const silence = (peerId, on) => {
        const target = room.get(String(peerId));
        if (!target || target.moderates) return;   // nobody silences a host
        target.hostMuted = on;
        // Told to the person, so their own screen explains itself...
        send(target.ws, { type: on ? 'muted-by-host' : 'allowed-to-talk', by: me.name });
        // ...and to the room, so every other phone stops playing them.
        // Asking their phone to stop sending is the polite half; this is
        // the half that holds if it does not.
        roomOf(roomKey).forEach((p) => send(p.ws, {
          type: 'peer-muted', id: String(peerId), on,
        }));
      };

      if (msg.type === 'mute') return silence(msg.to, true);
      if (msg.type === 'allow') return silence(msg.to, false);

      if (msg.type === 'mute-all') {
        return [...room.keys()].forEach((pid) => { if (pid !== id) silence(pid, true); });
      }

      if (msg.type === 'remove') {
        const target = room.get(String(msg.to));
        if (!target || target.moderates) return;   // nor removes one
        send(target.ws, { type: 'removed', by: me.name });
        /**
         * Written down before the socket closes, so tapping Join again
         * is refused at the door rather than letting them straight back
         * into the room they were just put out of.
         */
        Meeting.updateOne(
          { room_key: roomKey },
          { $addToSet: { removed_ids: target.userId } }
        ).catch((err) => console.error('Meeting removal error:', err.message));
        return target.ws.close();
      }
    });

    const leave = async () => {
      room.delete(id);
      others(roomKey, id).forEach(([, p]) => send(p.ws, { type: 'left', id }));
      if (room.size === 0) rooms.delete(roomKey);

      /**
       * Closing the attendance row here as well as on the leave route.
       *
       * A phone that goes into a tunnel never calls the route, and the
       * meeting would keep showing that person as still in the room
       * hours later. The socket closing is the one signal that always
       * arrives.
       */
      try {
        const meeting = await Meeting.findOne({ room_key: roomKey });
        if (!meeting) return;
        const stillHere = [...roomOf(roomKey).values()].some((p) => p.userId === who.userId);
        if (stillHere) return;
        const row = meeting.attendance.find((a) => String(a.user_id) === who.userId);
        if (row && !row.left_at) {
          row.left_at = new Date();
          await meeting.save();
        }
      } catch (err) {
        console.error('Meeting leave bookkeeping error:', err.message);
      }
    };

    ws.on('close', leave);
    ws.on('error', leave);
  });

  /**
   * A heartbeat, because a dropped mobile connection does not close
   * tidily. Without it a phone that lost signal stays in the room as a
   * socket nobody can reach, and everyone else keeps a dead call open
   * with it.
   */
  const beat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch { /* already gone */ }
    });
  }, 30000);
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });
  wss.on('close', () => clearInterval(beat));

  return wss;
};

module.exports = { attach, rooms };
