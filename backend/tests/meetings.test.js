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
  assert.equal(clauses.length, 4);
  assert.deepEqual(clauses[0], { created_by: 'sales1' });
  assert.deepEqual(clauses[1], { audience: 'everyone' });
  assert.deepEqual(clauses[2], { audience: 'roles', roles: 'Sales' });
  assert.deepEqual(clauses[3], { audience: 'people', user_ids: 'sales1' });
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

test('only an owner may call a meeting, end one, or change one', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'controllers', 'meetingsController.js'), 'utf8'
  );
  // Each of the three owner-only handlers must carry the check. A new
  // handler added without one is the failure this guards against.
  ['createMeeting', 'endMeeting', 'updateMeeting'].forEach((fn) => {
    const body = src.slice(src.indexOf(`const ${fn} = async`));
    const head = body.slice(0, body.indexOf('const meeting') > 0 ? body.indexOf('const meeting') : 400);
    assert.ok(head.includes('isOwner(req.user.role)'), `${fn} is missing the owner check`);
  });
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

test('ICE config offers STUN always and TURN only when configured', () => {
  const { iceServers } = require('../controllers/meetingsController');

  delete process.env.TURN_URL;
  const bare = iceServers();
  assert.equal(bare.length, 1);
  assert.ok(bare[0].urls.some((u) => u.startsWith('stun:')));

  process.env.TURN_URL = 'turn:relay.example.com:3478';
  process.env.TURN_USERNAME = 'shop';
  process.env.TURN_PASSWORD = 'secret';
  const withTurn = iceServers();
  assert.equal(withTurn.length, 2);
  assert.deepEqual(withTurn[1].urls, ['turn:relay.example.com:3478']);
  assert.equal(withTurn[1].username, 'shop');
  delete process.env.TURN_URL;
  delete process.env.TURN_USERNAME;
  delete process.env.TURN_PASSWORD;
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
