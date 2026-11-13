/**
 * Putting back the credit payments that never reached the sales book.
 *
 * Recording a payment used to write it onto the agreement and nowhere
 * else, so every payment taken before the fix is missing from the figures
 * for the day it was taken. The balances were always right; the shop's
 * days were short.
 *
 * This writes money into the shop's own takings, which is the most
 * dangerous thing any repair can do. Three promises matter more than the
 * arithmetic:
 *
 *   - it adds each payment once, however many times it is run;
 *   - it dates the money to the day it changed hands, not to today;
 *   - it never invents a figure, so a broken payment is skipped rather
 *     than turned into a sale row that poisons a whole day's total.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const mongoose = require('mongoose');
const B = path.join(__dirname, '..');

let agreements = [];
let sales = [];

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/CreditAgreement')) return {
    find: () => ({ lean: async () => agreements }),
    updateOne: async (filter, update) => {
      const a = agreements.find((x) => String(x._id) === String(filter._id));
      const p = a && (a.payments || []).find(
        (y) => String(y._id) === String(filter['payments._id']));
      if (p) p.sale_ref = update.$set['payments.$.sale_ref'];
      return { matchedCount: p ? 1 : 0 };
    },
  };
  if (req.includes('models/Sale')) return {
    find: () => ({ select: () => ({ lean: async () => sales }) }),
    create: async (d) => {
      // The real collection has a unique index on invoice_no. The repair
      // leans on it as its last line of defence against double-counting,
      // so the stub has to refuse a duplicate the same way.
      if (sales.some((s) => s.invoice_no === d.invoice_no)) {
        const err = new Error('E11000 duplicate key');
        err.code = 11000;
        throw err;
      }
      const s = { _id: new mongoose.Types.ObjectId(), ...d };
      sales.push(s);
      return s;
    },
  };
  return orig.apply(this, arguments);
};
const { findMissing, repairMissing } = require(path.join(B, 'utils/creditSalesRepair.js'));
Module._load = orig;

const user = { _id: new mongoose.Types.ObjectId(), username: 'lawrence' };
const oid = () => new mongoose.Types.ObjectId();
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const thisEvening = () => { const d = new Date(); d.setHours(19, 30, 0, 0); return d; };

test.beforeEach(() => {
  sales = [];
  agreements = [
    {
      _id: oid(),
      customer_name: 'Kofi Mensah',
      down_payment: 2000,
      start_date: daysAgo(30),
      payments: [
        { _id: oid(), amount: 1000, payment_date: daysAgo(14), payment_method: 'cash' },
        { _id: oid(), amount: 500, payment_date: thisEvening(), payment_method: 'mobile_money' },
      ],
    },
    {
      _id: oid(),
      customer_name: 'Esi Owusu',
      down_payment: 0,
      start_date: daysAgo(3),
      payments: [{ _id: oid(), amount: 750, payment_date: thisEvening(), payment_method: 'cash' }],
    },
  ];
});

test('it finds the deposit and every instalment with no sale row', async () => {
  const missing = await findMissing();
  assert.strictEqual(missing.length, 4);
  assert.strictEqual(
    missing.reduce((s, m) => s + m.amount, 0), 4250, '2000 + 1000 + 500 + 750');
  assert.strictEqual(missing.filter((m) => m.kind === 'deposit').length, 1);
  // Esi signed with nothing down, so there is no deposit to put back.
  assert.ok(!missing.some((m) => m.customer_name === 'Esi Owusu' && m.kind === 'deposit'));
});

test('the newest is first, because that is the one being asked about', async () => {
  const missing = await findMissing();
  assert.ok(new Date(missing[0].paid_at) >= new Date(missing[missing.length - 1].paid_at));
});

test('a payment that already has a sale row is left alone', async () => {
  agreements[0].payments[0].sale_ref = oid();
  const missing = await findMissing();
  assert.strictEqual(missing.length, 3);
  assert.ok(!missing.some((m) => m.amount === 1000));
});

test('today on its own, for an evening nobody has closed yet', async () => {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const missing = await findMissing({ since });

  assert.strictEqual(missing.length, 2, 'the 500 and the 750 taken this evening');
  assert.strictEqual(missing.reduce((s, m) => s + m.amount, 0), 1250);
  assert.ok(!missing.some((m) => m.kind === 'deposit'), 'the month-old deposit stays put');
});

test('the money is dated to the day it was paid, not to today', async () => {
  const paidAt = agreements[0].payments[0].payment_date;
  await repairMissing({ all: true, keys: undefined, user });

  const row = sales.find((s) => s.total_amount === 1000);
  assert.strictEqual(+row.sale_date, +paidAt,
    'a payment put back into last fortnight belongs to last fortnight');
});

test('the rows look like collections, not counter sales', async () => {
  await repairMissing({ user });
  for (const s of sales) {
    assert.strictEqual(s.payment_status, 'debt_payment');
    assert.deepStrictEqual(s.items, []);
    assert.strictEqual(s.debt_amount, 0);
    assert.strictEqual(s.layaway_ref, undefined, 'or the takings would skip it');
    assert.ok(s.credit_ref, 'and each says which agreement it came from');
    assert.strictEqual(String(s.user_id), String(user._id));
  }
});

test('how the money arrived is kept', async () => {
  await repairMissing({ user });
  assert.strictEqual(sales.find((s) => s.total_amount === 500).payment_method, 'mobile_money');
  assert.strictEqual(sales.find((s) => s.total_amount === 750).payment_method, 'cash');
  // A deposit has no method recorded against it, so cash is assumed — and
  // the shop can see which rows those are by their -DEP invoice.
  assert.strictEqual(sales.find((s) => s.total_amount === 2000).payment_method, 'cash');
});

test('running it twice adds nothing the second time', async () => {
  const first = await repairMissing({ user });
  assert.strictEqual(first.repaired.length, 4);
  assert.strictEqual(sales.length, 4);

  const second = await repairMissing({ user });
  assert.strictEqual(second.repaired.length, 0, 'nothing left to add');
  assert.strictEqual(sales.length, 4, 'and not one cedi counted twice');
  assert.strictEqual((await findMissing()).length, 0);
});

test('an instalment is marked, so it is skipped even without the invoice check', async () => {
  await repairMissing({ user });
  for (const a of agreements) {
    for (const p of a.payments) {
      assert.ok(p.sale_ref, `${a.customer_name}'s ${p.amount} must carry its sale id`);
    }
  }
});

test('repairing today leaves the older days exactly as they were', async () => {
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const r = await repairMissing({ since, user });

  assert.strictEqual(r.repaired.length, 2);
  assert.strictEqual(sales.reduce((s, x) => s + x.total_amount, 0), 1250);
  // The deposit and the fortnight-old instalment are still outstanding,
  // waiting on a decision about days that have been reported on.
  const left = await findMissing();
  assert.deepStrictEqual(left.map((m) => m.amount).sort((a, b) => a - b), [1000, 2000]);
});

test('named payments only', async () => {
  const all = await findMissing();
  const one = all.find((m) => m.amount === 500);
  const r = await repairMissing({ keys: [one.key], user });

  assert.strictEqual(r.repaired.length, 1);
  assert.strictEqual(sales.length, 1);
  assert.strictEqual(sales[0].total_amount, 500);
});

test('a payment that is not a real figure never becomes a sale row', async () => {
  // One NaN in a day makes that day's whole takings NaN, because any sum
  // touching it is NaN. A repair that introduced one would blank the
  // dashboard it was run to correct.
  agreements = [{
    _id: oid(),
    customer_name: 'Bad Data',
    down_payment: 0,
    start_date: daysAgo(1),
    payments: [
      { _id: oid(), amount: NaN, payment_date: daysAgo(1) },
      { _id: oid(), amount: 0, payment_date: daysAgo(1) },
      { _id: oid(), amount: -50, payment_date: daysAgo(1) },
      { _id: oid(), amount: 300, payment_date: daysAgo(1) },
    ],
  }];

  const missing = await findMissing();
  assert.deepStrictEqual(missing.map((m) => m.amount), [300]);

  await repairMissing({ user });
  assert.strictEqual(sales.length, 1);
  assert.ok(sales.every((s) => Number.isFinite(s.total_amount)));
});

test('a duplicate is reported as already recorded, not as a failure', async () => {
  await repairMissing({ user });
  // Somebody re-running it while a stale list is on their screen: the
  // unique index refuses the row, and that is the repair working.
  const all = [...sales];
  sales = all;
  const again = await repairMissing({ keys: undefined, user });
  assert.strictEqual(again.repaired.length, 0);
  assert.ok(again.failed.every((f) => f.reason === 'already recorded' || f.reason));
});
