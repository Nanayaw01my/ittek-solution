/**
 * A head of department's stock, and the two rules that keep it theirs.
 *
 * A head sees their own departments and nothing else, and may only sort a
 * product *into* a department they run. Without the second, "sorting" is a
 * way to move another head's goods onto your own books, and the first
 * anybody would know is a department total that changed overnight.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let saved = null;
let product = null;
const chain = (rows) => ({
  select() { return this; }, populate() { return this; }, sort() { return this; },
  limit() { return this; }, lean: async () => rows,
  then: (f, r) => Promise.resolve(rows).then(f, r),
});

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Product')) return {
    find: () => chain(global.__products || []),
    findById: () => ({ select: async () => product }),
  };
  if (req.includes('models/Category')) return { find: () => chain([]) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/departmentsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const head = (...departments) => ({ _id: 'u1', role: 'Head of Department', departments });

test('a head runs what they were given; an owner runs the lot', () => {
  assert.deepStrictEqual(c.departmentsFor(head('solar')), ['solar']);
  assert.deepStrictEqual(c.departmentsFor(head('solar', 'electrical')), ['solar', 'electrical']);
  assert.deepStrictEqual(c.departmentsFor({ role: 'CEO' }), ['solar', 'networking', 'electrical']);
});

test('a head with no department sees nothing, not everything', async () => {
  // The dangerous reading of an empty list. A new head must not open the
  // screen to the whole shop.
  assert.deepStrictEqual(c.departmentsFor(head()), []);
  const r = res();
  await c.myDepartments({ user: head() }, r);
  assert.deepStrictEqual(r.body.data.products, []);
  assert.deepStrictEqual(r.body.data.departments, []);
});

test('the screen shows my stock and the unplaced goods, not other departments', async () => {
  global.__products = [
    { _id: 'p1', name: 'NV-570W Panel', quantity: 12, low_stock_level: 5, aspect: 'solar' },
    { _id: 'p2', name: 'Hikvision Camera', quantity: 3, low_stock_level: 5, aspect: 'networking' },
    { _id: 'p3', name: 'Mystery Widget', quantity: 7, low_stock_level: 2, aspect: 'other' },
    { _id: 'p4', name: 'NV-100AH Battery', quantity: 2, low_stock_level: 4, aspect: 'solar' },
  ];
  const r = res();
  await c.myDepartments({ user: head('solar') }, r);
  const d = r.body.data;

  assert.deepStrictEqual(d.products.map((p) => p.name), ['NV-570W Panel', 'NV-100AH Battery']);
  assert.deepStrictEqual(d.unsorted.map((p) => p.name), ['Mystery Widget'],
    'what nobody has placed is offered on its own');
  // The shop asked for the whole catalogue to be reachable: a head knows
  // which stock is theirs better than a keyword does, and a solar panel
  // filed under IT is the case they had in mind. It is listed apart from
  // their own, so claiming one is a deliberate act.
  assert.deepStrictEqual(d.elsewhere.map((p) => p.name), ['Hikvision Camera'],
    'another department\'s stock is listed separately, not hidden');

  assert.strictEqual(d.departments[0].products, 2);
  assert.strictEqual(d.departments[0].pieces, 14);
  assert.strictEqual(d.departments[0].low, 1, 'the battery is under its reorder level');
});

test('sorting into a department you do not run is refused', async () => {
  product = { _id: 'p3', name: 'Mystery Widget', aspect: 'other', save: async () => {} };
  const r = res();
  await c.claimProduct({ user: head('solar'), params: { id: 'p3' }, body: { aspect: 'networking' } }, r);
  assert.strictEqual(r.code, 403);
});

test('claiming something nobody has placed works', async () => {
  product = { _id: 'p3', name: 'Mystery Widget', aspect: 'other', save: async () => {} };
  const r = res();
  await c.claimProduct({ user: head('solar'), params: { id: 'p3' }, body: { aspect: 'solar' } }, r);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(product.aspect, 'solar');
});

test('a product can be taken from another department, and the move is named', async () => {
  // This was refused until the shop asked for the opposite. What is kept
  // is that nobody moves another department's goods without being told
  // that is what they did — the reply says where it came from, and the
  // route writes an audit entry.
  product = { _id: 'p2', name: 'Hikvision Camera', aspect: 'networking', save: async () => {} };
  const r = res();
  await c.claimProduct({ user: head('solar'), params: { id: 'p2' }, body: { aspect: 'solar' } }, r);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(product.aspect, 'solar');
  assert.strictEqual(r.body.data.moved_from, 'networking');
  assert.match(r.body.data.message, /moved from IT to Solar/);
});

test('claiming something unplaced is not reported as a move', async () => {
  product = { _id: 'p3', name: 'Mystery Widget', aspect: 'other', save: async () => {} };
  const r = res();
  await c.claimProduct({ user: head('solar'), params: { id: 'p3' }, body: { aspect: 'solar' } }, r);
  assert.strictEqual(r.body.data.moved_from, null);
  assert.match(r.body.data.message, /Mystery Widget → Solar/);
});
