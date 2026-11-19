const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

/**
 * Meetings: who is invited, and who gets into the room.
 *
 * The invitation rule is asked in two places that must never disagree —
 * invites(), which guards the door, and invitedFilter(), which builds
 * the list. A meeting that appears in somebody's list and then refuses
 * them, or one they can walk into without ever being shown it, are both
 * bugs this file exists to catch.
 */

const Meeting = require('../models/Meeting');

const OWNER = { _id: 'owner1', role: 'CEO', username: 'boss' };
const SALES = { _id: 'sales1', role: 'Sales', username: 'ama' };
const OTHER = { _id: 'sales2', role: 'Sales', username: 'kofi' };
const HOD = { _id: 'hod1', role: 'Head of Department', username: 'yaw' };

const meeting = (over = {}) => ({
  created_by: 'owner1', audience: 'everyone', roles: [], user_ids: [], ...over,
});

test('everyone: all staff are invited', () => {
  const m = meeting();
  assert.equal(Meeting.invites(m, SALES), true);
  assert.equal(Meeting.invites(m, HOD), true);
});

test('roles: only the named roles are invited', () => {
  const m = meeting({ audience: 'roles', roles: ['Sales'] });
  assert.equal(Meeting.invites(m, SALES), true);
  assert.equal(Meeting.invites(m, HOD), false);
});

test('people: only the named people are invited', () => {
  const m = meeting({ audience: 'people', user_ids: ['sales1'] });
  assert.equal(Meeting.invites(m, SALES), true);
  assert.equal(Meeting.invites(m, OTHER), false);
});

test('whoever called the meeting is always in it', () => {
  /**
   * An owner inviting "the sales attendants" is not a sales attendant,
   * so a rule written only from the audience would shut them out of the
   * meeting they themselves called.
   */
  const m = meeting({ audience: 'roles', roles: ['Sales'] });
  assert.equal(Meeting.invites(m, OWNER), true);

  const byPeople = meeting({ audience: 'people', user_ids: ['sales1'] });
  assert.equal(Meeting.invites(byPeople, OWNER), true);
});

test('nothing and nobody are refused rather than thrown at', () => {
  assert.equal(Meeting.invites(null, SALES), false);
  assert.equal(Meeting.invites(meeting(), null), false);
});

test('the list query matches the door, clause for clause', () => {
  /**
   * invitedFilter builds a Mongo query, so it cannot be called against a
   * plain object. What can be checked — and what has actually gone wrong
   * in codebases like this — is that it asks about the same four cases
   * the door does, and keys them on the same fields.
   */
  const f = Meeting.invitedFilter(SALES);
  const clauses = f.$or;
  assert.equal(clauses.length, 5);
  assert.deepEqual(clauses[0], { created_by: 'sales1' });
  // Running a meeting puts you in it, the same as calling one does.
  assert.deepEqual(clauses[1], { host_id: 'sales1' });
  assert.deepEqual(clauses[2], { audience: 'everyone' });
  assert.deepEqual(clauses[3], { audience: 'roles', roles: 'Sales' });
  assert.deepEqual(clauses[4], { audience: 'people', user_ids: 'sales1' });
});

test('a room key is random, long, and different every time', () => {
  /**
   * The key is the one secret in the document: anyone holding it can ask
   * the signalling server to put them through. Derived from the meeting
   * id it would be guessable from a URL.
   */
  const schema = Meeting.schema.path('room_key');
  const a = schema.defaultValue();
  const b = schema.defaultValue();
  assert.notEqual(a, b);
  assert.ok(a.length >= 30, `room key too short: ${a.length}`);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(a), 'room key must be URL-safe');
});

test('only an owner may call a meeting or change one', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'meetingsController.js'), 'utf8'
  );
  ['createMeeting', 'updateMeeting'].forEach((fn) => {
    const body = src.slice(src.indexOf(`const ${fn} = async`));
    const head = body.slice(0, body.indexOf('const meeting') > 0 ? body.indexOf('const meeting') : 400);
    assert.ok(head.includes('isOwner(req.user.role)'), `${fn} is missing the owner check`);
  });
});

test('the host ends their own meeting; nobody else but an owner can', () => {
  /**
   * The point of naming a host is that they run the meeting without
   * coming back to an owner at every step, and closing it is the step
   * they would hit every single time. Cancelling is deliberately not
   * theirs: calling a meeting off belongs to whoever put it in the
   * diary.
   */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'meetingsController.js'), 'utf8'
  );
  const end = src.slice(src.indexOf('const endMeeting = async'), src.indexOf('PUT /api/meetings/:id'));
  assert.ok(end.includes('meeting.host_id') && end.includes('req.user._id'),
    'ending must recognise the host');
  assert.ok(end.includes('!hosts && !isOwner(req.user.role)'),
    'and still allow any owner');

  const page = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'Meetings.jsx'), 'utf8'
  );
  assert.ok(page.includes('{(canManage || m.i_host) && !over && ('),
    'the End button must be drawn for the host');
  assert.ok(page.includes('{canManage && !over && ('),
    'Cancel must not be — the server refuses it, and offering a refusal is worse than offering nothing');
});

