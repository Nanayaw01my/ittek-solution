/**
 * The board on the shop wall.
 *
 * One thing matters more than everything else on this screen put
 * together: a customer is standing in front of it. Whatever reaches the
 * browser is on show in a room full of strangers, and a browser's
 * developer tools open in two taps — so "the page does not display the
 * cost price" is not a defence. The field has to never leave the server.
 *
 * So these tests are mostly about what is absent. They check the query
 * itself, not the response, because by the time a cost price is in the
 * response it has already been fetched and the only thing standing
 * between it and the wall is a line of JSX.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let lastFind = null;
let products = [];
let settings = null;
let showcase = [];

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Product')) return {
    find: (filter) => {
      lastFind = { filter, select: null };
      const chain = {
        select: (f) => { lastFind.select = f; return chain; },
        sort: () => chain,
        limit: () => chain,
        lean: async () => products,
      };
      return chain;
    },
  };
  if (req.includes('models/Settings')) return { findOne: () => ({ lean: async () => settings }) };
  // The board fetches the shop's own work in the same call as the
  // prices, so this suite has to answer for it too — otherwise the
  // controller reaches a real Mongoose model and the query buffers
  // until the test times out.
  if (req.includes('models/ShowcaseItem')) return {
    find: () => ({
      select: () => ({ sort: () => ({ limit: () => ({ lean: async () => showcase }) }) }),
    }),
  };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/signageController.js'));
Module._load = orig;

const res = () => {
  const r = { code: 200 };
  r.status = (s) => { r.code = s; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const board = async () => {
  const r = res();
  await c.getBoard({}, r);
  return r;
};

test.beforeEach(() => {
  lastFind = null;
  showcase = [];
  settings = {
    company_name: 'DAN & DOR SOLAR COMPANY LIMITED',
    company_address: 'Bogoso, Western Region',
    company_phone: '0541234567',
    company_email: 'secret@example.com',
    gift_promo: { enabled: false, threshold: 3000, gift_name: '' },
    fraud_settings: { max_discount_percent: 20, large_cash_sale: 10000 },
  };
  products = [
    { _id: 'p1', name: '150W Solar Panel', selling_price: 1200, quantity: 14, low_stock_level: 5, aspect: 'solar' },
    { _id: 'p2', name: '200Ah Battery', selling_price: 3400, quantity: 3, low_stock_level: 5, aspect: 'solar' },
    { _id: 'p3', name: 'Cat6 Cable', selling_price: 8, quantity: 420, low_stock_level: 50, aspect: 'networking' },
  ];
});

test('it asks the database for named fields, never for everything', async () => {
  await board();
  assert.ok(lastFind.select, 'a select is the whole safety of this screen');

  const asked = lastFind.select.split(/\s+/).filter(Boolean);
  assert.deepStrictEqual(asked.sort(),
    ['aspect', 'image_url', 'low_stock_level', 'name', 'quantity', 'selling_price'].sort());

  // An exclusion list silently leaks every field added to the model
  // afterwards, which is exactly the kind of leak nobody notices until a
  // customer photographs it.
  assert.ok(!lastFind.select.includes('-'),
    'the fields are listed, not subtracted');
});

test('the figures a shop keeps to itself are never fetched', async () => {
  await board();
  for (const field of ['cost_price', 'supplier', 'supplier_id', 'margin', 'profit',
    'purchase_price', 'barcode', 'reorder_level', 'notes']) {
    assert.ok(!lastFind.select.includes(field), `${field} must not be asked for`);
  }
});

test('nothing private reaches the response either', async () => {
  // Belt and braces: if the select above is ever loosened, this fails too.
  products = products.map((p) => ({ ...p, cost_price: 900, supplier: 'Shenzhen Co' }));
  const r = await board();
  const json = JSON.stringify(r.body);

  for (const leak of ['cost_price', '900', 'Shenzhen', 'secret@example.com', 'max_discount', '10000']) {
    assert.ok(!json.includes(leak), `${leak} must not reach a screen customers can see`);
  }
});

test('it shows what is for sale, at what price', async () => {
  const r = await board();
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.data.products.length, 3);
  assert.deepStrictEqual(r.body.data.products[0], {
    id: 'p1', name: '150W Solar Panel', price: 1200, aspect: 'solar', image_url: null, left: null,
  });
  assert.strictEqual(r.body.data.shop.name, 'DAN & DOR SOLAR COMPANY LIMITED');
  assert.strictEqual(r.body.data.shop.phone, '0541234567');
});

test('"only N left" is said when it is nearly gone, and not otherwise', async () => {
  const r = await board();
  const by = Object.fromEntries(r.body.data.products.map((p) => [p.name, p.left]));

  assert.strictEqual(by['200Ah Battery'], 3, '3 left against a floor of 5');
  assert.strictEqual(by['150W Solar Panel'], null, '14 is not urgent');
  // The exact count on every line would tell anyone glancing through the
  // window precisely what the shop is holding.
  assert.strictEqual(by['Cat6 Cable'], null, '420 is nobody else\'s business');
});

test('only goods that can actually be sold are advertised', async () => {
  await board();
  assert.strictEqual(lastFind.filter.is_active, true);
  // A board advertising what the shop has run out of sends a customer to
  // the counter to be told no.
  assert.deepStrictEqual(lastFind.filter.quantity, { $gt: 0 });
  assert.deepStrictEqual(lastFind.filter.selling_price, { $gt: 0 });
});

test('a promotion shows only while it is running', async () => {
  let r = await board();
  assert.strictEqual(r.body.data.promo, null, 'disabled: nothing on the wall');

  settings.gift_promo = { enabled: true, threshold: 3000, gift_name: 'branded flask' };
  r = await board();
  assert.deepStrictEqual(r.body.data.promo, { threshold: 3000, gift: 'branded flask' });

  // Enabled but with nothing to give is a promotion that cannot be
  // honoured, and a sign promising a blank is worse than no sign.
  settings.gift_promo = { enabled: true, threshold: 3000, gift_name: '' };
  r = await board();
  assert.strictEqual(r.body.data.promo, null);

  // The gift's product id is a stock matter, not a customer's.
  settings.gift_promo = { enabled: true, threshold: 3000, gift_name: 'cap', gift_product_id: 'p9' };
  r = await board();
  assert.deepStrictEqual(Object.keys(r.body.data.promo).sort(), ['gift', 'threshold']);
});

test('a shop with no settings still gets a board rather than a crash', async () => {
  settings = null;
  const r = await board();
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.data.shop.name, 'ITTEK Solution');
  assert.strictEqual(r.body.data.promo, null);
  assert.strictEqual(r.body.data.products.length, 3);
});

test('the board says when it last heard from the shop', async () => {
  const r = await board();
  assert.ok(r.body.data.as_of instanceof Date,
    'so an old board can admit it is old rather than passing stale prices off as today\'s');
});

test('the shop\'s own work rides along with the prices', async () => {
  // One call a minute from the television, however much is on the board:
  // the work is fetched beside the prices rather than in a second request.
  showcase = [{ _id: 'w1', kind: 'image', url: 'https://cdn/roof.jpg',
    caption: 'Roof of 12 panels', location: 'Prestea', seconds: 15 }];

  const r = await board();
  assert.strictEqual(r.body.data.showcase.length, 1);
  assert.strictEqual(r.body.data.showcase[0].caption, 'Roof of 12 panels');
  assert.strictEqual(r.body.data.showcase[0].id, 'w1');
});

test('a shop with no work to show still gets its prices', async () => {
  showcase = [];
  const r = await board();
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(r.body.data.showcase, []);
  assert.strictEqual(r.body.data.products.length, 3);
});
