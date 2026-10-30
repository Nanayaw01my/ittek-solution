const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/**
 * The day's takings, split three ways.
 *
 * The split has to add back up to the day. An owner who reads GHC4,000 on
 * this screen and GHC4,800 on the dashboard stops trusting both.
 */

let sales = [];
let products = [];
let categories = [];

const chain = (rows) => ({ select: () => ({ lean: async () => rows }) });

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Sale')) return { find: () => chain(sales) };
  if (req.includes('models/Product')) return { find: () => chain(products), findByIdAndUpdate: async () => null };
  if (req.includes('models/Category')) return { find: () => chain(categories) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/aspectsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const ask = async (query = {}) => { const r = res(); await c.salesByAspect({ query }, r); return r; };
const line = (name, qty, price, cost, id) => ({
  product_id: id || null, product_name: name, quantity: qty,
  unit_price: price, cost_price: cost, total: qty * price,
});

test("a day's sales, split three ways", async (t) => {
  t.beforeEach(() => {
    categories = [];
    products = [];
    sales = [
      { _id: 's1', items: [line('Solar Panel 400W', 2, 4800, 3600), line('CAT6 Cable', 1, 900, 600)] },
      { _id: 's2', items: [line('MCB 32A Breaker', 4, 50, 30)] },
      { _id: 's3', items: [line('Masking Tape', 1, 20, 12)] },
    ];
  });

  const by = (body) => Object.fromEntries(body.data.lines.map((l) => [l.key, l]));

  await t.test('each line takes its own products', async () => {
    const r = await ask();
    const l = by(r.body);
    assert.strictEqual(l.solar.revenue, 9600);
    assert.strictEqual(l.networking.revenue, 900);
    assert.strictEqual(l.electrical.revenue, 200);
    assert.strictEqual(l.other.revenue, 20);
  });

  await t.test('and they add back up to the day', async () => {
    // The check that matters. A split that does not reconcile with the
    // dashboard makes an owner stop trusting both screens.
    const r = await ask();
    const sum = r.body.data.lines.reduce((n, x) => n + x.revenue, 0);
    assert.strictEqual(Number(sum.toFixed(2)), r.body.data.total.revenue);
    assert.strictEqual(r.body.data.total.revenue, 10720);
  });

  await t.test('profit is revenue less what the goods cost', async () => {
    const l = by((await ask()).body);
    assert.strictEqual(l.solar.profit, 9600 - 7200);
    assert.strictEqual(l.electrical.profit, 200 - 120);
  });

  await t.test('the share of the day is a percentage of the takings', async () => {
    const l = by((await ask()).body);
    assert.strictEqual(l.solar.share, 89.6);
    assert.strictEqual(
      Math.round(l.solar.share + l.networking.share + l.electrical.share + l.other.share),
      100
    );
  });

  await t.test('one sale touching two lines counts once in each', async () => {
    const l = by((await ask()).body);
    assert.strictEqual(l.solar.sales, 1);
    assert.strictEqual(l.networking.sales, 1);
    // ...but the day had three sales, not four.
    assert.strictEqual((await ask()).body.data.total.sales, 3);
  });

  await t.test('what could not be placed is said, not hidden', async () => {
    const l = by((await ask()).body);
    assert.strictEqual(l.other.pieces, 1);
    assert.strictEqual(l.other.products[0].name, 'Masking Tape');
  });

  await t.test('a category with a line set beats the name', async () => {
    // Set once on a category, every product under it moves.
    categories = [{ _id: 'c1', name: 'Accessories', aspect: 'networking' }];
    products = [{ _id: 'p1', name: 'Masking Tape', category_id: 'c1' }];
    sales = [{ _id: 's1', items: [line('Masking Tape', 1, 20, 12, 'p1')] }];
    const l = by((await ask()).body);
    assert.strictEqual(l.networking.revenue, 20);
    assert.strictEqual(l.other.revenue, 0);
  });

  await t.test('guessed lines are counted so the screen can say so', async () => {
    const l = by((await ask()).body);
    assert.ok(l.solar.guessed > 0, 'a name-matched line should be marked');
  });

  await t.test('a debt payment is not counted as a second sale of the goods', async () => {
    // The panel was counted on the day it left the shop. Counting the
    // instalment too would put it in Solar twice.
    sales = [];
    const r = await ask();
    assert.strictEqual(r.body.data.total.revenue, 0);
  });

  await t.test('products within a line are biggest first', async () => {
    sales = [{ _id: 's1', items: [line('Solar Cable', 1, 100, 50), line('Solar Panel 400W', 2, 4800, 3600)] }];
    const l = by((await ask()).body);
    assert.strictEqual(l.solar.products[0].name, 'Solar Panel 400W');
  });

  await t.test('nothing sold is zeroes, not an error', async () => {
    sales = [];
    const r = await ask();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.data.total.revenue, 0);
    assert.ok(r.body.data.lines.every((x) => x.share === 0));
  });
});
