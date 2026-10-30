const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

/**
 * The day's takings, split three ways.
 *
 * The split has to add back up to the day. An owner who reads GHC4,000 on
 * this screen and GHC4,800 on the dashboard stops trusting both.
 */

let sales = [];
let products = [];
let categories = [];

/** select / sort / lean, in any order, as mongoose allows. */
const chain = (rows) => {
  const c = {};
  c.select = () => c;
  c.sort = () => c;
  c.lean = async () => rows;
  return c;
};

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Sale')) return { find: () => chain(sales) };
  if (req.includes('models/Product')) return { find: () => chain(products), findByIdAndUpdate: async () => null };
  if (req.includes('models/Category')) return { find: () => chain(categories) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/aspectsController.js'));
Module._load = orig;

const res = () => { const r = { code: 200 }; r.status = (s) => { r.code = s; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const ask = async (query = {}) => { const r = res(); await c.salesByAspect({ query }, r); return r; };
const line = (name, qty, price, cost, id) => ({
  product_id: id || null, product_name: name, quantity: qty,
  unit_price: price, cost_price: cost, total: qty * price,
});

test("a day's sales, split three ways", async (t) => {
  t.beforeEach(() => {
    categories = [];
    products = [];
    sales = [
      { _id: 's1', items: [line('Solar Panel 400W', 2, 4800, 3600), line('CAT6 Cable', 1, 900, 600)] },
      { _id: 's2', items: [line('MCB 32A Breaker', 4, 50, 30)] },
      { _id: 's3', items: [line('Masking Tape', 1, 20, 12)] },
    ];
  });

  const by = (body) => Object.fromEntries(body.data.lines.map((l) => [l.key, l]));

  await t.test('each line takes its own products', async () => {
    const r = await ask();
    const l = by(r.body);
    assert.strictEqual(l.solar.revenue, 9600);
    assert.strictEqual(l.networking.revenue, 900);
    assert.strictEqual(l.electrical.revenue, 200);
    assert.strictEqual(l.other.revenue, 20);
  });

  await t.test('and they add back up to the day', async () => {
    // The check that matters. A split that does not reconcile with the
    // dashboard makes an owner stop trusting both screens.
    const r = await ask();
    const sum = r.body.data.lines.reduce((n, x) => n + x.revenue, 0);
    assert.strictEqual(Number(sum.toFixed(2)), r.body.data.total.revenue);
    assert.strictEqual(r.body.data.total.revenue, 10720);
  });

  await t.test('profit is revenue less what the goods cost', async () => {
    const l = by((await ask()).body);
    assert.strictEqual(l.solar.profit, 9600 - 7200);
    assert.strictEqual(l.electrical.profit, 200 - 120);
  });

  await t.test('the share of the day is a percentage of the takings', async () => {
    const l = by((await ask()).body);
    assert.strictEqual(l.solar.share, 89.6);
    assert.strictEqual(
      Math.round(l.solar.share + l.networking.share + l.electrical.share + l.other.share),
      100
    );
  });

  await t.test('one sale touching two lines counts once in each', async () => {
    const l = by((await ask()).body);
    assert.strictEqual(l.solar.sales, 1);
    assert.strictEqual(l.networking.sales, 1);
    // ...but the day had three sales, not four.
    assert.strictEqual((await ask()).body.data.total.sales, 3);
  });

  await t.test('what could not be placed is said, not hidden', async () => {
    const l = by((await ask()).body);
    assert.strictEqual(l.other.pieces, 1);
    assert.strictEqual(l.other.products[0].name, 'Masking Tape');
  });

  await t.test('a category with a line set beats the name', async () => {
    // Set once on a category, every product under it moves.
    categories = [{ _id: 'c1', name: 'Accessories', aspect: 'networking' }];
    products = [{ _id: 'p1', name: 'Masking Tape', category_id: 'c1' }];
    sales = [{ _id: 's1', items: [line('Masking Tape', 1, 20, 12, 'p1')] }];
    const l = by((await ask()).body);
    assert.strictEqual(l.networking.revenue, 20);
    assert.strictEqual(l.other.revenue, 0);
  });

  await t.test('guessed lines are counted so the screen can say so', async () => {
    const l = by((await ask()).body);
    assert.ok(l.solar.guessed > 0, 'a name-matched line should be marked');
  });

  await t.test('a debt payment is not counted as a second sale of the goods', async () => {
    // The panel was counted on the day it left the shop. Counting the
    // instalment too would put it in Solar twice.
    sales = [];
    const r = await ask();
    assert.strictEqual(r.body.data.total.revenue, 0);
  });

  await t.test('products within a line are biggest first', async () => {
    sales = [{ _id: 's1', items: [line('Solar Cable', 1, 100, 50), line('Solar Panel 400W', 2, 4800, 3600)] }];
    const l = by((await ask()).body);
    assert.strictEqual(l.solar.products[0].name, 'Solar Panel 400W');
  });

  await t.test('nothing sold is zeroes, not an error', async () => {
    sales = [];
    const r = await ask();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.data.total.revenue, 0);
    assert.ok(r.body.data.lines.every((x) => x.share === 0));
  });
});

/**
 * The sum done where it can be seen.
 *
 * Sold, less what the goods cost, is the profit. An owner checking a day's
 * profit wants the two figures it came from, not to be asked to trust the
 * difference — and a range tells them what a week came to without telling
 * them which day was good.
 */
test('cost, takings and profit, day by day', async (t) => {
  t.beforeEach(() => {
    categories = [];
    products = [];
    sales = [
      { _id: 's1', sale_date: '2026-10-28T10:00:00Z', items: [line('Solar Panel 400W', 2, 4800, 3600)] },
      { _id: 's2', sale_date: '2026-10-28T16:00:00Z', items: [line('MCB 32A Breaker', 4, 50, 30)] },
      { _id: 's3', sale_date: '2026-10-30T09:00:00Z', items: [line('CAT6 Cable', 1, 900, 600)] },
    ];
  });

  await t.test('the cost of the goods is reported, not only the profit', async () => {
    const r = await ask();
    assert.strictEqual(r.body.data.total.revenue, 10700);
    assert.strictEqual(r.body.data.total.cost, 7920);
    assert.strictEqual(r.body.data.total.profit, 2780);
  });

  await t.test('and the three figures are consistent with each other', async () => {
    // Sold minus cost is profit. If this ever drifts, every figure on the
    // screen is suspect.
    const tl = (await ask()).body.data.total;
    assert.strictEqual(Number((tl.revenue - tl.cost).toFixed(2)), tl.profit);
  });

  await t.test('the share kept is profit against takings', async () => {
    assert.strictEqual((await ask()).body.data.total.margin, 26);
  });

  await t.test('each day is reported on its own', async () => {
    const days = (await ask()).body.data.days;
    assert.strictEqual(days.length, 2);
    const oct28 = days.find((d) => d.date === '2026-10-28');
    assert.strictEqual(oct28.revenue, 9800);
    assert.strictEqual(oct28.cost, 7320);
    assert.strictEqual(oct28.profit, 2480);
    assert.strictEqual(oct28.sales, 2);
  });

  await t.test('the days add back up to the range', async () => {
    const { days, total } = (await ask()).body.data;
    assert.strictEqual(Number(days.reduce((n, d) => n + d.revenue, 0).toFixed(2)), total.revenue);
    assert.strictEqual(Number(days.reduce((n, d) => n + d.profit, 0).toFixed(2)), total.profit);
  });

  await t.test('newest day first, because that is the one being asked about', async () => {
    const days = (await ask()).body.data.days;
    assert.strictEqual(days[0].date, '2026-10-30');
  });

  await t.test('a day with no sales is absent rather than a row of zeroes', async () => {
    // 29 October had nothing. A row of zeroes for every quiet day turns a
    // month into a wall of nothing.
    const days = (await ask()).body.data.days;
    assert.ok(!days.some((d) => d.date === '2026-10-29'));
  });

  await t.test('goods sold at cost show no profit rather than a negative share', async () => {
    sales = [{ _id: 's1', sale_date: '2026-10-30T09:00:00Z', items: [line('Solar Panel 400W', 1, 3600, 3600)] }];
    const r = await ask();
    assert.strictEqual(r.body.data.total.profit, 0);
    assert.strictEqual(r.body.data.total.margin, 0);
  });

  await t.test('no sales at all leaves no days and no division by zero', async () => {
    sales = [];
    const r = await ask();
    assert.deepStrictEqual(r.body.data.days, []);
    assert.strictEqual(r.body.data.total.margin, 0);
  });

  await t.test('a sale with an unreadable date costs its day, not the report', async () => {
    // An old record or a bad import. One unusable date must not take an
    // owner's whole screen down with it — the line still counts towards its
    // business line and the totals.
    sales = [
      { _id: 's1', sale_date: null, items: [line('Solar Panel 400W', 1, 4800, 3600)] },
      { _id: 's2', sale_date: 'not a date', items: [line('CAT6 Cable', 1, 900, 600)] },
      { _id: 's3', sale_date: '2026-10-30T09:00:00Z', items: [line('MCB 32A Breaker', 2, 50, 30)] },
    ];
    const r = await ask();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.data.total.revenue, 5800);
    assert.strictEqual(r.body.data.days.length, 1);
    assert.strictEqual(r.body.data.days[0].revenue, 100);
  });
});

/**
 * Sorting the catalogue itself.
 *
 * The report works a product's department out as it runs, which answers the
 * question but leaves nothing behind. Writing the guesses down turns them
 * into something an owner can see and correct — and it must never overwrite
 * what a person has already decided.
 */
test('sorting the catalogue into departments', async (t) => {
  let written = [];
  const Module2 = require('module');
  const o = Module2._load;
  Module2._load = function (req) {
    if (req.includes('models/Product')) return {
      find: () => chain(products),
      bulkWrite: async (ops) => { written = ops; return { modifiedCount: ops.length }; },
      findByIdAndUpdate: async () => null,
    };
    if (req.includes('models/Category')) return { find: () => chain(categories) };
    if (req.includes('models/Sale')) return { find: () => chain(sales) };
    return o.apply(this, arguments);
  };
  delete require.cache[require.resolve(path.join(B, 'controllers/aspectsController.js'))];
  const ctl = require(path.join(B, 'controllers/aspectsController.js'));
  Module2._load = o;

  const sortNow = async () => {
    written = [];
    const r = res();
    await ctl.autoSort({ body: {} }, r);
    return r;
  };
  const lookAt = async () => { const r = res(); await ctl.catalogue({}, r); return r; };

  t.beforeEach(() => {
    categories = [{ _id: 'c1', name: 'Accessories', aspect: '' }];
    products = [
      { _id: 'p1', name: 'Solar Panel 400W', aspect: '', category_id: 'c1' },
      { _id: 'p2', name: 'CAT6 Cable 305m', aspect: '', category_id: 'c1' },
      { _id: 'p3', name: 'Masking Tape', aspect: '', category_id: 'c1' },
    ];
  });

  await t.test('a guess becomes a department written down', async () => {
    const r = await sortNow();
    assert.strictEqual(r.body.data.updated, 2);
    const set = Object.fromEntries(written.map((w) => [String(w.updateOne.filter._id), w.updateOne.update.$set.aspect]));
    assert.deepStrictEqual(set, { p1: 'solar', p2: 'networking' });
  });

  await t.test('what it cannot read is left alone, not guessed at', async () => {
    await sortNow();
    assert.ok(!written.some((w) => String(w.updateOne.filter._id) === 'p3'));
  });

  await t.test("a person's decision is never overwritten", async () => {
    // The whole risk of a button that edits five hundred products at once.
    products[0].aspect = 'electrical';
    await sortNow();
    assert.ok(!written.some((w) => String(w.updateOne.filter._id) === 'p1'));
  });

  await t.test('a category that has a department settles its products', async () => {
    categories[0].aspect = 'electrical';
    const r = await sortNow();
    assert.strictEqual(r.body.data.updated, 0,
      'nothing to write: the category already answers for all of them');
  });

  await t.test('the result reaches the screen, not just the server log', async () => {
    // The browser's axios layer keeps only `data` and drops every sibling,
    // so a sentence sent beside it never arrives — and the owner who just
    // edited five hundred products is told "Sorted." and nothing else.
    const r = await sortNow();
    assert.match(r.body.data.message, /Sorted 2 products/);
    assert.match(r.body.data.message, /to Solar/);
  });

  await t.test('sorting twice changes nothing the second time', async () => {
    await sortNow();
    products[0].aspect = 'solar';
    products[1].aspect = 'networking';
    const again = await sortNow();
    assert.strictEqual(again.body.data.updated, 0);
    assert.match(again.body.message, /Nothing to sort/);
  });

  await t.test('the view says what is certain and what is guessed', async () => {
    const r = await lookAt();
    const by = Object.fromEntries(r.body.data.counts.map((c) => [c.key, c]));
    assert.strictEqual(by.solar.guessed, 1);
    assert.strictEqual(by.solar.certain, 0);
    assert.strictEqual(r.body.data.guessed_total, 2);
    assert.strictEqual(r.body.data.unplaced_total, 1);
    assert.strictEqual(r.body.data.unplaced[0].name, 'Masking Tape');
  });

  await t.test('once written down they count as certain', async () => {
    products[0].aspect = 'solar';
    const by = Object.fromEntries((await lookAt()).body.data.counts.map((c) => [c.key, c]));
    assert.strictEqual(by.solar.certain, 1);
    assert.strictEqual(by.solar.guessed, 0);
  });
});
