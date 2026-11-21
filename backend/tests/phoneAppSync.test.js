/**
 * Reading the phone system's figures.
 *
 * Nobody here has seen that API's replies, so this is written the way
 * the code is: against the shapes such an endpoint normally has, rather
 * than against one guess treated as fact. If the real reply is none of
 * these, the sync says so and hands back a sample — which is the
 * behaviour these also pin down.
 */
const test = require('node:test');
const assert = require('node:assert');

const {
  PHONE_DEPARTMENT, periodOf, rowsOf, CANDIDATE_PATHS,
} = require('../utils/phoneAppSync');

test('everything from that system is the IT department’s', () => {
  /**
   * dandorsolar.site reports phone sales and nothing else, and phone
   * sales are part of IT. An earlier version guessed a department out
   * of whatever text it found and threw away rows it could not place —
   * which, for a feed that only ever means one thing, is a way to lose
   * the figure this was built for.
   */
  assert.equal(PHONE_DEPARTMENT, 'networking');
});

test('the sync records what was sold, never the target', () => {
  /**
   * That system reports what has been done; the goal is the shop's to
   * set, and the CEO sets it on the Targets screen. Writing a target
   * from this feed would overwrite the number an owner typed with
   * whatever the phone system happened to call "target", invisibly.
   */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils/phoneAppSync.js'), 'utf8');
  const loop = src.slice(src.indexOf('for (const row of rows)'), src.indexOf('if (saved.length === 0)'));

  assert.ok(loop.includes('achieved_source'), 'it writes the figure achieved');
  assert.ok(!/target_source|target_set_by/.test(loop),
    'and must never stamp itself as the author of a target');
  assert.ok(!/\btarget,/.test(loop.replace('$setOnInsert: { target: 0', '')),
    'nor write a target value from the feed');
  assert.ok(loop.includes('$setOnInsert: { target: 0'),
    'a month with no goal set still gets its row, with a goal of nought');
});

test('the month is read from whichever way it was written', () => {
  assert.deepEqual(periodOf({ year: 2026, month: 11 }), { year: 2026, month: 11 });
  assert.deepEqual(periodOf({ period: '2026-11' }), { year: 2026, month: 11 });
  assert.deepEqual(periodOf({ period: '2026/11' }), { year: 2026, month: 11 });
  assert.deepEqual(periodOf({ month_key: '202611' }), { year: 2026, month: 11 });
  assert.deepEqual(periodOf({ period: '2026-11-15' }), { year: 2026, month: 11 },
    'a full date is the month it falls in');

  const now = new Date();
  assert.deepEqual(periodOf({}), { year: now.getFullYear(), month: now.getMonth() + 1 },
    'nothing said means this month');
  assert.deepEqual(periodOf({ month: 13 }), { year: now.getFullYear(), month: now.getMonth() + 1 },
    'a nonsense month is not stored as one');
});

test('the rows are found inside whatever envelope they came in', () => {
  const row = { department: 'IT', target: 12, achieved: 7 };

  assert.deepEqual(rowsOf([row]), [row], 'a bare array');
  assert.deepEqual(rowsOf({ data: [row] }), [row], 'wrapped in data');
  assert.deepEqual(rowsOf({ targets: [row] }), [row], 'wrapped in targets');
  assert.deepEqual(rowsOf({ results: [row] }), [row], 'wrapped in results');
  assert.deepEqual(rowsOf({ data: { targets: [row] } }), [row], 'wrapped twice');
  assert.deepEqual(rowsOf(row), [row], 'a single row, unwrapped');

  assert.equal(rowsOf({ message: 'hello' }), null,
    'something with no figures in it is not a list of figures');
  assert.equal(rowsOf(null), null);
});

test('a key that is refused stops the search there', () => {
  /**
   * The address was right and the key was wrong. Carrying on down the
   * list would tell nobody anything and would look, from their end,
   * like somebody trying addresses with a stolen key.
   */
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils/phoneAppSync.js'), 'utf8');
  const loop = src.slice(src.indexOf('for (const path of paths)'));
  assert.ok(loop.indexOf('refused the key') < loop.indexOf('answer.status >= 400'),
    'a 401 must return, not continue to the next address');
});

test('a reply that cannot be read is reported with the evidence', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils/phoneAppSync.js'), 'utf8');
  assert.ok(src.includes('sample: JSON.stringify(rows[0]'),
    'the first row it could not read must come back, or the mismatch cannot be seen');

  const page = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'frontend/src/pages/Targets.jsx'), 'utf8');
  assert.ok(page.includes('report.sample'), 'and the screen must print it');
});

test('a hand-set address is tried alone', () => {
  // Once somebody knows the real one, knocking on five others is both
  // pointless and indistinguishable from probing.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils/phoneAppSync.js'), 'utf8');
  assert.ok(src.includes('PHONE_APP_API_PATH'), 'the address must be settable');
  assert.ok(src.includes('? [override.startsWith'), 'and when set, used on its own');

  assert.ok(CANDIDATE_PATHS.length <= 8, 'the guess list stays short');
});

test('nothing happens at all without a key', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'utils/phoneAppSync.js'), 'utf8');
  const fn = src.slice(src.indexOf('const syncFromPhoneApp'));
  assert.ok(fn.indexOf('if (!key)') < fn.indexOf('for (const path'),
    'no key means no request is made at all');
});
