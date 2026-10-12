const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const Module = require('module');
const B = path.join(__dirname, '..');

let shelf = [];
let lastFilter = null;
let sent = null;

const orig = Module._load;
Module._load = function (req) {
  if (req.includes('models/Product')) return {
    find: (f) => { lastFilter = f; const q = {};
      for (const m of ['select', 'sort']) q[m] = () => q;
      q.lean = async () => shelf.filter(p => !f._id || f._id.$in.includes(String(p._id)));
      return q; },
  };
  if (req.includes('models/Settings')) return { findOne: () => ({ lean: async () => ({}) }) };
  if (req.includes('utils/pdfGenerator')) return {
    generateBarcodeSheet: async (opts) => { sent = opts; return Buffer.from('%PDF-1.4'); },
  };
  if (req === 'express-validator') return { validationResult: () => ({ isEmpty: () => true, array: () => [] }) };
  return orig.apply(this, arguments);
};
const c = require(path.join(B, 'controllers/productsController.js'));
Module._load = orig;

const ID1 = '6700000000000000000000a1';
const ID2 = '6700000000000000000000a2';
const res = () => { const r = { code: 200, headers: {} };
  r.status = (s) => { r.code = s; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.send = (b) => { r.sent = b; return r; };
  return r; };
const sheet = async (query = {}) => { const r = res(); sent = null; await c.getBarcodeSheet({ query }, r); return r; };

test('printing barcodes for one product, not the whole shelf', async (t) => {
  shelf = [
    { _id: ID1, name: 'Deep Cycle Battery', barcode: '2000000000017' },
    { _id: ID2, name: '450W Panel', barcode: '2000000000024' },
  ];

  await t.test('no id still prints everything, as it always did', async () => {
    const r = await sheet();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(sent.items.length, 2);
    assert.deepStrictEqual(lastFilter, { is_active: { $ne: false } });
  });

  await t.test('one product prints only that product', async () => {
    const r = await sheet({ id: ID1 });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(sent.items.length, 1);
    assert.strictEqual(sent.items[0].name, 'Deep Cycle Battery');
  });

  await t.test('copies repeats the label', async () => {
    await sheet({ id: ID1, copies: '40' });
    assert.strictEqual(sent.items.length, 40);
    assert.ok(sent.items.every(i => i.barcode === '2000000000017'));
  });

  await t.test('the header counts labels, not products', async () => {
    assert.match(sent.subtitle, /Deep Cycle Battery/);
    assert.match(sent.subtitle, /40 labels/);
  });

  await t.test('several products can be printed together', async () => {
    await sheet({ ids: `${ID1},${ID2}`, copies: '2' });
    assert.strictEqual(sent.items.length, 4);
    assert.match(sent.subtitle, /2 products/);
  });

  await t.test('a daft number of copies is capped rather than attempted', async () => {
    await sheet({ id: ID1, copies: '999999' });
    assert.strictEqual(sent.items.length, 500);
  });

  await t.test('copies of nothing is still one label', async () => {
    await sheet({ id: ID1, copies: '0' });
    assert.strictEqual(sent.items.length, 1);
    await sheet({ id: ID1, copies: 'abc' });
    assert.strictEqual(sent.items.length, 1);
  });

  await t.test('an id that is not an id is refused, not treated as "everything"', async () => {
    const r = await sheet({ id: 'drop-table' });
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /could not be read/);
  });

  await t.test('a product that is not there says so', async () => {
    const r = await sheet({ id: '6700000000000000000000ff' });
    assert.strictEqual(r.code, 404);
  });

  await t.test('a product with no barcode is named instead of printing a blank sheet', async () => {
    shelf = [{ _id: ID1, name: 'Unlabelled Thing', barcode: '' }];
    const r = await sheet({ id: ID1, copies: '10' });
    assert.strictEqual(r.code, 400);
    assert.match(r.body.message, /Unlabelled Thing has no barcode yet/);
  });

  await t.test('the file is named after the product, so a print queue is readable', async () => {
    shelf = [{ _id: ID1, name: 'Deep Cycle Battery', barcode: '2000000000017' }];
    const r = await sheet({ id: ID1 });
    assert.match(r.headers['Content-Disposition'], /deep-cycle-battery-barcodes\.pdf/);
  });
});

test('the labels are really drawn', async (t) => {
  // The real generator and the real barcode maths, not stubs.
  const { generateBarcodeSheet } = require(path.join(B, 'utils/pdfGenerator.js'));
  const { modules } = require(path.join(B, 'utils/ean13.js'));
  const GOOD = '2000000000015';

  const sheetOf = (n) => {
    const bits = modules(GOOD);
    const items = Array.from({ length: n }, () => ({ name: 'Deep Cycle Battery', barcode: GOOD, bits }));
    return generateBarcodeSheet({ items, missing: [], subtitle: `Deep Cycle Battery · ${n} labels` });
  };

  await t.test('a run of labels comes out as a real PDF', async () => {
    const pdf = await sheetOf(12);
    assert.ok(Buffer.isBuffer(pdf));
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
  });

  await t.test('more labels than fit a page carry on to the next', async () => {
    // Three across, seven down — 21 to a page.
    const one = await sheetOf(21);
    const two = await sheetOf(40);
    const pages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.strictEqual(pages(one), 1);
    assert.strictEqual(pages(two), 2);
  });

  await t.test('a barcode that is not a real EAN-13 is refused, not drawn wrong', () => {
    // 2000000000017 fails the check digit. A scanner reading a wrongly drawn
    // label would pull up the wrong product at the till, so the generator
    // prints the number and says it cannot be drawn instead.
    assert.strictEqual(modules('2000000000017'), null);
    assert.ok(modules(GOOD), 'and a correct one still draws');
    assert.strictEqual(modules(GOOD).length, 95);
  });
});
