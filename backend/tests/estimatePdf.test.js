const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const B = path.join(__dirname, '..');
const { generateEstimate } = require(path.join(B, 'utils/pdfGenerator.js'));

/**
 * The estimate a customer takes away.
 *
 * A quotation that lives only in the system is half a quotation: the figure
 * still ends up written on paper, and then nothing knows what was promised.
 *
 * The thing the sheet must never leave out is what an estimate is *not*. A
 * customer who reads a quote as a reservation comes back in three weeks for
 * goods that went out last Tuesday, and the argument that follows is the
 * shop's to lose.
 */

const quote = {
  reference: 'EST-1042',
  customer_name: 'KWESI MENSAH',
  customer_phone: '0240000001',
  valid_until: '2026-11-15',
  createdAt: '2026-10-22',
  items: [
    { product_name: 'Solar Panel 400W', quantity: 4, unit_price: 4800, product_id: 'p1' },
    { product_name: 'Labour and cabling', quantity: 1, unit_price: 1200 },
  ],
  subtotal: 20400,
  discount: 400,
  total_amount: 20000,
  notes: 'Installation within 5 working days of a deposit.',
};

/**
 * The words on the sheet.
 *
 * PDFKit deflates its content streams, so the text is not sitting in the
 * file as characters. Every stream is inflated and the drawing operators
 * read back out of it — self-contained, rather than leaning on pdftotext
 * being installed wherever these run.
 */
const zlib = require('node:zlib');
const textOf = (buf) => {
  let out = '';
  let i = 0;
  while (true) {
    const start = buf.indexOf('stream', i);
    if (start === -1) break;
    let from = start + 6;
    if (buf[from] === 0x0d) from += 1;
    if (buf[from] === 0x0a) from += 1;
    const end = buf.indexOf('endstream', from);
    if (end === -1) break;
    const chunk = buf.subarray(from, end);
    try { out += zlib.inflateSync(chunk).toString('latin1'); } catch { /* not deflated */ }
    i = end + 9;
  }
  // Inside a content stream the words are hex, split up by kerning:
  //   [<44> 40 <414e202620444f52> 0] TJ   →  "DAN & DOR"
  // Decoding every hex run and joining them gives the sentence back.
  const words = (out.match(/<([0-9A-Fa-f]+)>/g) || [])
    .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
    .join('');
  return words + out + buf.toString('latin1');
};

