const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

const notes = [];
const products = [];
let doc = null;
const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/StockRequest')) return {
    create: async (d) => ({ _id: 'r1', status: 'pending', ...d, save: async () => {} }),
    find: () => ({ select: () => ({ lean: async () => [] }) }),
    findById: async () => doc,
  };
  if (req.includes('models/Product')) return {
    create: async (d) => { const p = { _id: 'p' + (products.length + 1), ...d }; products.push(p); return p; },
    findOne: () => ({ select: async () => null }),
  };
  if (req.includes('models/Notification')) return { create: async (d) => { notes.push(d); return d; } };
  if (req === 'express-validator') return { validationResult: () => ({ isEmpty: () => true, array: () => [] }) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/stockRequestsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const ceo = { _id: 'u2', username: 'kofi', role: 'CEO' };
const mk = (items) => ({ _id: 'r1', status: 'pending', created_by: 'u1', total_amount: 0, items, save: async () => {} });
const approve = async (body) => { const r = res(); await c.approveStockRequest({ user: ceo, params: { id: 'r1' }, body }, r); return r; };

test('the owner approves the quantity, not just the request', async (t) => {
  await t.test('approving ten as six records both numbers', async () => {
    doc = mk([{ product_name: 'Battery', quantity_requested: 10, estimated_cost: 1500, total: 15000 }]);
    const r = await approve({ quantities: [6] });
    assert.strictEqual(r.code, 200);
    const line = doc.items[0];
    assert.strictEqual(line.quantity_requested, 10, 'what the shop floor asked for is kept');
    assert.strictEqual(line.quantity_approved, 6);
    assert.strictEqual(line.total, 9000, 'the money follows what was approved');
    assert.strictEqual(doc.total_amount, 9000);
  });

  await t.test('the change is named to the person who asked', async () => {
    assert.match(notes.at(-1).message, /Battery: 10 → 6/);
  });

  await t.test('approving without touching the numbers behaves as before', async () => {
    doc = mk([{ product_name: 'Panel', quantity_requested: 4, estimated_cost: 900, total: 3600 }]);
    const r = await approve({});
    assert.strictEqual(r.code, 200);
    assert.strictEqual(doc.items[0].quantity_approved, 4);
    assert.strictEqual(doc.total_amount, 3600);
    assert.doesNotMatch(r.body.message, /Changed/);
  });

  await t.test('a single line can be dropped to nothing', async () => {
    doc = mk([
      { product_name: 'Panel', quantity_requested: 4, estimated_cost: 900, total: 3600 },
      { product_name: 'Cable', quantity_requested: 20, estimated_cost: 15, total: 300 },
    ]);
    await approve({ quantities: [4, 0] });
    assert.strictEqual(doc.items[1].quantity_approved, 0);
    assert.strictEqual(doc.total_amount, 3600, 'the dropped line costs nothing');
  });

  await t.test('approving nothing at all is refused, so a no is recorded as a no', async () => {
    doc = mk([{ product_name: 'Panel', quantity_requested: 4, estimated_cost: 900, total: 3600 }]);
    const r = await approve({ quantities: [0] });
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /Reject the request instead/);
    assert.strictEqual(doc.status, 'pending', 'nothing was written');
  });

  await t.test('a new item approved at nothing does not become a product', async () => {
    products.length = 0;
    doc = mk([
      { product_name: 'Keeper', quantity_requested: 2, estimated_cost: 100, total: 200,
        is_new_product: true, selling_price: 150 },
      { product_name: 'Rejected item', quantity_requested: 5, estimated_cost: 50, total: 250,
        is_new_product: true, selling_price: 80 },
    ]);
    await approve({ quantities: [2, 0] });
    assert.strictEqual(products.length, 1);
    assert.strictEqual(products[0].name, 'Keeper');
  });

  await t.test('nonsense quantities are ignored rather than wrecking the line', async () => {
    doc = mk([{ product_name: 'Panel', quantity_requested: 4, estimated_cost: 900, total: 3600 }]);
    await approve({ quantities: ['abc'] });
    assert.strictEqual(doc.items[0].quantity_approved, 4);
  });

  await t.test('a fraction is taken as whole units', async () => {
    doc = mk([{ product_name: 'Panel', quantity_requested: 10, estimated_cost: 100, total: 1000 }]);
    await approve({ quantities: [3.7] });
    assert.strictEqual(doc.items[0].quantity_approved, 3);
  });

  await t.test('more than was asked for is allowed — the owner may know better', async () => {
    doc = mk([{ product_name: 'Panel', quantity_requested: 4, estimated_cost: 900, total: 3600 }]);
    await approve({ quantities: [12] });
    assert.strictEqual(doc.items[0].quantity_approved, 12);
    assert.strictEqual(doc.total_amount, 10800);
  });
});
