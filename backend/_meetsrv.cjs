/**
 * A stand-in shop server for exercising a real meeting.
 *
 * The signalling file under test is the real one — utils/meetingSignals.js,
 * required unchanged. Only the two Mongoose models it reaches for are
 * replaced, so the test needs no database but still runs the real
 * authorisation, the real room bookkeeping and the real relay.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const ROOT = '/home/user/ittek-solution';
process.env.JWT_SECRET = 'test-secret-for-meetings';

const STAFF = {
  u1: { _id: 'u1', username: 'ama', role: 'Sales', is_active: true },
  u2: { _id: 'u2', username: 'kofi', role: 'Sales', is_active: true },
  u3: { _id: 'u3', username: 'boss', role: 'CEO', is_active: true },
  u4: { _id: 'u4', username: 'outsider', role: 'Engineer', is_active: true },
  u5: { _id: 'u5', username: 'esi', role: 'Sales', is_active: true },
  u6: { _id: 'u6', username: 'kwame', role: 'Sales', is_active: true },
  u7: { _id: 'u7', username: 'abena', role: 'Sales', is_active: true },
};

const MEETING = {
  _id: 'm1',
  title: 'Monday staff meeting',
  room_key: 'test-room-key-aaaaaaaaaaaaaaaaaaaa',
  status: 'live',
  audience: 'roles',
  roles: ['Sales'],
  user_ids: [],
  created_by: 'u3',
  created_by_name: 'boss',
  scheduled_for: new Date(),
  attendance: [],
  save: async () => {},
};

// ── Stub the two models, before meetingSignals requires them ───────────
const Module = require('module');
const realResolve = Module._resolveFilename;
const stubs = {
  [path.join(ROOT, 'backend/models/User.js')]: {
    findById: (id) => ({ select: () => ({ lean: async () => STAFF[id] || null }) }),
  },
  [path.join(ROOT, 'backend/models/Meeting.js')]: (() => {
    const M = {
      findOne: (q) => {
        const hit = q.room_key === MEETING.room_key ? MEETING : null;
        return Object.assign(Promise.resolve(hit), { lean: async () => hit });
      },
      invites: (m, user) => {
        if (!m || !user) return false;
        if (String(m.created_by) === String(user._id)) return true;
        if (m.audience === 'everyone') return true;
        if (m.audience === 'roles') return (m.roles || []).includes(user.role);
        return (m.user_ids || []).some((i) => String(i) === String(user._id));
      },
    };
    return M;
  })(),
};
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && request.startsWith('.')) {
    let resolved;
    try { resolved = realResolve.call(Module, request, parent, isMain); } catch { resolved = null; }
    if (resolved && stubs[resolved]) return stubs[resolved];
  }
  return realLoad.apply(this, arguments);
};

const { attach } = require(path.join(ROOT, 'backend/utils/meetingSignals.js'));

// ── The app ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const WHO = process.env.WHO || 'u1';
const token = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });

/** Who the caller really is, from the token, exactly as the real server does. */
const caller = (req) => {
  const raw = (req.headers.authorization || '').replace(/^Bearer /, '');
  try { return STAFF[jwt.verify(raw, process.env.JWT_SECRET).id] || null; } catch { return null; }
};

app.get('/api/auth/me', (req, res) =>
  res.json({ success: true, data: caller(req) || STAFF[WHO] }));

app.get('/api/meetings', (req, res) => {
  const u = caller(req);
  const owner = u && ['CEO', 'COO', 'Managing Director', 'Super Admin'].includes(u.role);
  const past = req.query.scope === 'past';
  res.json({
    success: true,
    data: {
      meetings: past ? [{
        ...MEETING, _id: 'm0', title: 'Stock review', status: 'ended',
        scheduled_for: new Date(Date.now() - 86400000),
        notes: 'Agreed to reorder 20 x 150W panels and chase Bogoso debt.',
        mine: !!owner, in_room: [], attendee_count: 4,
      }] : [
        { ...MEETING, mine: !!owner, in_room: ['kofi', 'esi'], attendee_count: 2 },
        { ...MEETING, _id: 'm2', title: 'Month end figures', status: 'scheduled',
          scheduled_for: new Date(Date.now() + 2 * 86400000), audience: 'everyone',
          agenda: 'Targets, and the new panel prices.',
          mine: !!owner, in_room: [], attendee_count: 0 },
      ],
      may_create: !!owner,
    },
  });
});

app.post('/api/meetings/:id/join', (req, res) => {
  const user = caller(req);
  if (!user) return res.status(401).json({ success: false, message: 'Not signed in.' });
  if (!stubs[path.join(ROOT, 'backend/models/Meeting.js')].invites(MEETING, user)) {
    return res.status(403).json({ success: false, message: 'You are not on the list for this meeting.' });
  }
  res.json({
    success: true,
    data: {
      room_key: MEETING.room_key,
      title: MEETING.title,
      meeting_id: 'm1',
      me: { id: user._id, name: user.username, role: user.role },
      ice_servers: JSON.parse(process.env.ICE || 'null') || [{ urls: ['stun:stun.l.google.com:19302'] }],
      has_relay: Boolean(process.env.ICE),
      camera_limit: 3,
    },
  });
});

app.post('/api/meetings/:id/leave', (req, res) => res.json({ success: true, data: { left: true } }));

app.get('/api/notifications/recipients', (req, res) => res.json({
  success: true,
  data: Object.values(STAFF).filter((u) => u._id !== 'u3')
    .map((u) => ({ _id: u._id, username: u.username, role: u.role })),
}));
app.get('/api/notifications/unread-count', (req, res) =>
  res.json({ success: true, data: { count: 0 } }));

app.use(express.static(path.join(ROOT, 'frontend/dist')));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'frontend/dist/index.html')));

const server = http.createServer(app);
attach(server);
server.listen(5240, () => {
  console.log('meeting stub on 5240');
  console.log('TOKENS', JSON.stringify({
    u1: token('u1'), u2: token('u2'), u3: token('u3'), u4: token('u4'),
    u5: token('u5'), u6: token('u6'), u7: token('u7'),
  }));
});
