/**
 * Who may read the stock count at the till.
 *
 * The shop's decision and a narrow one: the CEO, and nobody else. The
 * count used to sit under every price on the counter screen, where
 * anybody could read it — staff, a customer leaning over, a phone held
 * over somebody's shoulder.
 *
 * The rule lives in the browser, because what it hides is a figure on a
 * screen: the till needs the real stock numbers to know what it may
 * sell, so they reach the browser either way. This is not a lock, and
 * nothing here pretends it is. What it is, is a rule with exactly one
 * name in it — the kind that gets widened by accident the first time
 * somebody reaches for a level instead. So it is read off disk and
 * checked against every role the system has.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const B = path.join(__dirname, '..');

const { ROLE_LEVELS } = require(path.join(B, 'middleware/rbac.js'));
const ALL_ROLES = Object.keys(ROLE_LEVELS);

const src = fs.readFileSync(path.join(B, '../frontend/src/config/pageAccess.js'), 'utf8');

const rule = (() => {
  const m = src.match(/export const seesStockCounts = ([\s\S]*?)\n/);
  assert.ok(m, 'seesStockCounts not found in pageAccess.js — has it been renamed?');
  // eslint-disable-next-line no-new-func
  return new Function(`return ${m[1]}`)();
})();

test('the CEO sees the counts', () => {
  assert.strictEqual(rule('CEO'), true);
});

test('every other role does not, including the ones that outrank selling', () => {
  for (const role of ALL_ROLES.filter((r) => r !== 'CEO')) {
    assert.strictEqual(rule(role), false,
      `${role} must not see stock counts at the till`);
  }
  // Named outright, because each of these is a plausible "surely they
  // can" that would widen the rule the moment somebody reached for a
  // level instead of a name.
  for (const role of ['Super Admin', 'COO', 'Managing Director', 'Manager',
    'Head of Department', 'Sales']) {
    assert.strictEqual(rule(role), false, role);
  }
});

test('nothing leaks in from a missing or odd role', () => {
  for (const bad of [null, undefined, '', 'ceo', 'CEO ', ' CEO', 'Intern', 0, {}]) {
    assert.strictEqual(rule(bad), false, JSON.stringify(bad));
  }
});

test('it is a name, not a level', () => {
  // A level would sweep in everyone above it: level 3 is the COO and the
  // Managing Director as well, and level 2 every Manager and head of
  // department. The shop asked for one person.
  assert.ok(!/ROLE_LEVELS|roleLevel|>=/.test(
    src.match(/export const seesStockCounts = [\s\S]*?\n/)[0]),
  'seesStockCounts must not be written as a level comparison');
});

test('the till still refuses what it does not have, count or no count', () => {
  // The guard that matters is not the figure on screen. Both of these
  // live in POS.jsx and must stay keyed on the stock itself rather than
  // on who is looking at it.
  const pos = fs.readFileSync(path.join(B, '../frontend/src/pages/POS.jsx'), 'utf8');
  assert.ok(pos.includes('const outOfStock = product.quantity <= 0'),
    'an item with none left is still unsellable');
  assert.ok(/if \(line && line\.qty >= stock\)/.test(pos),
    'and the cart still cannot be filled past the shelf');
});
