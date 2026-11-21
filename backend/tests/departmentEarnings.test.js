/**
 * What a department actually brought in.
 *
 * The figure a target is measured against, so the things that can go
 * wrong with it are the things that make a head of department look like
 * they met a goal they did not, or missed one they met.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const B = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(B, 'utils/departmentEarnings.js'), 'utf8');

test('field dispatch is not counted twice', () => {
  /**
   * Taking a rep's money with the Pay button writes a real sale with
   * the products on it. Reading the dispatch sheets for revenue as
   * well would count the same panel twice and flatter every department
   * that sells on the road — which is exactly what "read the sales
   * from field dispatch" sounds like it should mean, and is why this
   * is written down here rather than left to be rediscovered.
   */
  const earnings = src.slice(src.indexOf('const earningsFor'), src.indexOf('const stillOutFor'));
  assert.ok(!earnings.includes('Dispatch.find'),
    'the month’s revenue must come from sales alone');
  assert.ok(src.includes('quantity_sold'),
    'the dispatch sheets are still read — for what is still out, not for revenue');
});

test('what is still out is reported beside the figure, never inside it', () => {
  const out = src.slice(src.indexOf('const stillOutFor'), src.indexOf('const installationsFor'));
  // Issued, less what came back, less what was paid for: the rest is
  // stock in somebody's boot.
  assert.ok(out.includes('quantity_issued') && out.includes('quantity_returned')
    && out.includes('quantity_sold'),
    'still-out is what went out less what came back and less what was sold');

  const controller = fs.readFileSync(path.join(B, 'controllers/targetsController.js'), 'utf8');
  const row = controller.slice(controller.indexOf('const percent ='), controller.indexOf('still_out'));
  assert.ok(!row.includes('stillOut.get'),
    'the percentage must not include stock nobody has paid for');
});

test('refunds come off a department’s figure', () => {
  // As everywhere else in the system now. A department does not keep
  // credit for a battery that came back.
  assert.ok(src.includes("status: 'approved'"), 'approved refunds only');
  assert.ok(src.includes('row.net = money(row.revenue - row.refunded)'),
    'and they are taken off');
});

test('a refund against a mixed sale is charged to its biggest side', () => {
  /**
   * A sale of panels and a router belongs to both. There is no record
   * of which half came back, so the largest line decides — stated
   * plainly rather than silently charged to whichever was read first.
   */
  assert.ok(src.includes('if (!held || value > held.value)'),
    'the biggest line on the sale decides where its refund lands');
});

test('debt payments are not counted as a second sale', () => {
  assert.ok(src.includes("payment_status: { $ne: 'debt_payment' }"),
    'money against goods already counted must not put the same panel in Solar twice');
});

test('installations are a count, because they carry no money', () => {
  /**
   * An installation record has a customer, a date and the work, and no
   * amount anywhere. The money for the job is on the sale that goes
   * with it and is already counted there.
   */
  const inst = src.slice(src.indexOf('const installationsFor'));
  assert.ok(inst.includes('countDocuments'), 'counted, not summed');
  assert.ok(!/\$sum/.test(inst), 'there is no amount on an installation to sum');
});

test('the percentage is worked out, never stored', () => {
  const model = fs.readFileSync(path.join(B, 'models/Target.js'), 'utf8');
  assert.ok(model.includes('target_amount'), 'the goal in cedis is stored');
  assert.ok(!model.includes('earned_amount') && !model.includes('percent:'),
    'progress must not be a stored figure somebody has to keep updating');

  const controller = fs.readFileSync(path.join(B, 'controllers/targetsController.js'), 'utf8');
  assert.ok(controller.includes('Math.round((money.net / goal) * 100)'),
    'it is the shop’s own sales divided by the goal');
});