test('a host is in the meeting they are running, whatever the audience says', () => {
  /**
   * A manager asked to chair the sales attendants' meeting is not a
   * sales attendant. Shut out of the meeting they were told to run,
   * the feature looks untested the first time it is used.
   */
  const Meeting = require('../models/Meeting');
  const m = {
    created_by: 'owner1', audience: 'roles', roles: ['Sales'], user_ids: [], host_id: 'mgr1',
  };
  assert.equal(Meeting.invites(m, { _id: 'mgr1', role: 'Manager' }), true);
  assert.equal(Meeting.invites(m, { _id: 'mgr2', role: 'Manager' }), false);

  // And it must be listed for them too, or they would never find it.
  const clauses = Meeting.invitedFilter({ _id: 'mgr1', role: 'Manager' }).$or;
  assert.ok(clauses.some((c) => c.host_id === 'mgr1'),
    'the list query must include meetings they host');
});

test('a host is read off an account, never taken from the request', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'meetingsController.js'), 'utf8'
  );
  const fn = src.slice(src.indexOf('const resolveHost'), src.indexOf('POST /api/meetings', src.indexOf('const resolveHost')));
  assert.ok(fn.includes('User.findById'), 'the account decides the name');
  assert.ok(fn.includes('is_active === false'), 'a disabled account cannot be put in charge');
  assert.ok(fn.includes('fallback'), 'and a meeting with no host named falls to its caller');
});

test('joining hands back a room key; listing never does', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'meetingsController.js'), 'utf8'
  );
  const forList = src.slice(src.indexOf('const forList'), src.indexOf('GET /api/meetings'));
  assert.ok(!forList.includes('room_key'),
    'the list response must not carry room keys — they would sit in the browser for every meeting of the week');

  const join = src.slice(src.indexOf('const joinMeeting'), src.indexOf('const iceServers'));
  assert.ok(join.includes('room_key: meeting.room_key'), 'join must hand back the room key');
  assert.ok(join.includes('Meeting.invites('), 'join must check the invitation');
});

test('the signalling server checks the login and the invitation, not just the key', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils', 'meetingSignals.js'), 'utf8'
  );
  const auth = src.slice(src.indexOf('const authorise'), src.indexOf('const RELAYED'));
  assert.ok(auth.includes('jwt.verify('), 'a room key alone must not admit anybody');
  assert.ok(auth.includes('Meeting.invites('), 'the account must be on the invitation list');
  assert.ok(auth.includes("status === 'ended'"), 'an ended meeting must not accept new sockets');
});

test('a relayed message cannot name its own sender', () => {
  /**
   * `from` is stamped by the server. A client that could set it would be
   * able to impersonate anybody else in the room — offering them a
   * connection in somebody else's name.
   */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils', 'meetingSignals.js'), 'utf8'
  );
  assert.ok(src.includes('from: id'), 'the server must stamp the sender');
  assert.ok(/\.\.\.msg, to: undefined, from: id/.test(src),
    'the relayed message must have the server-set sender last so it cannot be overridden');
});

test('ICE config offers STUN always and a relay only when configured', async () => {
  const { iceServers, hasRelay } = require('../controllers/meetingsController');

  delete process.env.TURN_URL;
  delete process.env.CLOUDFLARE_TURN_KEY_ID;
  delete process.env.CLOUDFLARE_TURN_API_TOKEN;

  const bare = await iceServers();
  assert.equal(bare.length, 1);
  assert.ok(bare[0].urls.some((u) => u.startsWith('stun:')));
  assert.equal(hasRelay(), false, 'with nothing configured the room must admit it has no relay');

  process.env.TURN_URL = 'turn:relay.example.com:3478';
  process.env.TURN_USERNAME = 'shop';
  process.env.TURN_PASSWORD = 'secret';
  const withTurn = await iceServers();
  assert.equal(withTurn.length, 2);
  assert.deepEqual(withTurn[1].urls, ['turn:relay.example.com:3478']);
  assert.equal(withTurn[1].username, 'shop');
  assert.equal(hasRelay(), true);
  delete process.env.TURN_URL;
  delete process.env.TURN_USERNAME;
  delete process.env.TURN_PASSWORD;
});

test('a relay that cannot be reached does not stop the meeting', async () => {
  /**
   * Everyone on one network still connects without a relay. A join
   * that threw because Cloudflare was slow would take the meeting away
   * from the people who could have held it.
   */
  const { iceServers } = require('../controllers/meetingsController');
  process.env.CLOUDFLARE_TURN_KEY_ID = 'nope';
  process.env.CLOUDFLARE_TURN_API_TOKEN = 'nope';

  const real = global.fetch;
  global.fetch = async () => { throw new Error('network down'); };
  const servers = await iceServers();
  global.fetch = real;

  assert.ok(servers.length >= 1, 'STUN must survive a failed relay');
  assert.ok(servers[0].urls.some((u) => u.startsWith('stun:')));
  delete process.env.CLOUDFLARE_TURN_KEY_ID;
  delete process.env.CLOUDFLARE_TURN_API_TOKEN;
});

