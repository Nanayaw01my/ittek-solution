const Meeting = require('../models/Meeting');
const User = require('../models/User');
const { isOwner, ROLE_LEVELS } = require('../middleware/rbac');
const { notifyUser } = require('../utils/notify');

/**
 * Staff meetings held inside the app.
 *
 * The shop's rule, decided by the shop: only an owner calls a meeting.
 * Everybody else sees the ones they were invited to and joins them. The
 * check is written out in each route that needs it rather than hidden in
 * middleware, so a reader can see on the route itself who may do what.
 */

/**
 * What a person on the invitation list is allowed to know about a
 * meeting — and, separately, what they are allowed to know once it is
 * time to join it.
 *
 * The room key is left out here and handed over only by the join route.
 * A key sitting in the list response would be in the browser's memory
 * from the moment the screen loaded, for every meeting of the week,
 * whether or not the person ever opened one.
 */
const forList = (m, user) => ({
  _id: m._id,
  title: m.title,
  agenda: m.agenda,
  scheduled_for: m.scheduled_for,
  audience: m.audience,
  roles: m.roles,
  status: m.status,
  started_at: m.started_at,
  ended_at: m.ended_at,
  notes: m.notes,
  created_by_name: m.created_by_name,
  mine: String(m.created_by) === String(user._id),
  attendee_count: (m.attendance || []).length,
  /**
   * Who is in the room at this moment — a left_at that is still empty.
   *
   * It is the one thing somebody deciding whether to join actually wants
   * to know: a meeting with four people already in it is happening, and
   * one with nobody in it ten minutes after the hour probably is not.
   */
  in_room: (m.attendance || []).filter((a) => !a.left_at).map((a) => a.name),
});

/**
 * GET /api/meetings
 *
 * Mine and the ones I am invited to, soonest first.
 */
