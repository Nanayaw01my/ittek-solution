const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const B = path.join(__dirname, '..');

const { PACKAGES, SERVICES, WHY_US, CONTACT } = require(path.join(B, 'config/starlinkFlyer.js'));
const { generateStarlinkFlyer } = require(path.join(B, 'utils/pdfGenerator.js'));

const byKey = (k) => PACKAGES.find((p) => p.key === k);

test('the prices the flyer advertises', async (t) => {
  await t.test('the balance is the installment price less the down payment', () => {
    for (const p of PACKAGES) {
      assert.strictEqual(p.remaining, Number((p.installment_total - p.down_payment).toFixed(2)), p.key);
    }
  });

  await t.test('each period is the balance divided by the periods — never the down payment', () => {
    for (const p of PACKAGES) {
      for (const o of p.options) {
        assert.strictEqual(o.amount, Number((p.remaining / o.periods).toFixed(2)), `${p.key} ${o.label}`);
        assert.ok(o.amount < p.down_payment, 'a period amount must never resemble the down payment');
      }
    }
  });

  await t.test('the figures match the ones the shop supplied, to the pesewa', () => {
    const expected = {
      commercial: { cash: 20000, total: 25000, down: 18000, remaining: 7000, amounts: [3500, 875] },
      standard: { cash: 9000, total: 12000, down: 9500, remaining: 2500, amounts: [833.33, 208.33] },
      mini: { cash: 5800, total: 8500, down: 5800, remaining: 2700, amounts: [1350, 337.50] },
    };
    for (const [key, e] of Object.entries(expected)) {
      const p = byKey(key);
      assert.strictEqual(p.cash, e.cash, `${key} cash`);
      assert.strictEqual(p.installment_total, e.total, `${key} total`);
      assert.strictEqual(p.down_payment, e.down, `${key} down`);
      assert.strictEqual(p.remaining, e.remaining, `${key} remaining`);
      assert.deepStrictEqual(p.options.map((o) => o.amount), e.amounts, `${key} per period`);
    }
  });

  await t.test("the Mini's two cash parts add up to its cash price", () => {
    const mini = byKey('mini');
    const sum = mini.cash_parts.reduce((s, part) => s + part.amount, 0);
    assert.strictEqual(sum, mini.cash, '4,800 + 1,000 must be the 5,800 on the card');
  });

  await t.test('a figure that does not divide evenly is marked approximate', () => {
    // 833.33 x 3 is 2,499.99, not 2,500 — a customer who adds it up is owed
    // that "~" rather than a reason to doubt the shop's arithmetic.
    const standard = byKey('standard');
    assert.ok(standard.options.every((o) => o.approx));
    assert.ok(byKey('commercial').options.every((o) => !o.approx), '3,500 x 2 is exactly 7,000');
    assert.ok(byKey('mini').options.every((o) => !o.approx), '337.50 x 8 is exactly 2,700');
  });

  await t.test('every package offers a choice of schedule, not a sum of both', () => {
    for (const p of PACKAGES) {
      assert.strictEqual(p.options.length, 2, p.key);
      const [monthly, weekly] = p.options;
      assert.match(monthly.unit, /month/);
      assert.match(weekly.unit, /week/);
    }
  });
});

test('the flyer itself', async (t) => {
  const build = (over = {}) => generateStarlinkFlyer({
    packages: PACKAGES, services: SERVICES, whyUs: WHY_US, contact: CONTACT,
    company: { name: CONTACT.company, address: CONTACT.location },
    ...over,
  });

  await t.test('it is a real PDF of exactly two pages', async () => {
    const pdf = await build();
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.strictEqual(pages, 2, 'one page of packages, one of services — no stray blanks');
  });

  await t.test('it still builds when the shop has no logo set', async () => {
    // A missing or unreachable logo must not cost the shop its advertisement.
    const pdf = await build({ logoUrl: null });
    assert.ok(pdf.length > 5000);
  });

  await t.test('it survives a logo URL that cannot be fetched', async () => {
    const pdf = await build({ logoUrl: 'http://127.0.0.1:1/nope.png' });
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');
  });

  await t.test('the prices, the phone numbers and the location are on it', async () => {
    const pdf = await build();
    // PDFKit compresses its content streams, so they are inflated before
    // being read. Checking the bytes as they are would silently pass on an
    // empty flyer.
    const zlib = require('zlib');
    let text = '';
    const raw = pdf.toString('latin1');
    const re = /stream\r?\n/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const start = m.index + m[0].length;
      const end = raw.indexOf('endstream', start);
      if (end < 0) continue;
      try {
        text += zlib.inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1');
      } catch { /* not a deflated stream — an image, or already plain */ }
    }
    assert.ok(text.length > 1000, 'nothing could be read back out of the flyer');

    // Inside the stream the words are drawn as hex strings, split wherever
    // the font kerns, so they are decoded and stitched back together before
    // anything is looked for.
    const words = (text.match(/<[0-9a-fA-F]+>/g) || [])
      .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
      .join('');

    for (const needle of [
      '0598565277', '0595413632', 'Bogoso',
      'STARLINK PACKAGES', 'GET CONNECTED TODAY',
      '20,000', '9,000', '5,800',          // the cash prices
      '3,500', '875', '833.33', '208.33', '1,350', '337.50',   // every period amount
    ]) {
      assert.ok(words.includes(needle), `${needle} must appear on the flyer`);
    }
  });
});
