const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const B = path.join(__dirname, '..');

const rbac = require(path.join(B, 'middleware/rbac.js'));
const backendPages = require(path.join(B, 'config/pageAccess.js'));
const User = require(path.join(B, 'models/User.js'));

/**
 * Engineer is Sales by another name.
 *
 * Which is the whole risk in adding it. "Same as Sales" is not one setting
 * but a dozen lines scattered across the controllers — and the ones that
 * matter most are the quiet ones: a sales person is shown their own sales,
 * their own refunds and their own held carts, never the shop's. A role that
 * is added to the levels but missed in those checks does not fail loudly.
 * It shows a new member of staff every sale the shop has ever made.
 */

test('Engineer exists and sits exactly where Sales sits', async (t) => {
  await t.test('the database will accept it', () => {
    const roles = User.schema.path('role').enumValues;
    assert.ok(roles.includes('Engineer'), 'the model must allow the role at all');
  });

  await t.test('same level as Sales', () => {
    assert.strictEqual(rbac.ROLE_LEVELS.Engineer, rbac.ROLE_LEVELS.Sales);
    assert.strictEqual(rbac.ROLE_LEVELS.Engineer, 1);
  });

  await t.test('not an owner', () => {
    assert.strictEqual(rbac.isOwner('Engineer'), false);
    assert.ok(!rbac.OWNER_ROLES.includes('Engineer'));
  });

  await t.test('shut out of everything Manager and above', () => {
    // The level is what gates Cash Up, Customers, Purchases, Reports and the
    // rest. Equal to Sales means shut out of exactly the same list.
    for (const level of [2, 3, 4]) {
      assert.ok(rbac.ROLE_LEVELS.Engineer < level, `must not reach level ${level}`);
    }
  });

  await t.test('sees only their own sales, refunds and held carts', () => {
    assert.strictEqual(rbac.seesOwnRecordsOnly('Engineer'), true);
    assert.strictEqual(rbac.seesOwnRecordsOnly('Sales'), true);
    // And the owners still see everything.
    assert.strictEqual(rbac.seesOwnRecordsOnly('Manager'), false);
    assert.strictEqual(rbac.seesOwnRecordsOnly('CEO'), false);
  });

  await t.test('counted as staff, so a Manager can see them', () => {
    assert.ok(rbac.STAFF_ROLES.includes('Engineer'));
    assert.ok(!rbac.STAFF_ROLES.includes('CEO'));
  });

  await t.test('a new name added to the role table must be handled, not just listed', () => {
    // The guard this file exists for. Every role at level 1 that is not a
    // Field Agent is a shop-floor seller and must be in SELF_ONLY_ROLES —
    // otherwise adding the next one repeats the leak.
    const levelOne = Object.entries(rbac.ROLE_LEVELS)
      .filter(([role, lvl]) => lvl === 1 && role !== 'Field Agent')
      .map(([role]) => role);
    for (const role of levelOne) {
      assert.ok(rbac.seesOwnRecordsOnly(role),
        `${role} is level 1 but would see the whole shop's records`);
    }
  });
});

test('the two copies of the role table agree', async (t) => {
  // There is one in the API and one in the browser, and a role in only one
  // of them is a screen that shows in the sidebar and then answers 403.
  const frontend = require('fs')
    .readFileSync(path.join(B, '..', 'frontend/src/config/pageAccess.js'), 'utf8');

  await t.test('the browser knows about Engineer', () => {
    assert.match(frontend, /Engineer:\s*1/);
  });

  await t.test('the API has it at the same level in both of its tables', () => {
    assert.strictEqual(backendPages.ROLE_LEVELS?.Engineer ?? rbac.ROLE_LEVELS.Engineer, 1);
  });
});
