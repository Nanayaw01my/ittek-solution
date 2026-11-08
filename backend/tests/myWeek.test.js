/**
 * An attendant's own week, and the complaints they write down.
 *
 * The week has one subtlety worth protecting: money collected against
 * something already sold is not money from selling this week, and folding
 * the two together would make a week of chasing debts read as a week of
 * good trading.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let sales = [];
let complaints = [];
const chain = (rows) => ({
  select() { return this; }, sort() { return this; }, limit: async () => rows,
  then: (f, r) => Promise.resolve(rows).then(f, r),
});

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Sale')) return { find: () => chain(sales) };
  if (req.includes('models/Expense')) return { find: () => chain([]) };
  if (req.includes('models/Complaint')) return { find: () => chain(complaints) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/myWeekController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const ama = { _id: 'u2', username: 'ama', role: 'Sales' };

test('the week runs Monday to Sunday, whatever day it is asked on', () => {
  // A Ghanaian shop week starts on Monday; a report that cuts Saturday's
  // trading in half is a report nobody uses.
  const wed = c.weekStarting(new Date('2026-11-11T15:00:00'));   // a Wednesday
  assert.strictEqual(wed.toISOString().slice(0, 10), '2026-11-09');
  const sun = c.weekStarting(new Date('2026-11-15T09:00:00'));   // the Sunday
  assert.strictEqual(sun.toISOString().slice(0, 10), '2026-11-09', 'Sunday belongs to the week before it');
  const mon = c.weekStarting(new Date('2026-11-16T09:00:00'));
  assert.strictEqual(mon.toISOString().slice(0, 10), '2026-11-16', 'and Monday starts a new one');
});

test('selling and collecting are counted apart', async () => {
  const d = (day, h = 10) => new Date(2026, 10, day, h);
  sales = [
    { sale_date: d(9), total_amount: 500, discount: 20, payment_status: 'paid',
      items: [{ product_name: 'Panel', quantity: 1, total: 500 }] },
    { sale_date: d(11), total_amount: 300, discount: 0, payment_status: 'paid',
      items: [{ product_name: 'Panel', quantity: 2, total: 300 }] },
    // A debt payment: money taken, but not a sale made this week.
    { sale_date: d(11), total_amount: 900, discount: 0, payment_status: 'debt_payment', items: [] },
  ];
  complaints = [];

  const r = res();
  await c.getMyWeek({ user: ama, query: { week: '2026-11-11' } }, r);
  const w = r.body.data;

  assert.strictEqual(w.takings, 800, 'the two counter sales, not the debt payment');
  assert.strictEqual(w.sales, 2);
  assert.strictEqual(w.collections.amount, 900);
  assert.strictEqual(w.collections.count, 1);
  assert.strictEqual(w.pieces, 3);
  assert.strictEqual(w.discounts, 20);
  assert.strictEqual(w.average_sale, 400);
});

test('every day of the week is listed, including the quiet ones', async () => {
  const r = res();
  await c.getMyWeek({ user: ama, query: { week: '2026-11-11' } }, r);
  const w = r.body.data;

  assert.strictEqual(w.days.length, 7);
  assert.deepStrictEqual(w.days.map((d) => d.day),
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  assert.strictEqual(w.days[0].takings, 500, 'Monday');
  assert.strictEqual(w.days[2].takings, 300, 'Wednesday');
  assert.strictEqual(w.days[1].takings, 0, 'and Tuesday is a zero rather than a gap');
  assert.strictEqual(w.busiest_day, 'Monday');
});

test('a week with nothing in it reports a week with nothing in it', async () => {
  sales = [];
  const r = res();
  await c.getMyWeek({ user: ama, query: { week: '2026-11-11' } }, r);
  const w = r.body.data;
  assert.strictEqual(w.takings, 0);
  assert.strictEqual(w.average_sale, 0, 'not a division by zero');
  assert.strictEqual(w.busiest_day, null, 'and no day is called the busiest');
  assert.strictEqual(w.days.length, 7);
});
