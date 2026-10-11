const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

const notes = [];
let product = null;
let updates = [];
let saved = null;

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Purchase')) return {
    create: async (d) => { saved = { _id: 'pu1', ...d, save: async () => {} }; return saved; },
    findById: (id) => {
      const q = { populate: () => q, then: (ok, no) => Promise.resolve(saved).then(ok, no) };
      return q;
    },
  };
  if (req.includes('models/Product')) return {
    findById: async () => product,
    findByIdAndUpdate: async (id, update) => { updates.push(update); return product; },
  };
  if (req.includes('utils/notify')) return {
    notifyOwners: async (n) => { notes.push({ to: 'owners', ...n }); },
    notifyUser: async (u, n) => { notes.push({ to: u, ...n }); },
  };
  if (req === 'express-validator') return { validationResult: () => ({ isEmpty: () => true, array: () => [] }) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/purchasesController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const manager = { _id: 'u1', username: 'ama', role: 'Manager' };
const ceo = { _id: 'u2', username: 'kofi', role: 'CEO' };

const receive = async (user, items) => {
  updates = [];
  const r = res();
  await c.createPurchase({ user, body: { items } }, r);
  return r;
};

test('a manager receives stock; an owner prices it', async (t) => {
  await t.test('a manager needs no cost at all', async () => {
    product = { _id: 'p1', name: 'Deep Cycle Battery', cost_price: 1500, has_variants: false };
    const r = await receive(manager, [{ product_id: 'p1', quantity: 4 }]);
    assert.strictEqual(r.code, 201, 'this used to demand a cost and refuse');
    assert.match(r.body.message, /The office will enter what it cost/);
  });

  await t.test('the stock still goes on the shelf', async () => {
    assert.deepStrictEqual(updates[0].$inc, { quantity: 4 });
  });

  await t.test("but the product's cost price is left alone", async () => {
    assert.strictEqual(updates[0].$set, undefined,
      'a manager must not be able to move the figure profit is worked out from');
  });

  await t.test('the delivery is flagged as unpriced, not quietly costed', async () => {
    assert.strictEqual(saved.awaiting_costing, true);
    assert.strictEqual(saved.items[0].cost_assumed, true);
    assert.strictEqual(saved.items[0].unit_cost, 1500, 'carried for the record only');
  });

  await t.test('an owner is told it is waiting to be priced', async () => {
    assert.ok(notes.some(n => n.to === 'owners' && /needs pricing/i.test(n.title)));
  });

  await t.test('an owner entering costs works exactly as before', async () => {
    product = { _id: 'p1', name: 'Deep Cycle Battery', cost_price: 1500, has_variants: false };
    const r = await receive(ceo, [{ product_id: 'p1', quantity: 4, unit_cost: 1650 }]);
    assert.strictEqual(r.code, 201);
    assert.strictEqual(saved.awaiting_costing, false);
    assert.strictEqual(saved.total_amount, 6600);
    assert.deepStrictEqual(updates[0].$set, { cost_price: 1650 });
  });

  await t.test('an owner leaving the cost blank is still refused', async () => {
    product = { _id: 'p1', name: 'Deep Cycle Battery', cost_price: 1500, has_variants: false };
    const r = await receive(ceo, [{ product_id: 'p1', quantity: 4 }]);
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /cost you/);
  });

  await t.test('pricing a received delivery sets the cost and clears the flag', async () => {
    product = { _id: 'p1', name: 'Deep Cycle Battery', cost_price: 1500, has_variants: false };
    await receive(manager, [{ product_id: 'p1', quantity: 4 }]);
    updates = [];
    const r = res();
    await c.pricePurchase({ user: ceo, params: { id: 'pu1' }, body: { costs: [1700] } }, r);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(saved.awaiting_costing, false);
    assert.strictEqual(saved.total_amount, 6800);
    assert.strictEqual(saved.items[0].cost_assumed, false);
    assert.deepStrictEqual(updates[0].$set, { cost_price: 1700 });
  });

  await t.test('pricing does not add the stock a second time', async () => {
    assert.ok(updates.every(u => u.$inc === undefined),
      'the goods were counted when they arrived');
  });

  await t.test('a half-filled pricing is refused before anything is written', async () => {
    product = { _id: 'p1', name: 'Deep Cycle Battery', cost_price: 1500, has_variants: false };
    await receive(manager, [{ product_id: 'p1', quantity: 2 }, { product_id: 'p1', quantity: 3 }]);
    updates = [];
    const r = res();
    await c.pricePurchase({ user: ceo, params: { id: 'pu1' }, body: { costs: [1700] } }, r);
    assert.strictEqual(r.code, 400);
    assert.strictEqual(saved.awaiting_costing, true, 'still flagged, so it will be found again');
    assert.strictEqual(updates.length, 0);
  });

  await t.test('the person who received it is told once it is priced', async () => {
    product = { _id: 'p1', name: 'Battery', cost_price: 1500, has_variants: false };
    await receive(manager, [{ product_id: 'p1', quantity: 1 }]);
    notes.length = 0;
    const r = res();
    await c.pricePurchase({ user: ceo, params: { id: 'pu1' }, body: { costs: [900] } }, r);
    assert.ok(notes.some(n => /priced/i.test(n.title)));
  });
});