test('the estimate sheet', async (t) => {
  await t.test('it is a PDF', async () => {
    const pdf = await generateEstimate(quote, {});
    assert.strictEqual(pdf.slice(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 1000);
  });

  await t.test('the heading names the customer', async () => {
    // "ESTIMATE" on its own could be anybody's. A customer holding three
    // quotes from three shops wants their own name at the top of theirs.
    const text = textOf(await generateEstimate({ ...quote, customer_name: 'Mr Yaw' }, {}));
    assert.match(text, /ESTIMATE FOR MR YAW/);
  });

  await t.test('a long name shrinks to fit rather than being cut', async () => {
    const name = 'NANA KWAME OSEI-BONSU ANNOR-GYAMFI';
    const text = textOf(await generateEstimate({ ...quote, customer_name: name }, {}));
    assert.match(text, new RegExp(`ESTIMATE FOR ${name}`));
  });

  await t.test('no name still produces a sensible heading', async () => {
    // A draft started before anybody asked who it is for.
    const text = textOf(await generateEstimate({ ...quote, customer_name: '' }, {}));
    assert.match(text, /ESTIMATE/);
    assert.ok(!/ESTIMATE FOR/.test(text));
  });

  await t.test('it says it is an estimate and reserves nothing', async () => {
    const s = textOf(await generateEstimate(quote, {}));
    assert.match(s, /ESTIMATE/);
    assert.match(s, /NOT A RESERVATION/);
    assert.match(s, /No goods are set aside/);
  });

  await t.test('the customer, the reference and the dates are on it', async () => {
    const s = textOf(await generateEstimate(quote, {}));
    assert.match(s, /KWESI MENSAH/);
    assert.match(s, /EST-1042/);
    assert.match(s, /15\/11\/2026/);
  });

  await t.test('a typed line is printed the same as a catalogue one', async () => {
    // The point of allowing a line by hand: labour and delivery are most of
    // a solar quote and are in nobody's product list.
    const s = textOf(await generateEstimate(quote, {}));
    assert.match(s, /Labour and cabling/);
    assert.match(s, /Solar Panel 400W/);
  });

  await t.test('the notes are carried', async () => {
    const s = textOf(await generateEstimate(quote, {}));
    assert.match(s, /Installation within 5 working days/);
  });

  await t.test('the total is the quoted total, not a re-added guess', async () => {
    const s = textOf(await generateEstimate(quote, {}));
    assert.match(s, /GHC20000\.00/);
  });

  await t.test('no discount line when there is no discount', async () => {
    const s = textOf(await generateEstimate(
      { ...quote, discount: 0, total_amount: 20400 }, {}
    ));
    assert.ok(!/Less discount/.test(s));
  });

  await t.test('an empty quote still prints rather than throwing', async () => {
    // Somebody prints a draft they have not filled in yet.
    const pdf = await generateEstimate({ reference: 'EST-1', items: [] }, {});
    assert.strictEqual(pdf.slice(0, 4).toString(), '%PDF');
    assert.match(textOf(pdf), /Nothing listed yet/);
  });

  await t.test('a long quote runs onto a second page instead of off the first', async () => {
    // Text written past the bottom margin silently adds a page with no
    // heading on it, which is how a quote loses half its lines.
    const many = { ...quote, items: Array.from({ length: 60 }, (_, i) => ({
      product_name: `Item number ${i}`, quantity: 1, unit_price: 100,
    })) };
    const pdf = await generateEstimate(many, {});
    const pages = (textOf(pdf).match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.ok(pages >= 2, `expected more than one page, got ${pages}`);
    assert.match(textOf(pdf), /Item number 59/);
  });
});

/**
 * Paying for it over time, on the sheet.
 *
 * Printed as all three rhythms at once rather than the one the shop guessed
 * at: a customer who balks at GHC900 a month will often take GHC30 a day
 * without blinking, and the sheet should let them find that out themselves
 * rather than need a second visit.
 */
test('the payment plan on the estimate', async (t) => {
  const withPlan = {
    ...quote,
    total_amount: 3000,
    installment: { enabled: true, down_payment: 300, months: 3 },
  };

  await t.test('the deposit and the balance are stated', async () => {
    const s = textOf(await generateEstimate(withPlan, {}));
    assert.match(s, /Pay today/);
    assert.match(s, /GHC300\.00/);
    assert.match(s, /GHC2700\.00/);
    assert.match(s, /over 3 months/);
  });

  await t.test('all three rhythms are printed', async () => {
    const s = textOf(await generateEstimate(withPlan, {}));
    assert.match(s, /DAILY/);
    assert.match(s, /WEEKLY/);
    assert.match(s, /MONTHLY/);
    assert.match(s, /GHC30\.00/);
    assert.match(s, /GHC900\.00/);
  });

  await t.test('a figure that does not divide evenly says so', async () => {
    const s = textOf(await generateEstimate(withPlan, {}));
    assert.match(s, /approx/i);
  });

  await t.test('no plan prints nothing about paying over time', async () => {
    // Most quotes are for cash. A block of instalments on one of those is
    // an offer the shop did not make.
    const s = textOf(await generateEstimate({ ...quote, installment: { enabled: false } }, {}));
    assert.ok(!/OR PAY OVER TIME/.test(s));
  });

  await t.test('it still says nothing is reserved', async () => {
    // A payment plan on the sheet must not read as an agreement.
    const s = textOf(await generateEstimate(withPlan, {}));
    assert.match(s, /NOT A RESERVATION/);
    assert.match(s, /Nothing is agreed until a payment plan is signed/);
  });
});
