/**
 * The Managing Director's screen.
 *
 * Two ways a screen like this fails. It cries wolf — an empty queue that is
 * never empty is a queue nobody reads — or it quietly disagrees with the
 * screen it summarises, which is worse, because then two numbers for the
 * same month both look authoritative.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let pending = { stockRequests: [], receipts: 0, refunds: [], defaulted: 0 };
let world = { sales: [], debts: [], lowStock: [], settings: null };

const chain = (rows) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  limit() { return this; },
  lean: async () => rows,
  then: (f, r) => Promise.resolve(rows).then(f, r),
  catch: (f) => Promise.resolve(rows).catch(f),
});

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/StockRequest')) return { find: () => chain(pending.stockRequests) };
  if (req.includes('models/ReceiptApproval')) return { countDocuments: async () => pending.receipts };
  if (req.includes('models/Refund')) return { find: () => chain(pending.refunds) };
  if (req.includes('models/CreditAgreement')) return { countDocuments: async () => pending.defaulted };
  if (req.includes('models/Sale')) return { find: () => chain(world.sales), aggregate: async () => [] };
  if (req.includes('models/Debt')) return { find: () => chain(world.debts) };
  if (req.includes('models/Product')) return { find: () => chain(world.lowStock) };
  if (req.includes('models/Settings')) return { findOne: async () => world.settings };
  if (req.includes('models/Expense')) return { aggregate: async () => [] };
  if (req.includes('models/Payable')) return { find: () => chain([]) };
  if (req.includes('models/Category')) return { find: () => chain([]) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/directorController.js'));
Module._load = orig;

const reset = () => {
  pending = { stockRequests: [], receipts: 0, refunds: [], defaulted: 0 };
  world = { sales: [], debts: [], lowStock: [], settings: null };
};

test('a quiet morning shows an empty queue', async () => {
  reset();
  assert.deepStrictEqual(await c.buildNeedsYou(), [],
    'nothing waiting must read as nothing waiting — that is the whole value of the block');
});

test('each kind of decision appears once, with enough to decide on', async () => {
  reset();
  pending.stockRequests = [
    { _id: 'a', total_amount: 8000, created_by: { username: 'ama' } },
    { _id: 'b', total_amount: 4400, created_by: { username: 'kofi' } },
  ];
  pending.receipts = 2;
  pending.refunds = [{ _id: 'r1', refund_amount: 450, reason: 'Faulty bulb' }];
  pending.defaulted = 1;

  const items = await c.buildNeedsYou();
  const keys = items.map((i) => i.key);
  assert.deepStrictEqual(keys, ['stock-requests', 'receipt-approvals', 'refund-r1', 'credit-agreements']);

  const stock = items[0];
  assert.match(stock.label, /2 stock requests waiting/);
  assert.match(stock.detail, /ama · kofi/, 'who asked');
  assert.match(stock.detail, /12400\.00|12,400/, 'and what it comes to');

  assert.match(items[2].label, /450\.00/, 'a refund says how much');
  assert.match(items[3].label, /in default/, 'and an agreement says what is wrong with it');
});

test('one of anything is not called "1 requests"', async () => {
  reset();
  pending.stockRequests = [{ _id: 'a', total_amount: 100, created_by: { username: 'ama' } }];
  pending.receipts = 1;
  pending.defaulted = 1;
  const labels = (await c.buildNeedsYou()).map((i) => i.label);
  assert.ok(labels.every((l) => !/1 \w+s\b/.test(l)), labels.join(' | '));
});

/**
 * "Worth a look" reports the shop's own rules back to it. Every threshold
 * here is one the shop set in Settings, so a line appearing means the shop
 * broke its own rule — not that somebody's idea of normal was violated.
 */
test('nothing is flagged when nothing is wrong', async () => {
  reset();
  world.settings = { fraud_settings: { max_discount_percent: 20, open_hour: 6, close_hour: 21 } };
  world.sales = [];
  assert.deepStrictEqual(await c.buildWorthALook(world.settings), []);
});

test('a discount is judged against the shop\'s own limit, not a guess', async () => {
  reset();
  const sale = {
    invoice_no: 'INV-1', subtotal: 1000, discount: 220, total_amount: 780,
    user_id: { username: 'kofi' }, sale_date: new Date(),
  };
  world.sales = [sale];

  // 22% against a 20% limit: flagged.
  let notes = await c.buildWorthALook({ fraud_settings: { max_discount_percent: 20, open_hour: 0, close_hour: 24 } });
  const discount = notes.find((n) => n.key === 'discount');
  assert.ok(discount, 'a discount over the limit is flagged');
  assert.match(discount.label, /kofi gave 22% discount/i);
  assert.match(discount.detail, /your limit is 20%/);

  // The same sale against a shop that allows 25%: silent.
  notes = await c.buildWorthALook({ fraud_settings: { max_discount_percent: 25, open_hour: 0, close_hour: 24 } });
  assert.strictEqual(notes.find((n) => n.key === 'discount'), undefined,
    'the same sale must not be flagged by a shop whose limit allows it');
});

test('trading hours come from settings too', async () => {
  reset();
  const at = (h) => { const d = new Date(); d.setHours(h, 40, 0, 0); return d; };
  world.sales = [{ invoice_no: 'INV-2', sale_date: at(21), total_amount: 100, discount: 0 }];

  let notes = await c.buildWorthALook({ fraud_settings: { open_hour: 6, close_hour: 21 } });
  assert.ok(notes.find((n) => n.key === 'hours'), '21:40 is outside a shop that shuts at 21:00');

  notes = await c.buildWorthALook({ fraud_settings: { open_hour: 6, close_hour: 23 } });
  assert.strictEqual(notes.find((n) => n.key === 'hours'), undefined,
    'and inside one that shuts at 23:00');
});

test('old debts are counted by what is still owed, not what was lent', async () => {
  reset();
  world.debts = [
    { customer_name: 'Sister Law', amount_owed: 5000, amount_paid: 1000, due_date: new Date('2026-08-01') },
    { customer_name: 'Mr Yaw', amount_owed: 4000, amount_paid: 600, due_date: new Date('2026-08-20') },
  ];
  const notes = await c.buildWorthALook({ fraud_settings: {} });
  const debt = notes.find((n) => n.key === 'debts');
  assert.ok(debt);
  assert.match(debt.label, /7400\.00|7,400/, '4000 + 3400 still owed, not 9000 lent');
  assert.match(debt.detail, /Sister Law/, 'and it names the oldest');
});