test('every role can reach the meetings API', () => {
  /**
   * Joining a meeting is not a rank. The four roles that are governed by
   * an allowlist rather than a level each have to name it, and a role
   * that does not would see the screen in its menu and get a 403 at it.
   */
  const auth = require('../middleware/auth');
  [auth.MANAGING_DIRECTOR_ALLOWED, auth.HEAD_OF_DEPARTMENT_ALLOWED, auth.SALES_ALLOWED]
    .forEach((list) => assert.ok(list.includes('/api/meetings'),
      'a confined role is missing /api/meetings'));
});

test('the browser and the server agree on who may call a meeting', () => {
  const browser = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'frontend', 'src', 'config', 'pageAccess.js'), 'utf8'
  );
  const { OWNER_ROLES } = require('../middleware/rbac');
  const listed = browser.match(/export const OWNER_ROLES = \[([^\]]+)\]/)[1]
    .split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(listed.sort(), [...OWNER_ROLES].sort(),
    'the Meetings screen hides New Meeting using the browser copy of OWNER_ROLES; if it drifts, a role sees a button the server refuses');
});

test('no arriving voice is ever handed to Web Audio', () => {
  /**
   * createMediaStreamSource does not observe a stream, it takes it: the
   * stream's playback is re-routed into the Web Audio graph, and
   * anything the graph does not pass on to a destination is never
   * heard.
   *
   * The speaking indicator was built on it and pointed at every voice
   * arriving from another person. The result was a meeting that
   * connected perfectly, decoded every packet, lit every tile — and was
   * completely silent. No measurement of the stream could show it,
   * because the audio was all still there; it was simply taken
   * somewhere other than the speaker.
   *
   * Our own microphone is the one safe case: it is never played back.
   * Everybody else's loudness comes from the connection's statistics.
   *
   * The browser test in the scratchpad proves this end to end by
   * watching createMediaStreamSource itself. This is the cheap version
   * that runs on every commit.
   */
  const hook = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'useMeetingRoom.js'), 'utf8'
  );

  const ontrack = hook.slice(hook.indexOf('pc.ontrack'), hook.indexOf('pc.onconnectionstatechange'));
  assert.ok(!ontrack.includes('meter('),
    'a stream arriving from another person must never be passed to the Web Audio meter');

  // The meter may be pointed at exactly one thing: our own microphone.
  const calls = hook.match(/[^a-zA-Z]meter\(([^,)]+)/g) || [];
  calls.forEach((c) => {
    assert.ok(c.includes('localStream.current'),
      `meter() may only be given our own microphone, not ${c.trim()}`);
  });

  assert.ok(hook.includes('audioLevel'),
    'remote speaking must be read from the connection statistics, which only read');
});

test('Cloudflare relay credentials are passed through, in either shape, and cached', async () => {
  /**
   * Their API has returned `iceServers` both as one object and as an
   * array across versions. Accepting either costs a line and means a
   * shape change does not take the shop's meetings down.
   */
  const { iceServers } = require('../controllers/meetingsController');
  process.env.CLOUDFLARE_TURN_KEY_ID = 'key123';
  process.env.CLOUDFLARE_TURN_API_TOKEN = 'token123';

  const real = global.fetch;
  let calls = 0;
  let sentAuth = null;
  let sentUrl = null;

  global.fetch = async (url, opts) => {
    calls += 1;
    sentUrl = url;
    sentAuth = opts.headers.Authorization;
    return {
      ok: true,
      json: async () => ({
        iceServers: {
          urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:5349?transport=tcp'],
          username: 'minted-user',
          credential: 'minted-secret',
        },
      }),
    };
  };

  const first = await iceServers();
  global.fetch = real;

  assert.ok(String(sentUrl).includes('/v1/turn/keys/key123/credentials/generate-ice-servers'),
    `wrong endpoint: ${sentUrl}`);
  assert.equal(sentAuth, 'Bearer token123');

  const relay = first.find((s) => (s.urls || []).some((u) => String(u).startsWith('turn')));
  assert.ok(relay, 'the minted relay must reach the browser');
  assert.equal(relay.username, 'minted-user');
  assert.equal(relay.credential, 'minted-secret');
  assert.ok(first[0].urls.some((u) => u.startsWith('stun:')), 'STUN stays alongside it');

  // A meeting of eight is eight joins in a minute; one mint serves them.
  global.fetch = async () => { throw new Error('should not be called again'); };
  const second = await iceServers();
  global.fetch = real;
  assert.equal(calls, 1, 'credentials must be cached, not minted per join');
  assert.deepEqual(second, first);

  delete process.env.CLOUDFLARE_TURN_KEY_ID;
  delete process.env.CLOUDFLARE_TURN_API_TOKEN;
});
