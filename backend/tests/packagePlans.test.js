/**
 * Packages paid for in instalments.
 *
 * Two things matter and nothing else does: the figure taken is right, and
 * the money reaches the day it was taken on. The second is the whole reason
 * the feature exists — instalments used to be a note in a book, so a month
 * that lived on them looked like a month with no sales.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

const sales = [];
const notes = [];
let plan = null;

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/PackagePlan')) return {
    findById: async () => plan,
    find: () => ({ populate() { return this; }, sort() { return this; }, skip() { return this; }, limit: async () => [] }),
    countDocuments: async () => 0,
  };
  if (req.includes('models/Sale')) return {
    // A real id, because the plan stores it and the schema casts it.
    create: async (d) => {
      const s = { _id: new (require('mongoose').Types.ObjectId)(), ...d };
      sales.push(s);
      return s;
    },
  };
  if (req.includes('models/Notification')) return { create: async (d) => { notes.push(d); return d; } };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/packagePlansController.js'));
const PackagePlan = (() => {
  // The real schema, so paid()/outstanding()/the pre-save hook are the real
  // ones rather than something this test agrees with itself about.
  Module._load = orig;
  return require(path.join(B, 'models/PackagePlan.js'));
})();
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
// Real ids: saving runs the schema's own validation, which casts these.
const { Types } = require('mongoose');
const userId = new Types.ObjectId();
const user = { _id: userId, username: 'ama', role: 'Sales' };

/** A 218L freezer: 28,500 all in, 18,000 down, 3,500 a month for three. */
const freezer = (payments = []) => {
  const doc = new PackagePlan({
    customer_name: 'KWESI MENSAH',
    package_name: '218L DC Freezer',
    total_amount: 28500,
    installment_amount: 3500,
    installments_count: 3,
    created_by: userId,
    payments,
  });
  doc._id = new Types.ObjectId();
  /**
   * Saving, without a database.
   *
   * The schema's pre-save hook is what closes a plan once it is paid off,
   * so the stub runs the real registered middleware rather than a second
   * copy of the rule written here — a test that agrees with itself about
   * what the code does proves nothing.
   */
  doc.save = async () => new Promise((resolve, reject) => {
    doc.schema.s.hooks.execPre('save', doc, [], (err) => (err ? reject(err) : resolve()));
  });
  return doc;
};

const pay = async (body) => {
  const r = res();
  await c.recordPayment({ user, params: { id: 'plan1' }, body }, r);
  return r;
};

test('full and half come from the plan, not from the browser', () => {
  const p = freezer();
  assert.strictEqual(c.amountFor(p, 'full', 999999), 3500);
  assert.strictEqual(c.amountFor(p, 'half', 999999), 1750);
  // Only a typed amount is taken from the request, and only when asked for.
  assert.strictEqual(c.amountFor(p, 'part', 400), 400);
});

test('an odd instalment halves without losing a pesewa to rounding', () => {
  const p = freezer();
  p.installment_amount = 2725;
  assert.strictEqual(c.amountFor(p, 'half', 0), 1362.5);
});

test('a payment reaches the day it was taken on', async () => {
  sales.length = 0;
  plan = freezer([{ amount: 18000, portion: 'deposit' }]);
  const r = await pay({ portion: 'full' });

  assert.strictEqual(r.code, 200);
  assert.strictEqual(sales.length, 1, 'a payment writes exactly one Sale');
  const sale = sales[0];
  assert.strictEqual(sale.total_amount, 3500);
  assert.strictEqual(String(sale.package_ref), String(plan._id));
  assert.strictEqual(sale.customer_name, 'KWESI MENSAH');
  assert.deepStrictEqual(sale.items, [], 'nothing left the shelf today');
  assert.strictEqual(sale.payment_status, 'debt_payment');
  assert.ok(sale.sale_date instanceof Date, 'dated, so it lands in a day');
  assert.ok(/^PKG-\d{8}-/.test(sale.invoice_no), `invoice reads ${sale.invoice_no}`);
});

