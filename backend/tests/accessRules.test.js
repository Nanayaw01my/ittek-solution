/**
 * Who may sell, and where a Managing Director may go.
 *
 * Both rules are the kind that look right in a menu and leak through the
 * API, so these test the server's answer rather than the screen's: a hidden
 * button beside an open endpoint is a locked door beside an open window.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const B = path.join(__dirname, '..');

const { maySell, SELLING_ROLES, ROLE_LEVELS } = require(path.join(B, 'middleware/rbac.js'));
const { MANAGING_DIRECTOR_ALLOWED, HEAD_OF_DEPARTMENT_ALLOWED } = require(path.join(B, 'middleware/auth.js'));
const { carriesFieldSheets, isConfinedFieldAgent } = require(path.join(B, 'middleware/rbac.js'));

const ALL_ROLES = Object.keys(ROLE_LEVELS);

test('only the people who serve customers take money', () => {
  assert.deepStrictEqual(
    ALL_ROLES.filter(maySell).sort(),
    ['CEO', 'COO', 'Sales', 'Super Admin'],
  );
});

test('rank does not open the till', () => {
  // A Manager outranks a sales attendant; the MD outranks everyone but the
  // Super Admin. Neither serves customers.
  assert.strictEqual(maySell('Manager'), false);
  assert.strictEqual(maySell('Managing Director'), false);
  assert.ok(ROLE_LEVELS['Managing Director'] > ROLE_LEVELS.Sales,
    'and the one who may sell is the junior of the two');
});

test('an unknown role sells nothing', () => {
  for (const bad of ['', null, undefined, 'Intern', 'ADMIN']) {
    assert.strictEqual(maySell(bad), false, String(bad));
  }
});

/**
 * The Managing Director's allowlist is matched by path prefix, so the two
 * things worth testing are that their own screens are reachable and that a
 * near-miss is not.
 */
const reaches = (url) => {
  const p = url.split('?')[0];
  return MANAGING_DIRECTOR_ALLOWED.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
};

test('the four screens the MD was given all work', () => {
  const needed = [
    '/api/director/overview',
    '/api/debts', '/api/debts/abc123', '/api/debts/abc123/payment',
    '/api/suppliers', '/api/suppliers/abc123',
    '/api/stock-requests', '/api/stock-requests/abc123/approve',
    // The product picker inside a stock request, which the screen cannot
    // work without.
    '/api/products?search=panel',
    '/api/reminders',      // the Debts screen chases with these
    '/api/notifications', '/api/settings', '/api/auth/me',
  ];
  for (const url of needed) {
    assert.ok(reaches(url), `${url} must be reachable or the screen is broken`);
  }
});

test('everything outside the remit is shut, the till included', () => {
  const barred = [
    '/api/pos/sale', '/api/pos/sales', '/api/users', '/api/audit-logs',
    '/api/reports/dashboard', '/api/financial', '/api/expenses', '/api/backup',
    '/api/package-plans', '/api/refunds', '/api/purchases', '/api/categories',
  ];
  for (const url of barred) {
    assert.ok(!reaches(url), `${url} is outside the Managing Director's remit`);
  }
});

test('a prefix does not open a path that merely starts the same way', () => {
  // '/api/debts' must not hand over '/api/debtsomething'.
  assert.ok(!reaches('/api/debts-export'));
  assert.ok(!reaches('/api/suppliersx'));
  assert.ok(reaches('/api/debts/'), 'but the path itself, with a slash, is fine');
});


/**
 * Field duty is a duty, not a rank.
 *
 * The 'Field Agent' role means confined to the dispatch screens. The flag
 * means also does dispatch, and leaves everything else about the person
 * alone — which is the whole point: a head of department who spends
 * Tuesday selling in a village should not need a second account.
 */
test('anyone can carry a sheet, but only the role is confined by it', () => {
  const hod = { role: 'Head of Department', field_duty: true };
  const rep = { role: 'Field Agent' };
  const desk = { role: 'Head of Department' };

  assert.strictEqual(carriesFieldSheets(hod), true);
  assert.strictEqual(carriesFieldSheets(rep), true);
  assert.strictEqual(carriesFieldSheets(desk), false, 'without the flag, no sheets');

  assert.strictEqual(isConfinedFieldAgent(rep), true);
  assert.strictEqual(isConfinedFieldAgent(hod), false,
    'a head on field duty keeps the rest of their job');
});

test('field duty does not leak in from a missing or odd user', () => {
  for (const bad of [null, undefined, {}, { field_duty: 'no' }, { field_duty: 0 }]) {
    assert.strictEqual(carriesFieldSheets(bad), false, JSON.stringify(bad));
  }
});

const hodReaches = (url) => {
  const p = url.split('?')[0];
  return HEAD_OF_DEPARTMENT_ALLOWED.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
};

test('a head of department reaches their own work and nothing else', () => {
  for (const url of ['/api/departments/mine', '/api/departments/product/abc',
    '/api/stock-requests', '/api/products?search=panel', '/api/dispatches',
    '/api/damaged-goods', '/api/notifications', '/api/auth/me']) {
    assert.ok(hodReaches(url), `${url} must be reachable`);
  }
  for (const url of ['/api/pos/sale', '/api/debts', '/api/reports/dashboard',
    '/api/users', '/api/financial', '/api/aspects/sales', '/api/director/overview']) {
    assert.ok(!hodReaches(url), `${url} is outside a department head's work`);
  }
});
