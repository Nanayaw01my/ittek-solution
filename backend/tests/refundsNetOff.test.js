/**
 * Refunds come off the takings.
 *
 * Money handed back today left the drawer today, so a "total sales"
 * figure that ignores it reports takings the shop does not have. The
 * day it matters is the day somebody returns a GH₵3,400 battery and
 * every screen still shows the morning's number.
 *
 * Three figures carry this — the shop's day, an attendant's own day,
 * and what each member of staff sold — and they must agree, because
 * they are read side by side.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const B = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(B, f), 'utf8');

test('the shop’s day is net, and says what came back', () => {
  const src = read('controllers/dashboardOverviewController.js');
  const head = src.slice(src.indexOf('today_sales: {'), src.indexOf('today_profit:'));

  assert.ok(head.includes('today.total - refundsToday.total'),
    'today’s takings must have the refunds taken off');
  assert.ok(head.includes('gross: today.total') && head.includes('refunded: refundsToday.total'),
    'and must still carry the gross, so the card can explain a smaller number');

  // The comparison has to be like for like, or a day with refunds shows
  // a collapse against a yesterday that was never netted.
  assert.ok(head.includes('yesterday.total - refundsYesterday.total'),
    'yesterday must be netted too before the two are compared');
});

test('a refund is charged to whoever made the sale, not whoever handed the money over', () => {
  /**
   * The sale is being undone. Leaving it against the seller is the only
   * way their day's figure matches the money, and charging it to the
   * attendant who happened to process the return would punish them for
   * doing the paperwork.
   */
  for (const f of ['controllers/myWeekController.js', 'controllers/staffSalesController.js']) {
    const src = read(f);
    const agg = src.slice(src.indexOf('Refund.aggregate'));
    assert.ok(agg.includes("from: 'sales'") && agg.includes("localField: 'sale_id'"),
      `${f}: the refund must be joined back to its sale`);
    assert.ok(agg.includes('sale.user_id'),
      `${f}: and attributed to that sale's seller`);
    assert.ok(!agg.includes('processed_by'),
      `${f}: never to whoever processed the refund`);
  }
});

test('only an approved refund takes money off anybody', () => {
  // One waiting on a decision has returned nothing to anybody, and
  // counting it would have the shop reading money as gone while it is
  // still in the drawer.
  for (const f of ['controllers/myWeekController.js',
    'controllers/staffSalesController.js',
    'controllers/dashboardOverviewController.js']) {
    assert.ok(read(f).includes("status: 'approved'"), `${f} must count approved refunds only`);
  }
});

test('an attendant’s own day is net, and the week’s bars with it', () => {
  const src = read('controllers/myWeekController.js');
  assert.ok(src.includes('const takings = money(grossToday - refundedToday)'),
    'today’s takings must be net');
  assert.ok(src.includes('money(sum(rows) - (refundByDay.get(dayKeyOf(from)) || 0))'),
    'and each bar of the week, or the chart disagrees with the figure above it');
  assert.ok(src.includes('gross: grossToday') && src.includes('refunded: refundedToday'),
    'the screen needs both to explain itself');
});

test('who sold what is net, per person and in the total', () => {
  const src = read('controllers/staffSalesController.js');
  assert.ok(src.includes('net: Number((r.gross - refunded).toFixed(2))'),
    'each person’s figure must have their refunds taken off');
  assert.ok(src.includes('net: Number(rows.reduce((n, r) => n + r.net, 0).toFixed(2))'),
    'and the total must be the sum of the net figures, not of the gross ones');
});

test('the screens show the gross beside the net, never silently', () => {
  /**
   * A figure that quietly shrank by GH₵3,400 reads as a fault in the
   * till. Every screen that nets off says so when there was anything
   * to net.
   */
  const F = path.join(B, '..', 'frontend/src');
  const owner = fs.readFileSync(path.join(F, 'pages/OwnerDashboard.jsx'), 'utf8');
  assert.ok(owner.includes('h.today_sales.refunded > 0'), 'the owner dashboard explains it');

  const att = fs.readFileSync(path.join(F, 'pages/AttendantDashboard.jsx'), 'utf8');
  assert.ok(att.includes('t.refunded > 0'), 'the attendant dashboard explains it');

  const staff = fs.readFileSync(path.join(F, 'pages/StaffSales.jsx'), 'utf8');
  assert.ok(staff.includes('totals.refunded > 0'), 'who sold what explains it');
});
