/**
 * Money paid against a credit agreement reaching the day's takings.
 *
 * The agreement itself was never the problem: a payment was written onto
 * it, the balance came down, the customer got their text. It just never
 * reached the sales book — and the day's takings are the sum of that
 * day's Sale rows. So GH₵500 collected on a plan sat in the drawer with
 * nothing in the shop's figures to explain it, and the dashboard, the
 * month and cash-up were all short by exactly the amount collected.
 *
 * Two payments were missing, not one. The instalments, and the deposit
 * taken on the day the agreement is signed.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const mongoose = require('mongoose');
const B = path.join(__dirname, '..');

const sales = [];
const notes = [];
let agreement = null;
let created = null;

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/CreditAgreement')) {
    const Real = orig.call(this, path.join(B, 'models/CreditAgreement.js'), module, false);
    return Object.assign(function () {}, {
      findById: async () => agreement,
      // create() must give a real document, so the schema's own pre-save
      // hook works out `remaining` exactly as it does in the shop.
      create: async (data) => {
        const doc = new Real(data);
        doc.$isNew = false;
        await new Promise((resolve, reject) => {
          doc.schema.s.hooks.execPre('save', doc, [], (e) => (e ? reject(e) : resolve()));
        });
        created = doc;
        return doc;
      },
      find: () => ({ populate() { return this; }, sort() { return this; }, skip() { return this; }, limit: async () => [] }),
      countDocuments: async () => 0,
      updateOne: async () => ({}),
    });
  }
  if (req.includes('models/Sale')) return {
    create: async (d) => {
      const s = { _id: new mongoose.Types.ObjectId(), ...d };
      sales.push(s);
      return s;
    },
  };
  if (req.includes('models/Notification')) return { create: async (d) => { notes.push(d); return d; } };
  if (req.includes('models/Settings')) return { findOne: async () => null };
  if (req.includes('utils/paymentReceipt')) return {
    sendPaymentReceipt: async () => ({ sent: false, reason: 'no sms in tests' }),
    recordSend: async () => ({}),
  };
  if (req.includes('express-validator')) return { validationResult: () => ({ isEmpty: () => true, array: () => [] }) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/creditAgreementsController.js'));
const CreditAgreement = orig.call(module, path.join(B, 'models/CreditAgreement.js'), module, false);
Module._load = orig;

const res = () => {
  const r = { code: 200 };
  r.status = (s) => { r.code = s; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const user = { _id: new mongoose.Types.ObjectId(), username: 'ama', role: 'Sales' };

/** A live agreement, with its real methods and pre-save arithmetic. */
const makeAgreement = (over = {}) => {
  const doc = new CreditAgreement({
    customer_name: 'Kofi Mensah',
    customer_phone: '0541234567',
    total_amount: 6000,
    down_payment: 2000,
    instalment_count: 4,
    created_by: user._id,
    ...over,
  });
  doc.save = async () => doc;
  return doc;
};

test.beforeEach(() => { sales.length = 0; notes.length = 0; created = null; });

test('an instalment is written into the sales book', async () => {
  agreement = makeAgreement();
  const r = res();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 500 } }, r);

  assert.strictEqual(r.code, 200);
  assert.strictEqual(sales.length, 1, 'the payment must produce exactly one sale row');

  const sale = sales[0];
  assert.strictEqual(sale.total_amount, 500);
  assert.strictEqual(sale.cart_total, 500);
  assert.strictEqual(sale.subtotal, 500);
  assert.strictEqual(sale.debt_amount, 0);
  assert.deepStrictEqual(sale.items, [], 'no goods move — they left when the agreement was signed');
  assert.strictEqual(String(sale.credit_ref), String(agreement._id));
  assert.strictEqual(String(sale.user_id), String(user._id));
  assert.strictEqual(sale.customer_name, 'Kofi Mensah');
});

test('it is a collection, not a counter sale', async () => {
  agreement = makeAgreement();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 500 } }, res());

  // The same status debts and package plans use, so every report that
  // already separates money collected from goods sold keeps working
  // without being taught about credit agreements.
  assert.strictEqual(sales[0].payment_status, 'debt_payment');
  // And it carries no layaway_ref, which is the one marker the takings
  // query excludes. A sale row the day's total skips over would be no
  // better than no sale row at all.
  assert.strictEqual(sales[0].layaway_ref, undefined);
});

test('the money is dated to the day it was handed over', async () => {
  agreement = makeAgreement();
  const before = Date.now();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 500 } }, res());

  const paidAt = agreement.payments[agreement.payments.length - 1].payment_date;
  assert.strictEqual(+sales[0].sale_date, +paidAt,
    'the sale is dated from the payment, not from whenever the row was written');
  assert.ok(+sales[0].sale_date >= before - 2000);
});

test('how the money arrived is carried through to the sale', async () => {
  agreement = makeAgreement();
  await c.recordPayment({
    user, params: { id: 'a1' }, body: { amount: 500, payment_method: 'mobile_money' },
  }, res());
  // Cash-up counts the drawer against the cash takings, so a momo
  // transfer booked as cash leaves the till short on paper.
  assert.strictEqual(sales[0].payment_method, 'mobile_money');
  assert.strictEqual(agreement.payments[0].payment_method, 'mobile_money');

  sales.length = 0;
  agreement = makeAgreement();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 500 } }, res());
  assert.strictEqual(sales[0].payment_method, 'cash', 'and cash is the default');
});

