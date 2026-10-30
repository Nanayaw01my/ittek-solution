const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const B = path.join(__dirname, '..');
const { classify, guessFromName, ASPECTS } = require(path.join(B, 'config/aspects.js'));

/**
 * Which side of the business a product belongs to.
 *
 * Solar, networking and electricals are sold out of one till and one
 * catalogue — correctly, because a customer buying panels and a router pays
 * once. The split is only ever asked for afterwards, by the owners, and
 * nobody is going to tag five hundred products by hand to make it possible.
 *
 * So it is worked out, and the order matters: what somebody set beats what
 * the category says, which beats a guess from the name. A guess is the last
 * resort and is marked as one, because a figure on an owner's screen that
 * came from a word match should be correctable.
 */

test('what the name says', async (t) => {
  await t.test('the obvious ones', () => {
    assert.strictEqual(guessFromName('Solar Panel 400W'), 'solar');
    assert.strictEqual(guessFromName('Inverter 3kVA'), 'solar');
    assert.strictEqual(guessFromName('Starlink Mini Kit'), 'networking');
    assert.strictEqual(guessFromName('CAT6 Cable 305m'), 'networking');
    assert.strictEqual(guessFromName('MCB 32A Breaker'), 'electrical');
  });

  await t.test('a word that means two things goes to the one it names', () => {
    // "Switch" is a network switch and a light switch; "cable" is solar
    // cable, CAT6 and house wiring. The specific word decides.
    assert.strictEqual(guessFromName('Network Switch 8 Port'), 'networking');
    assert.strictEqual(guessFromName('Light Switch 2 Gang'), 'electrical');
    assert.strictEqual(guessFromName('Solar Cable 6mm'), 'solar');
    assert.strictEqual(guessFromName('2.5mm Twin Cable'), 'electrical');
  });

  await t.test('nothing recognisable is nothing, not a guess', () => {
    // "Unsorted" is a useful answer. A wrong one is not: it puts money on
    // the wrong side of the business and nobody ever finds out.
    assert.strictEqual(guessFromName('Masking Tape'), null);
    assert.strictEqual(guessFromName('NV-K05W TOUCH'), null);
    assert.strictEqual(guessFromName(''), null);
  });

  await t.test('a short word cannot match inside a longer one', () => {
    // "lan " padded, or every Atlantic-something lands in networking.
    assert.notStrictEqual(guessFromName('Atlantic Paint'), 'networking');
  });
});

test('which side a product is on, and on whose say-so', async (t) => {
  await t.test('what somebody set on the product wins', () => {
    const r = classify({ name: 'Solar Panel 400W', aspect: 'networking' });
    assert.strictEqual(r.aspect, 'networking');
    assert.strictEqual(r.source, 'product');
  });

  await t.test('then what the category says', () => {
    // Set once on a category and every product under it is placed — which
    // is the whole point of putting it there rather than on the product.
    const r = classify({ name: 'NV-K05W TOUCH' }, { name: 'Accessories', aspect: 'electrical' });
    assert.strictEqual(r.aspect, 'electrical');
    assert.strictEqual(r.source, 'category');
  });

  await t.test('then the name, marked as a guess', () => {
    const r = classify({ name: 'Inverter 3kVA' }, { name: 'Accessories' });
    assert.strictEqual(r.aspect, 'solar');
    assert.strictEqual(r.source, 'guess');
  });

  await t.test("the category's own name counts as a guess too", () => {
    // A category called "Solar Panels" says what it is, even if nobody has
    // filled in its business line.
    const r = classify({ name: 'NV-K05W TOUCH' }, { name: 'Solar Panels' });
    assert.strictEqual(r.aspect, 'solar');
    assert.strictEqual(r.source, 'guess');
  });

  await t.test('and otherwise it says so', () => {
    const r = classify({ name: 'Masking Tape' }, { name: 'Sundries' });
    assert.strictEqual(r.aspect, 'other');
    assert.strictEqual(r.source, 'none');
  });

  await t.test('"other" set by hand does not block the guess', () => {
    // Left at the default, or set to Unsorted by accident, a product whose
    // name is obvious should still be placed rather than stranded.
    const r = classify({ name: 'Solar Panel 400W', aspect: 'other' });
    assert.strictEqual(r.aspect, 'solar');
  });

  await t.test('rubbish in the field is ignored, not trusted', () => {
    const r = classify({ name: 'Solar Panel 400W', aspect: 'SOMETHING ELSE' });
    assert.strictEqual(r.aspect, 'solar');
  });

  await t.test('a sale line with no product record still classifies', () => {
    // A product deleted since the sale leaves only the name on the line,
    // and the day's takings must still add up across the three lines.
    const r = classify({ product_name: 'Starlink Mini Kit' }, null);
    assert.strictEqual(r.aspect, 'networking');
  });
});

test('the lines themselves', async (t) => {
  await t.test('three sides of the business, plus somewhere for the rest', () => {
    assert.deepStrictEqual(ASPECTS.map((a) => a.key), ['solar', 'networking', 'electrical', 'other']);
  });
});
