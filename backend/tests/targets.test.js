/**
 * Departments' targets, and the one door into this system that has no
 * login behind it.
 *
 * The IT department's own software pushes its figures in. It is a
 * machine, so it holds a shared key rather than a staff account — and
 * an endpoint reachable without a login is the one somebody will
 * eventually point a script at, so most of what follows is about that
 * door rather than about targets.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const B = path.join(__dirname, '..');
const { readTarget, keyAccepted, DEPT_KEYS } = require('../controllers/targetsController');
const { maySeeTargets, TARGET_ROLES } = require('../config/targets');
const Target = require('../models/Target');

const reqWith = (headers = {}) => ({
  get: (name) => headers[String(name).toLowerCase()] || undefined,
});

test('the key is required, and compared in constant time', () => {
  const real = process.env.TARGETS_API_KEY;

  // No key configured: nothing is let in, not even an empty one.
  delete process.env.TARGETS_API_KEY;
  assert.equal(keyAccepted(reqWith({ 'x-api-key': '' })), false);
  assert.equal(keyAccepted(reqWith({ 'x-api-key': 'anything' })), false);

  process.env.TARGETS_API_KEY = 'a-long-shared-secret-value';
  assert.equal(keyAccepted(reqWith({ 'x-api-key': 'a-long-shared-secret-value' })), true);
  assert.equal(keyAccepted(reqWith({ authorization: 'Bearer a-long-shared-secret-value' })), true);
  assert.equal(keyAccepted(reqWith({ 'x-api-key': 'a-long-shared-secret-valuX' })), false);
  assert.equal(keyAccepted(reqWith({ 'x-api-key': 'short' })), false, 'a prefix must not pass');
  assert.equal(keyAccepted(reqWith({})), false);

  const src = fs.readFileSync(path.join(B, 'controllers/targetsController.js'), 'utf8');
  assert.ok(src.includes('timingSafeEqual'),
    'a plain === leaks how much of a guess was right through how long it took');

  if (real === undefined) delete process.env.TARGETS_API_KEY;
  else process.env.TARGETS_API_KEY = real;
});

test('the push door is shut unless a key has been configured', () => {
  const src = fs.readFileSync(path.join(B, 'controllers/targetsController.js'), 'utf8');
  const push = src.slice(src.indexOf('const pushTarget'));
  assert.ok(push.indexOf('if (!process.env.TARGETS_API_KEY)') < push.indexOf('keyAccepted'),
    'a server with no key set must refuse outright, before any comparison');
});

test('the push door is rate limited on its own', () => {
  /**
   * The rest of the API sits behind a login; this does not. A limit on
   * the whole /api prefix is not enough when the thing being guessed is
   * a key.
   */
  const routes = fs.readFileSync(path.join(B, 'routes/targets.js'), 'utf8');
  const push = routes.slice(routes.indexOf("router.post(\n  '/push'"), routes.indexOf('router.use(authenticate)'));
  assert.ok(push.includes('rateLimit('), 'the push route needs its own limiter');
  assert.ok(/max: \d+/.test(push), 'and a ceiling');
  assert.ok(push.includes("limit: '64kb'"), 'and a body it will not swallow whole');
});

test('the outside system cannot store what the screen would refuse', () => {
  // One reader for both doors, so there is no second, laxer way in.
  assert.ok(readTarget({ department: 'nope', target: 5 }).error, 'unknown department');
  assert.ok(readTarget({ department: 'networking', month: 13, target: 5 }).error, 'a thirteenth month');
  assert.ok(readTarget({ department: 'networking', year: 1999, target: 5 }).error, 'a year out of range');
  assert.ok(readTarget({ department: 'networking', target: -1 }).error, 'a negative target');
  assert.ok(readTarget({ department: 'networking', achieved: -2 }).error, 'negative progress');
  assert.ok(readTarget({ department: 'networking' }).error, 'nothing to save at all');

  const ok = readTarget({ department: 'NETWORKING', year: 2026, month: 11, target: '12' });
  assert.ok(!ok.error);
  assert.equal(ok.value.department, 'networking', 'the department is matched case-insensitively');
  assert.equal(ok.value.target, 12, 'and a numeric string is a number');
});

test('omitting progress is not reporting zero', () => {
  /**
   * A sender that says nothing about progress must not wipe the figure
   * already stored. "Not reported" and "none done" are different facts
   * and the second one gets a department chased.
   */
  const parsed = readTarget({ department: 'solar', target: 10 });
  assert.ok(!('achieved' in parsed.value),
    'an absent achieved must not become a value');

  const zero = readTarget({ department: 'solar', achieved: 0 });
  assert.equal(zero.value.achieved, 0, 'but an explicit zero is a real report');
});

test('progress of nothing reported is null, not nought per cent', () => {
  assert.equal(Target.progressOf({ target: 10, achieved: null }), null);
  assert.equal(Target.progressOf({ target: 10, achieved: 0 }), 0);
  assert.equal(Target.progressOf({ target: 10, achieved: 5 }), 50);
  assert.equal(Target.progressOf({ target: 10, achieved: 12 }), 120, 'beating it is not capped');
  assert.equal(Target.progressOf({ target: 0, achieved: 3 }), 100, 'no goal, work done');
});

test('targets are for the three roles the shop named, and not the COO', () => {
  assert.deepEqual(TARGET_ROLES, ['CEO', 'Managing Director', 'Super Admin']);
  assert.equal(maySeeTargets('COO'), false,
    'level 3 would have included the COO; the shop named three people');
  assert.equal(maySeeTargets('Manager'), false);
  for (const role of TARGET_ROLES) assert.equal(maySeeTargets(role), true);

  // Both reading and writing check it, or the screen is a formality.
  const src = fs.readFileSync(path.join(B, 'controllers/targetsController.js'), 'utf8');
  assert.equal((src.match(/maySeeTargets\(req\.user\.role\)/g) || []).length, 2,
    'listing and setting must both check');
});

test('the browser and the server agree on who may look', () => {
  const browser = fs.readFileSync(
    path.join(B, '..', 'frontend/src/config/pageAccess.js'), 'utf8');
  const listed = browser.match(/export const TARGET_ROLES = \[([^\]]+)\]/)[1]
    .split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(listed, TARGET_ROLES,
    'the menu hides Targets using the browser copy; drifted, a role sees a page the server refuses');
});

test('the Managing Director can actually reach it', () => {
  /**
   * The MD is governed by an allowlist rather than a level, so being
   * named in TARGET_ROLES is not enough: the request would be stopped
   * before the controller ever ran, and the page would be in their menu
   * and refuse them.
   */
  const auth = require('../middleware/auth');
  assert.ok(auth.MANAGING_DIRECTOR_ALLOWED.includes('/api/targets'));

  const layout = fs.readFileSync(
    path.join(B, '..', 'frontend/src/components/Layout.jsx'), 'utf8');
  const md = layout.slice(layout.indexOf('MANAGING_DIRECTOR_PAGES'), layout.indexOf('A sales attendant'));
  assert.ok(md.includes("'/targets'"), 'and the screen must be in their list too');
});

test('every department the shop sells is targetable, except Unsorted', () => {
  assert.ok(DEPT_KEYS.includes('solar') && DEPT_KEYS.includes('networking')
    && DEPT_KEYS.includes('electrical'));
  assert.ok(!DEPT_KEYS.includes('other'),
    'Unsorted is where the guesser puts what it could not place — not a department anybody is given a goal');
});