test('the payment can be traced to the row it produced', async () => {
  agreement = makeAgreement();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 500 } }, res());
  assert.strictEqual(
    String(agreement.payments[0].sale_ref), String(sales[0]._id));
});

test('the deposit taken at signing lands in that day\'s takings too', async () => {
  const r = res();
  await c.createCreditAgreement({
    user,
    body: {
      customer_name: 'Esi Owusu', customer_phone: '0201234567',
      total_amount: 6000, down_payment: 2000, instalment_count: 4,
      payment_method: 'cash',
    },
  }, r);

  assert.strictEqual(r.code, 201);
  assert.strictEqual(sales.length, 1, 'the deposit is money taken today');
  assert.strictEqual(sales[0].total_amount, 2000);
  assert.strictEqual(sales[0].payment_status, 'debt_payment');
  assert.strictEqual(String(sales[0].credit_ref), String(created._id));
});

test('an agreement signed with no deposit writes no sale', async () => {
  const r = res();
  await c.createCreditAgreement({
    user,
    body: {
      customer_name: 'Yaw Boateng', customer_phone: '0241234567',
      total_amount: 6000, down_payment: 0, instalment_count: 4,
    },
  }, r);

  assert.strictEqual(r.code, 201);
  assert.strictEqual(sales.length, 0, 'nothing was handed over, so nothing was taken');
});

test('a refused payment writes nothing to the sales book', async () => {
  // Every one of these looks like a recorded payment if a sale row is
  // written anyway: the takings would climb on money nobody paid.
  agreement = makeAgreement();
  for (const body of [{ amount: 0 }, { amount: -50 }, {}, { amount: 'abc' }]) {
    const r = res();
    await c.recordPayment({ user, params: { id: 'a1' }, body }, r);
    assert.strictEqual(r.code, 400, JSON.stringify(body));
  }

  agreement = makeAgreement({ status: 'completed' });
  const done = res();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 500 } }, done);
  assert.strictEqual(done.code, 400, 'a settled agreement takes no more money');

  assert.strictEqual(sales.length, 0);
});

test('the sale row is not what the payment depends on', async () => {
  /**
   * If writing the sale fails, the payment still stands.
   *
   * A missing sale row is an accounting repair somebody can make later. A
   * payment lost because the sales book was unreachable is an argument
   * with a customer about whether they paid, and they are standing at the
   * counter holding a receipt.
   */
  agreement = makeAgreement();
  const Sale = require(path.join(B, 'models/Sale'));
  const realCreate = Sale.create;
  Sale.create = async () => { throw new Error('mongo is down'); };
  try {
    const r = res();
    await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 500 } }, r);
    assert.strictEqual(r.code, 200, 'the payment is still accepted');
    assert.strictEqual(agreement.payments.length, 1);
    assert.strictEqual(agreement.payments[0].amount, 500);
  } finally {
    Sale.create = realCreate;
  }
});

test('paying the balance off closes the agreement and still books the money', async () => {
  agreement = makeAgreement();          // 6000 total, 2000 down → 4000 left
  const r = res();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 4000 } }, r);

  assert.strictEqual(r.code, 200);
  assert.strictEqual(agreement.status, 'completed');
  assert.strictEqual(r.body.data.remaining, 0);
  assert.strictEqual(sales.length, 1);
  assert.strictEqual(sales[0].total_amount, 4000);
});

test('a payment larger than the balance is refused, not banked', async () => {
  /**
   * The amount now reaches the day's takings, so an extra nought is no
   * longer one wrong balance — it is the shop's figures for the day
   * reading high by the difference, and nothing on the dashboard says
   * where it came from.
   */
  agreement = makeAgreement();          // 6000 total, 2000 down → 4000 owed
  const r = res();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 40000 } }, r);

  assert.strictEqual(r.code, 400);
  assert.match(r.body.message, /4000\.00/, 'and it says what is actually owed');
  assert.strictEqual(sales.length, 0);
  assert.strictEqual(agreement.payments.length, 0);
});

test('paying exactly the balance is not mistaken for overpaying', async () => {
  agreement = makeAgreement();
  const r = res();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 4000 } }, r);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(sales.length, 1);
});

test('the balance counts what was paid before, not just the deposit', async () => {
  // Three instalments in, only the remainder may be taken.
  agreement = makeAgreement();
  agreement.payments.push({ amount: 1000 }, { amount: 1000 }, { amount: 1000 });

  const over = res();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 1500 } }, over);
  assert.strictEqual(over.code, 400, 'only 1000 is left');

  const ok = res();
  await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: 1000 } }, ok);
  assert.strictEqual(ok.code, 200);
  assert.strictEqual(agreement.status, 'completed');
  assert.strictEqual(sales.length, 1);
});

test('a NaN never reaches the sales book', async () => {
  // One NaN in a day's sales makes the whole takings figure NaN, because
  // any sum touching it is NaN — a blank dashboard from one bad entry.
  agreement = makeAgreement();
  for (const bad of ['abc', '', ' ', null, undefined, {}, [], NaN, Infinity, '12abc']) {
    const r = res();
    await c.recordPayment({ user, params: { id: 'a1' }, body: { amount: bad } }, r);
    assert.strictEqual(r.code, 400, JSON.stringify(bad));
  }
  assert.strictEqual(sales.length, 0);
  assert.ok(sales.every((s) => Number.isFinite(s.total_amount)));
});