const listMeetings = async (req, res) => {
  try {
    const { scope = 'upcoming' } = req.query;

    const filter = Meeting.invitedFilter(req.user);
    if (scope === 'past') {
      filter.$and = [{ $or: [{ status: 'ended' }, { status: 'cancelled' }] }];
    } else {
      filter.$and = [{ status: { $in: ['scheduled', 'live'] } }];
    }

    const meetings = await Meeting.find(filter)
      .sort({ scheduled_for: scope === 'past' ? -1 : 1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        meetings: meetings.map((m) => forList(m, req.user)),
        may_create: isOwner(req.user.role),
      },
    });
  } catch (err) {
    console.error('List meetings error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/meetings
 */
const createMeeting = async (req, res) => {
  try {
    if (!isOwner(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only an owner can call a meeting.' });
    }

    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'Give the meeting a title.' });

    const when = new Date(req.body?.scheduled_for);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ success: false, message: 'Pick a date and time.' });
    }

    const audience = ['everyone', 'roles', 'people'].includes(req.body?.audience)
      ? req.body.audience : 'everyone';

    const roles = (Array.isArray(req.body?.roles) ? req.body.roles : [])
      .filter((r) => Object.keys(ROLE_LEVELS).includes(r));
    const user_ids = (Array.isArray(req.body?.user_ids) ? req.body.user_ids : []).filter(Boolean);

    if (audience === 'roles' && roles.length === 0) {
      return res.status(400).json({ success: false, message: 'Pick at least one role.' });
    }
    if (audience === 'people' && user_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Pick at least one person.' });
    }

    const meeting = await Meeting.create({
      title,
      agenda: String(req.body?.agenda || '').trim(),
      scheduled_for: when,
      audience,
      roles: audience === 'roles' ? roles : [],
      user_ids: audience === 'people' ? user_ids : [],
      created_by: req.user._id,
      created_by_name: req.user.username,
    });

    /**
     * Telling the people who are expected to be there.
     *
     * A meeting nobody was told about is a meeting nobody attends, so the
     * invitation goes out on the notification system that is already
     * carrying the owners' messages — same bell, same phone alert. It is
     * deliberately not fatal: a meeting that was created but whose
     * invitations failed to send is still a meeting, and reporting it as
     * a failure would have the owner create it a second time.
     */
    let invited = 0;
    try {
      const filter = { is_active: true, _id: { $ne: req.user._id } };
      if (audience === 'roles') filter.role = { $in: roles };
      if (audience === 'people') filter._id = { $in: user_ids, $ne: req.user._id };

      const recipients = await User.find(filter).select('_id').lean();
      invited = recipients.length;

      await Promise.all(recipients.map((u) => notifyUser(u._id, {
        type: 'important',
        title: `Meeting: ${title}`,
        message: `${req.user.username} has called a meeting for ${when.toLocaleString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        })}.`,
        link: '/meetings',
        tag: `meeting-${meeting._id}`,
      })));
    } catch (notifyErr) {
      console.error('Meeting invitation error:', notifyErr.message);
    }

    return res.status(201).json({
      success: true,
      data: {
        meeting: forList(meeting.toObject(), req.user),
        /**
         * The confirmation rides inside data, not beside it.
         *
         * The browser's axios layer unwraps { success, data } and keeps
         * only data, so a message set as a sibling of it is dropped
         * before any screen sees it — which has quietly swallowed the
         * confirmation on three screens in this codebase already.
         */
        message: invited === 0
          ? 'Meeting saved. Nobody else was invited.'
          : `Meeting saved. ${invited} ${invited === 1 ? 'person has' : 'people have'} been told.`,
      },
    });
  } catch (err) {
    console.error('Create meeting error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/meetings/:id/join
 *
 * The one route that hands out a room key, and the only place that
 * decides somebody may be in the call. The signalling server asks the
 * same question again when the socket arrives, because a key that has
 * been handed out once can be passed on.
 */
const joinMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found.' });

    if (!Meeting.invites(meeting, req.user)) {
      return res.status(403).json({ success: false, message: 'You are not on the list for this meeting.' });
    }
    if (meeting.status === 'cancelled') {
      return res.status(409).json({ success: false, message: 'That meeting was cancelled.' });
    }
    if (meeting.status === 'ended') {
      return res.status(409).json({ success: false, message: 'That meeting has already ended.' });
    }

    if (meeting.status === 'scheduled') {
      meeting.status = 'live';
      meeting.started_at = new Date();
    }

    const existing = meeting.attendance.find((a) => String(a.user_id) === String(req.user._id));
    if (existing) {
      // Back after a dropped line, not a second arrival.
      existing.left_at = null;
      existing.joined_at = existing.joined_at || new Date();
    } else {
      meeting.attendance.push({
        user_id: req.user._id,
        name: req.user.username,
        role: req.user.role,
        joined_at: new Date(),
      });
    }
    await meeting.save();

    return res.status(200).json({
      success: true,
      data: {
        room_key: meeting.room_key,
        title: meeting.title,
        meeting_id: String(meeting._id),
        me: { id: String(req.user._id), name: req.user.username, role: req.user.role },
        ice_servers: await iceServers(),
        has_relay: hasRelay(),
        /**
         * How many cameras the room will carry at once.
         *
         * Every camera that comes on is another video stream every other
         * phone has to send and receive. Audio for eight people is
         * comfortable; eight cameras on mobile data is not, and the way
         * that fails is not a clear error but everybody's call slowly
         * turning to treacle. The cap is sent by the server so the
         * number can be changed without a new release.
         */
        camera_limit: Number(process.env.MEETING_CAMERA_LIMIT || 3),
      },
    });
  } catch (err) {
    console.error('Join meeting error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * Where the phones should look to find each other.
 *
 * STUN is how a phone discovers its own public address, and the public
 * servers are free. It is enough only when the two phones can reach
 * each other directly.
 *
 * TURN is the relay used when they cannot — which on mobile networks is
 * the normal case, not the exception, because a carrier puts thousands
 * of customers behind one address and there is no route in. One person
 * on the shop wifi and one on LTE is exactly that case. Without a
 * relay, those two never connect, however good both connections are.
 *
 * Two ways to provide one:
 *
 *   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN — credentials
 *   are minted here, per meeting, and expire. Nothing long-lived sits
 *   in the configuration, so a credential lifted from a browser is
 *   worth a day at most.
 *
 *   TURN_URL + TURN_USERNAME + TURN_PASSWORD — a fixed relay, for a
 *   self-hosted coturn.
 *
 * With neither, calls still work for anyone whose network allows a
 * direct line, and the tile says plainly when one did not.
 */

const STUN = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/**
 * Minted credentials, kept until they are nearly out of time.
 *
 * A meeting of eight people is eight joins within a minute, and asking
 * Cloudflare to mint a fresh credential for each is eight round trips
 * on the one request a person is waiting on. One credential serves the
 * shop for its lifetime.
 */
let turnCache = { servers: null, expires: 0 };

const cloudflareTurn = async () => {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return null;

  if (turnCache.servers && Date.now() < turnCache.expires) return turnCache.servers;

  const ttl = 86400; // a day
  const res = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!res.ok) throw new Error(`Cloudflare TURN said ${res.status}`);

  const body = await res.json();
  // The field has been both an object and an array across versions of
  // their API; accept either rather than break on a shape change.
  const raw = body?.iceServers;
  const servers = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  if (servers.length === 0) throw new Error('Cloudflare TURN returned no servers');

  // Let it go stale an hour early, so a credential never expires
  // in the middle of the meeting it was handed to.
  turnCache = { servers, expires: Date.now() + (ttl - 3600) * 1000 };
  return servers;
};

const staticTurn = () => {
  if (!process.env.TURN_URL) return null;
  return [{
    urls: process.env.TURN_URL.split(',').map((u) => u.trim()).filter(Boolean),
    username: process.env.TURN_USERNAME || undefined,
    credential: process.env.TURN_PASSWORD || undefined,
  }];
};

const iceServers = async () => {
  try {
    const cf = await cloudflareTurn();
    if (cf) return [...STUN, ...cf];
  } catch (err) {
    /**
     * A relay we could not reach must not stop the meeting.
     *
     * Everyone on the same network still connects without it, and a
     * meeting that refuses to open is worse than one where two people
     * on different networks cannot hear each other — which is what
     * happens anyway when there is no relay at all.
     */
    console.error('Cloudflare TURN unavailable:', err.message);
  }

  const fixed = staticTurn();
  return fixed ? [...STUN, ...fixed] : [...STUN];
};

/** Whether a relay is configured at all — the room says so if not. */
const hasRelay = () => Boolean(
  (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN)
  || process.env.TURN_URL
);

/**
 * POST /api/meetings/:id/leave
 *
 * Marks the person as out of the room. Best-effort by nature: a phone
 * that loses signal never sends it, which is why the signalling server
 * closes the row too when a socket drops.
 */
const leaveMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found.' });
    if (!Meeting.invites(meeting, req.user)) {
      return res.status(403).json({ success: false, message: 'You are not on the list for this meeting.' });
    }

    const row = meeting.attendance.find((a) => String(a.user_id) === String(req.user._id));
    if (row && !row.left_at) row.left_at = new Date();
    await meeting.save();

    return res.status(200).json({ success: true, data: { left: true } });
  } catch (err) {
    console.error('Leave meeting error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/meetings/:id/end — the owner closing the meeting for everyone.
 */
const endMeeting = async (req, res) => {
  try {
    if (!isOwner(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only an owner can end a meeting.' });
    }
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found.' });

    meeting.status = 'ended';
    meeting.ended_at = new Date();
    meeting.attendance.forEach((a) => { if (!a.left_at) a.left_at = new Date(); });
    await meeting.save();

    return res.status(200).json({
      success: true,
      data: { meeting: forList(meeting.toObject(), req.user), message: 'Meeting ended.' },
    });
  } catch (err) {
    console.error('End meeting error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/meetings/:id — the owner editing the details, or writing up
 * what was decided afterwards.
 */
const updateMeeting = async (req, res) => {
  try {
    if (!isOwner(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only an owner can change a meeting.' });
    }
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found.' });

    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      meeting.title = req.body.title.trim();
    }
    if (typeof req.body?.agenda === 'string') meeting.agenda = req.body.agenda.trim();
    if (typeof req.body?.notes === 'string') meeting.notes = req.body.notes.trim();
    if (req.body?.scheduled_for) {
      const when = new Date(req.body.scheduled_for);
      if (!Number.isNaN(when.getTime())) meeting.scheduled_for = when;
    }
    if (req.body?.status === 'cancelled') {
      meeting.status = 'cancelled';
    }
    await meeting.save();

    return res.status(200).json({
      success: true,
      data: { meeting: forList(meeting.toObject(), req.user), message: 'Saved.' },
    });
  } catch (err) {
    console.error('Update meeting error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  listMeetings, createMeeting, joinMeeting, leaveMeeting, endMeeting, updateMeeting,
  iceServers, hasRelay,
};
