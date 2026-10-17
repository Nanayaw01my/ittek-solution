const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let doc = null;
let shelf = {};
let deducted = [];
const notes = [];

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Layaway')) return { findById: async () => doc };
  if (req.includes('models/Product')) return {
    findById: (id) => ({ select: () => ({ lean: async () => shelf[id] || null }) }),
  };
  if (req.includes('models/Notification')) return { create: async (n) => { notes.push(n); return n; } };
  if (req.includes('utils/saleHelpers')) return {
    buildSaleItems: async () => [],
    deductStock: async (items) => { deducted.push(...items); },
    restoreStock: async () => {},
  };
  if (req.includes('utils/generateInvoice')) return { createSaleWithInvoice: async () => ({}) };
  if (req.includes('utils/pdfGenerator')) return { generateLayawayAgreement: async () => Buffer.from('p') };
  if (req.includes('models/Settings')) return { findOne: () => ({ lean: async () => ({}) }) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/layawayController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const user = { _id: 'u1', username: 'ama' };

const makePlan = (status, balance) => ({
  _id: 'l1', reference: 'LAY-676722', customer_name: 'Issaka Abass',
  status, balance, amount_paid: 38800 - balance, total_amount: 38800,
  items: [{ product_id: 'p1', product_name: '570W Panel', quantity: 4 }],
  payments: [],
  recalculate() {
    this.amount_paid = this.payments.reduce((s, p) => s + p.amount, 0) + (38800 - balance);
    this.balance = Math.max(0, 38800 - this.amount_paid);
    if (this.balance <= 0) this.status = 'completed';
  },
  save: async () => {},
});

const pay = async (amount) => {
  const r = res();
  deducted = [];
  await c.addPayment({ user, params: { id: 'l1' }, body: { amount, method: 'cash' } }, r);
  return r;
};

test('taking a payment on a layaway', async (t) => {
  await t.test('an active plan takes the money as before', async () => {
    doc = makePlan('active', 8800);
    shelf = { p1: { name: '570W Panel', quantity: 10 } };
    const r = await pay(1000);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(doc.balance, 7800);
    assert.strictEqual(r.body.reinstated, false, 'an active plan was never cancelled');
    assert.strictEqual(deducted.length, 0, 'its stock is already reserved');
  });

  await t.test('a plan that fell behind takes the money too', async () => {
    doc = makePlan('defaulted', 8800);
    const r = await pay(500);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(doc.balance, 8300);
  });

  await t.test('a cancelled plan now takes the money and comes back to life', async () => {
    // Refusing was tidy and useless: the customer is there with the money.
    doc = makePlan('cancelled', 8800);
    shelf = { p1: { name: '570W Panel', quantity: 10 } };
    const r = await pay(2000);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.reinstated, true);
    assert.strictEqual(doc.status, 'active');
    assert.strictEqual(doc.balance, 6800);
  });

  await t.test('and the goods are taken off the shelf again', async () => {
    assert.strictEqual(deducted.length, 1, 'cancelling had put them back');
    assert.strictEqual(deducted[0].quantity, 4);
  });

  await t.test('the reason it was cancelled is cleared, not left to confuse', async () => {
    assert.strictEqual(doc.cancelled_reason, undefined);
  });

  await t.test('sold out since? the money is still taken, and the shop is told', async () => {
    doc = makePlan('cancelled', 8800);
    shelf = { p1: { name: '570W Panel', quantity: 1 } };   // 4 were wanted
    const r = await pay(3000);
    assert.strictEqual(r.code, 200, 'turning the customer away is not the answer to a stock problem');
    assert.strictEqual(doc.status, 'active');
    assert.deepStrictEqual(r.body.short_of_stock, ['570W Panel']);
    assert.match(r.body.message, /not on the shelf — get them in before collection/);
  });

  await t.test('nothing is half-reserved when the shelf is short', async () => {
    assert.strictEqual(deducted.length, 0, 'all of it or none of it');
  });

  await t.test('paying it off in full still marks it ready for collection', async () => {
    doc = makePlan('active', 8800);
    shelf = { p1: { name: '570W Panel', quantity: 10 } };
    const r = await pay(8800);
    assert.strictEqual(doc.status, 'completed');
    assert.match(r.body.message, /Paid in full/);
  });

  await t.test('more than is owed is still refused', async () => {
    doc = makePlan('active', 8800);
    const r = await pay(9000);
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /exceeds the outstanding balance/);
  });

  await t.test('nothing, or a negative, is still refused', async () => {
    doc = makePlan('active', 8800);
    assert.strictEqual((await pay(0)).code, 400);
    assert.strictEqual((await pay(-50)).code, 400);
  });
});
