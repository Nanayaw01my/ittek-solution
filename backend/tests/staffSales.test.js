const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/**
 * Who sold what, to whom, at what discount.
 *
 * The figure the screen exists for is the discount, and it is the one most
 * easily got wrong: a percentage discount is stored as the percentage, not
 * as money. Read straight, "10" off a GHC4,000 sale reads as ten cedis, and
 * the screen understates what is being given away by a factor of four
 * hundred — while looking entirely plausible.
 */

let sales = [];
let products = [];
let users = [];
let refunds = [];
let debt = null;
let layaways = [];

const chain = (rows) => {
  const c = {
    select: () => c, populate: () => c, sort: () => c, limit: () => c,
    lean: async () => rows, then: undefined,
  };
  return c;
};

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Sale')) return {
    find: (f) => chain(typeof f?.customer_phone === 'string'
      ? sales.filter((s) => s.customer_phone === f.customer_phone
        && String(s._id) !== String(f._id?.$ne))
      : sales),
    findById: () => chain(sales[0]),
  };
  if (req.includes('models/Refund')) return { find: () => chain(refunds) };
  if (req.includes('models/Debt')) return { findOne: () => chain(debt) };
  if (req.includes('models/Layaway')) return { find: () => chain(layaways) };
  if (req.includes('models/Product')) return { find: () => chain(products) };
  if (req.includes('models/User')) return { find: () => chain(users) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/staffSalesController.js'));
Module._load = orig;

const res = () => {
  const r = { code: 200 };
  r.status = (s) => { r.code = s; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const call = async (fn, req = {}) => {
  const r = res();
  await fn({ query: {}, params: {}, ...req }, r);
  return r;
};

test('what a discount actually came to', async (t) => {
  await t.test('a percentage is money, not a number of cedis', () => {
    // The whole trap. 10% off 4,000 is 400, and anything that reports 10
    // here makes a generous discounter look careful.
    const d = c.discountOf({ subtotal: 4000, discount: 10, discount_type: 'percentage' });
    assert.strictEqual(d, 400);
  });

  await t.test('a flat amount is taken as it stands', () => {
    assert.strictEqual(c.discountOf({ subtotal: 4000, discount: 250, discount_type: 'fixed' }), 250);
  });

  await t.test('loyalty comes off too', () => {
    // It is money off the price the customer paid, so leaving it out would
    // under-report what the shop gave away.
    assert.strictEqual(
      c.discountOf({ subtotal: 1000, discount: 100, discount_type: 'fixed', loyalty_discount: 50 }),
      150
    );
  });

  await t.test('nothing at all is nothing, not NaN', () => {
    assert.strictEqual(c.discountOf({}), 0);
    assert.strictEqual(c.discountOf({ subtotal: 500 }), 0);
  });

  await t.test('a negative discount cannot be used to inflate takings', () => {
    assert.strictEqual(c.discountOf({ subtotal: 500, discount: -100, discount_type: 'fixed' }), 0);
  });
});

test('each person, and what they gave away', async (t) => {
  t.beforeEach(() => {
    users = [
      { _id: 'u1', username: 'ama', role: 'Sales' },
      { _id: 'u2', username: 'kofi', role: 'Engineer' },
    ];
    sales = [
      { user_id: 'u1', subtotal: 1000, discount: 10, discount_type: 'percentage', total_amount: 900, customer_phone: '233240000001', payment_status: 'paid' },
      { user_id: 'u1', subtotal: 2000, discount: 0, total_amount: 2000, customer_phone: '233240000001', payment_status: 'paid' },
      { user_id: 'u2', subtotal: 500, discount: 0, total_amount: 500, customer_phone: '', payment_status: 'partial' },
    ];
  });

  await t.test('takings and discount are both reported per person', async () => {
    const r = await call(c.getSummary);
    const ama = r.body.data.staff.find((s) => s.username === 'ama');
    assert.strictEqual(ama.sales_count, 2);
    assert.strictEqual(ama.gross, 2900);
    assert.strictEqual(ama.discount_total, 100);
  });

  await t.test('the discount is shown as a share of what was on the table', async () => {
    // 100 given away on 3,000 of trade. The cash figure alone says nothing
    // without the size of the trade behind it.
    const r = await call(c.getSummary);
    const ama = r.body.data.staff.find((s) => s.username === 'ama');
    assert.strictEqual(ama.discount_pct, 3.3);
  });

  await t.test('the same customer twice is one customer', async () => {
    // "How few names does this person sell to" is the question; counting
    // visits instead of names answers a different one.
    const r = await call(c.getSummary);
    assert.strictEqual(r.body.data.staff.find((s) => s.username === 'ama').customers, 1);
  });

  await t.test('a walk-in with no phone is nobody in particular', async () => {
    const r = await call(c.getSummary);
    assert.strictEqual(r.body.data.staff.find((s) => s.username === 'kofi').customers, 0);
  });

  await t.test('sales left unpaid are counted', async () => {
    const r = await call(c.getSummary);
    assert.strictEqual(r.body.data.staff.find((s) => s.username === 'kofi').on_credit, 1);
  });

  await t.test('most given away comes first', async () => {
    const r = await call(c.getSummary);
    assert.strictEqual(r.body.data.staff[0].username, 'ama');
  });

  await t.test('a sale by somebody since deleted still counts', async () => {
    // Otherwise the month's takings quietly disagree with every other screen.
    sales.push({ user_id: 'gone', subtotal: 100, total_amount: 100, payment_status: 'paid' });
    const r = await call(c.getSummary);
    assert.ok(r.body.data.staff.some((s) => s.username === 'Unknown'));
    assert.strictEqual(r.body.data.totals.sales_count, 4);
  });
});

test('the sales behind the figures', async (t) => {
  t.beforeEach(() => {
    users = [{ _id: 'u1', username: 'ama', role: 'Sales' }];
    sales = [
      { _id: 's1', invoice_no: 'INV-1', user_id: 'u1', subtotal: 1000, discount: 10, discount_type: 'percentage', total_amount: 900, items: [{ quantity: 2 }, { quantity: 1 }] },
      { _id: 's2', invoice_no: 'INV-2', user_id: 'u1', subtotal: 500, discount: 0, total_amount: 500, items: [{ quantity: 1 }] },
    ];
  });

  await t.test('each line carries what came off it', async () => {
    const r = await call(c.getSales);
    assert.strictEqual(r.body.data.sales[0].discount_cash, 100);
  });

  await t.test('"discounted only" means what it says', async () => {
    const r = await call(c.getSales, { query: { discounted: 'true' } });
    assert.strictEqual(r.body.data.sales.length, 1);
    assert.strictEqual(r.body.data.sales[0].invoice_no, 'INV-1');
  });

  await t.test('the items are counted, not shipped to the browser', async () => {
    // The list is a list. Sending every line of every sale to draw a count
    // is how a month of trade becomes a slow screen.
    const r = await call(c.getSales);
    assert.strictEqual(r.body.data.sales[0].item_count, 3);
    assert.strictEqual(r.body.data.sales[0].items, undefined);
  });

  await t.test('the total taken off is stated for the whole list', async () => {
    const r = await call(c.getSales);
    assert.strictEqual(r.body.data.discount_total, 100);
  });

  await t.test('a customer name with regex characters is a search, not a pattern', async () => {
    // "A+B Electricals" must not be compiled as a quantifier and throw.
    await assert.doesNotReject(() => call(c.getSales, { query: { customer: 'A+B (Ltd)' } }));
  });
});

test('one sale, and what happened to it after', async (t) => {
  t.beforeEach(() => {
    refunds = []; debt = null; layaways = [];
    products = [{ _id: 'p1', selling_price: 1200 }];
    sales = [{
      _id: '507f1f77bcf86cd799439011',
      invoice_no: 'INV-9',
      customer_phone: '233240000001',
      subtotal: 2000, discount: 5, discount_type: 'percentage', total_amount: 1900,
      items: [{ product_id: 'p1', product_name: 'Battery', quantity: 2, unit_price: 1000 }],
    }];
  });

  await t.test('a price typed under the list price is surfaced', async () => {
    // The discount box is honest and shows up everywhere. A lower unit price
    // shows up nowhere, which is exactly why it is called out.
    const r = await call(c.getTrail, { params: { id: '507f1f77bcf86cd799439011' } });
    assert.strictEqual(r.body.data.sale.items[0].below_list, 400);
    assert.strictEqual(r.body.data.sale.below_list_total, 400);
  });

  await t.test('selling at the list price raises nothing', async () => {
    products = [{ _id: 'p1', selling_price: 1000 }];
    const r = await call(c.getTrail, { params: { id: '507f1f77bcf86cd799439011' } });
    assert.strictEqual(r.body.data.sale.below_list_total, 0);
  });

  await t.test('selling above the list price is not a negative discount', async () => {
    products = [{ _id: 'p1', selling_price: 800 }];
    const r = await call(c.getTrail, { params: { id: '507f1f77bcf86cd799439011' } });
    assert.strictEqual(r.body.data.sale.below_list_total, 0);
  });

  await t.test('refunds and debts come back with it', async () => {
    refunds = [{ _id: 'r1', refund_amount: 500, product_name: 'Battery', status: 'approved', reason: 'faulty' }];
    debt = { _id: 'd1', amount_owed: 900, amount_paid: 200, status: 'partial' };
    const r = await call(c.getTrail, { params: { id: '507f1f77bcf86cd799439011' } });
    assert.strictEqual(r.body.data.refunds.length, 1);
    assert.strictEqual(r.body.data.debt.amount_owed, 900);
  });

  await t.test('a bad id is refused rather than searched for', async () => {
    const r = await call(c.getTrail, { params: { id: 'not-an-id' } });
    assert.strictEqual(r.code, 400);
  });
});