test('half is half, and the balance follows', async () => {
  sales.length = 0;
  plan = freezer([{ amount: 18000, portion: 'deposit' }]);
  await pay({ portion: 'half' });
  assert.strictEqual(sales[0].total_amount, 1750);
  assert.strictEqual(plan.outstanding(), 28500 - 18000 - 1750);
  assert.strictEqual(plan.payments[plan.payments.length - 1].portion, 'half');
});

test('the last payment never takes more than is owed', async () => {
  sales.length = 0;
  // 1,000 left, but a full instalment is 3,500.
  plan = freezer([{ amount: 27500, portion: 'deposit' }]);
  const r = await pay({ portion: 'full' });

  assert.strictEqual(sales[0].total_amount, 1000, 'clipped to the balance');
  assert.strictEqual(plan.outstanding(), 0);
  assert.strictEqual(
    plan.payments[plan.payments.length - 1].portion, 'part',
    'a full instalment that was clipped is not recorded as a full one'
  );
  assert.strictEqual(plan.status, 'completed', 'and the plan closes itself');
  assert.match(r.body.data.message, /clears the package/);
});

test('a paid-off plan takes no more money', async () => {
  sales.length = 0;
  plan = freezer([{ amount: 28500, portion: 'deposit' }]);
  const r = await pay({ portion: 'full' });
  assert.strictEqual(r.code, 400);
  assert.strictEqual(sales.length, 0, 'and writes no Sale');
});

test('a cancelled plan takes no more money', async () => {
  sales.length = 0;
  plan = freezer([{ amount: 1000, portion: 'deposit' }]);
  plan.status = 'cancelled';
  const r = await pay({ portion: 'full' });
  assert.strictEqual(r.code, 400);
  assert.strictEqual(sales.length, 0);
});

test('nonsense typed into the amount is refused, not recorded as zero', async () => {
  sales.length = 0;
  plan = freezer([{ amount: 1000, portion: 'deposit' }]);
  for (const bad of ['', 'abc', 0, -50, null, undefined]) {
    const r = await pay({ portion: 'part', amount: bad });
    assert.strictEqual(r.code, 400, `amount ${JSON.stringify(bad)} should be refused`);
  }
  assert.strictEqual(sales.length, 0);
});

test('the totals the screen shows are the ones the payments add up to', () => {
  const p = freezer([
    { amount: 18000, portion: 'deposit' },
    { amount: 3500, portion: 'full' },
    { amount: 1750, portion: 'half' },
  ]);
  const shown = c.withTotals(p);
  assert.strictEqual(shown.amount_paid, 23250);
  assert.strictEqual(shown.outstanding, 5250);
  assert.strictEqual(shown.installments_paid, 2, 'the deposit is not an instalment');
});

/**
 * Starting a plan.
 *
 * The figures here are the ones every later payment is worked out from, so a
 * plan saved with a missing one is a plan that quietly takes the wrong money
 * for three months.
 */
test('a plan cannot be started without the figures the payments depend on', async () => {
  const attempt = async (body) => {
    const r = res();
    await c.createPackagePlan({ user, body }, r);
    return r;
  };

  const good = {
    customer_name: 'KWESI MENSAH', package_name: '218L DC Freezer',
    total_amount: 28500, installment_amount: 3500,
  };

  assert.strictEqual((await attempt({ ...good, customer_name: '  ' })).code, 400, 'no customer');
  assert.strictEqual((await attempt({ ...good, package_name: '' })).code, 400, 'no package');
  assert.strictEqual((await attempt({ ...good, total_amount: 0 })).code, 400, 'no total');
  assert.strictEqual((await attempt({ ...good, installment_amount: 0 })).code, 400,
    'no instalment, so full and half would both be nothing');
  assert.strictEqual((await attempt({ ...good, deposit: 30000 })).code, 400,
    'a deposit bigger than the package');
});
