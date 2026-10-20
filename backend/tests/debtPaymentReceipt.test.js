const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/** The payment itself: the money must land whatever the phone network does. */
let debtDoc = null;
let updates = [];
let receipt = { sent: true, to: '233240000001', credits: 1 };

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Debt')) return {
    findById: async () => debtDoc,
    updateOne: async (f, u) => { updates.push({ f, u }); return { modifiedCount: 1 }; },
  };
  if (req.includes('models/Sale')) return { create: async () => ({}) };
  if (req.includes('models/Notification')) return { create: async () => ({}) };
  if (req.includes('models/Settings')) return { findOne: async () => null };
  if (req.endsWith('../utils/paymentReceipt') || req.includes('utils/paymentReceipt')) return {
    sendPaymentReceipt: async () => receipt,
    // The real one writes the result against the payment and swallows every
    // fault, because it runs after money has already been taken.
    recordSend: async (Model, filter, texted) => {
      updates.push({ f: filter, u: { $set: { 'payments.$.sms_sent': !!texted.sent } } });
    },
  };
  if (req.includes('utils/email')) return { queueEmail: async () => {}, templates: { debtPayment: () => '' } };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/debtsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = s => { r.code = s; return r; }; r.json = b => { r.body = b; return r; }; return r; };
const pay = async (amount) => {
  const r = res();
  await c.recordPayment({ params: { id: 'd1' }, body: { amount }, user: { _id: 'u1', username: 'ama' } }, r);
  return r;
};
const mkDebt = () => ({
  _id: 'd1', status: 'partial', customer_name: 'Kwesi Mensah', customer_phone: '0240000001',
  amount_owed: 2000, amount_paid: 0, payments: [], save: async function () { this.saved = true; },
});

test('a debt payment tells the customer', async (t) => {
  t.beforeEach(() => { debtDoc = mkDebt(); updates = []; receipt = { sent: true }; });

  await t.test('the payment is recorded and the customer texted', async () => {
    const r = await pay(500);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.data.remaining, 1500);
    assert.strictEqual(r.body.data.texted, true);
  });

  await t.test('the send is written against the payment', async () => {
    await pay(500);
    const set = updates.find(u => u.u.$set && 'payments.$.sms_sent' in u.u.$set);
    assert.ok(set, 'nothing was recorded about the text');
    assert.strictEqual(set.u.$set['payments.$.sms_sent'], true);
  });

  await t.test('a failed text still leaves the money recorded', async () => {
    // The whole point. A phone network having a bad morning must not cost
    // the shop a payment.
    receipt = { sent: false, reason: 'Arkesel refused the API key.' };
    const r = await pay(500);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(debtDoc.amount_paid, 500);
    assert.strictEqual(debtDoc.saved, true);
    assert.strictEqual(r.body.data.texted, false);
    assert.match(r.body.data.text_note, /refused the API key/);
  });

  await t.test('the counter is told why, so it knows to print a slip', async () => {
    receipt = { sent: false, reason: 'this customer asked not to be messaged' };
    const r = await pay(2000);
    assert.match(r.body.data.text_note, /asked not to be messaged/);
  });

  await t.test('overpaying is capped, and the text says the real figures', async () => {
    const r = await pay(5000);
    assert.strictEqual(r.body.data.payment_amount, 2000);
    assert.strictEqual(r.body.data.remaining, 0);
  });
});
