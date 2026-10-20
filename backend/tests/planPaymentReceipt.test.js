const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/**
 * Layaway and credit-agreement instalments, and the texts that follow them.
 *
 * These customers pay a little every week for months and have even less to
 * show for it than a debtor — so the receipt matters more here, not less.
 *
 * Which makes the balance in it worth checking. The credit-agreement
 * endpoint used to work the remaining amount out as
 *     financed - (paidBefore + amount) + paidBefore
 * which cancels to `financed - amount`: every earlier payment ignored. A
 * customer three instalments in was told a figure thousands of cedis too
 * high, and the agreement could only ever complete if one payment cleared
 * the whole thing.
 */

let receipt = { sent: true };
let sentWith = [];
let agreementDoc = null;
let layawayDoc = null;
let updates = [];

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/CreditAgreement')) {
    const M = function () {};
    M.findById = async () => agreementDoc;
    M.updateOne = async (f, u) => { updates.push({ f, u }); return {}; };
    return M;
  }
  if (req.includes('models/Layaway')) {
    const M = function () {};
    M.findById = () => ({ populate: () => ({ populate: async () => layawayDoc }), then: undefined });
    M.updateOne = async (f, u) => { updates.push({ f, u }); return {}; };
    return M;
  }
  if (req.includes('models/Notification')) return { create: async () => ({}) };
  if (req.includes('utils/paymentReceipt')) return {
    sendPaymentReceipt: async (o) => { sentWith.push(o); return receipt; },
    recordSend: async (Model, filter, texted) => {
      updates.push({ f: filter, u: { $set: { 'payments.$.sms_sent': !!texted.sent } } });
    },
  };
  return orig.apply(this, arguments);
};
const ca = require(path.join(B, 'controllers/creditAgreementsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = s => { r.code = s; return r; }; r.json = b => { r.body = b; return r; }; return r; };

/** A plan with GHC10,000 financed, GHC2,000 already paid in instalments. */
const mkAgreement = () => {
  const d = {
    _id: 'a1', status: 'active',
    customer_name: 'Kwesi Mensah', customer_phone: '0240000001',
    total_amount: 12000, down_payment: 2000, remaining: 10000,
    payments: [{ _id: 'p1', amount: 2000 }],
    save: async function () { this.saved = true; },
  };
  d.paidToDate = function () {
    return (this.down_payment || 0) + this.payments.reduce((s, p) => s + p.amount, 0);
  };
  d.outstanding = function () { return Math.max(0, this.total_amount - this.paidToDate()); };
  return d;
};

const pay = async (amount) => {
  const r = res();
  await ca.recordPayment(
    { params: { id: 'a1' }, body: { amount }, user: { _id: 'u1', username: 'ama' } },
    r
  );
  return r;
};

test('a credit agreement payment', async (t) => {
  t.beforeEach(() => { agreementDoc = mkAgreement(); sentWith = []; updates = []; receipt = { sent: true }; });

  await t.test('the balance counts everything paid before today', async () => {
    // 12,000 total, 2,000 down, 2,000 already paid, 1,000 now → 7,000 left.
    // The old arithmetic reported 9,000.
    const r = await pay(1000);
    assert.strictEqual(r.body.data.remaining, 7000);
  });

  await t.test('the customer is texted that figure, not a different one', async () => {
    // The reason the sum above had to be fixed before any of this was wired.
    await pay(1000);
    assert.strictEqual(sentWith[0].remaining, 7000);
    assert.strictEqual(sentWith[0].amount, 1000);
    assert.strictEqual(sentWith[0].phone, '0240000001');
  });

  await t.test('a plan paid off in instalments does complete', async () => {
    // It could not before: completion needed one payment to clear the whole
    // financed amount, so a weekly plan stayed open for ever.
    const r = await pay(8000);
    assert.strictEqual(r.body.data.remaining, 0);
    assert.strictEqual(agreementDoc.status, 'completed');
  });

  await t.test('the last payment is told it is the last', async () => {
    await pay(8000);
    assert.match(sentWith[0].settledNote, /fully paid/i);
  });

  await t.test('a failed text leaves the payment standing', async () => {
    receipt = { sent: false, reason: 'no Arkesel key or sender ID' };
    const r = await pay(1000);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(agreementDoc.saved, true);
    assert.strictEqual(agreementDoc.payments.length, 2);
    assert.strictEqual(r.body.data.texted, false);
    assert.match(r.body.data.text_note, /Arkesel/);
  });

  await t.test('whether it went is written against the payment', async () => {
    await pay(1000);
    const set = updates.find(u => u.u.$set && 'payments.$.sms_sent' in u.u.$set);
    assert.ok(set);
    assert.strictEqual(set.u.$set['payments.$.sms_sent'], true);
  });

  await t.test('no invented reference goes out', async () => {
    // An agreement carries no number the customer has ever been shown.
    await pay(1000);
    assert.ok(!sentWith[0].receiptNo);
  });
});

test('what a finished layaway customer is told', async (t) => {
  const { composeReceiptSms } = require(path.join(B, 'utils/paymentReceipt.js'));

  await t.test('goods waiting on a shelf are mentioned', async () => {
    // "Your balance is cleared" leaves a layaway customer with no idea that
    // there is something to come and collect.
    const m = composeReceiptSms({
      name: 'Ama', amount: 200, remaining: 0,
      settledNote: 'Fully paid - your goods are ready for collection. Thank you.',
    });
    assert.match(m, /ready for collection/);
  });

  await t.test('and it still fits one credit', async () => {
    const m = composeReceiptSms({
      company: 'DAN & DOR SOLAR COMPANY LIMITED',
      name: 'EMMANUEL KWABENA OSEI-BONSU', amount: 1250.75, remaining: 0,
      receiptNo: 'LAY-676722',
      settledNote: 'Fully paid - your goods are ready for collection. Thank you.',
    });
    assert.ok(m.length <= 160, `${m.length}: ${m}`);
  });
});
