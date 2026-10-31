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
    //
    // NV-K05W used to be the example here, until the shop said every NV-
    // code is solar. That is the right way round: the shop knows its own
    // range, and a list of words does not.
    assert.strictEqual(guessFromName('Masking Tape'), null);
    assert.strictEqual(guessFromName('ESC EMERGENCY LIGHT'), null);
    assert.strictEqual(guessFromName(''), null);
  });

  await t.test('a short word cannot match inside a longer one', () => {
    // "lan " padded, or every Atlantic-something lands in networking.
    assert.notStrictEqual(guessFromName('Atlantic Paint'), 'networking');
  });
});

test("the shop's own product codes", async (t) => {
  await t.test('NV- is the solar range, whatever follows it', () => {
    // The largest group the word list could not read: NV-K52, NV-E954,
    // NV-T226 and the rest are all solar, and no English word in them says
    // so. The shop's own naming beats any guess.
    for (const name of ['NV-K05W TOUCH', 'NV-K52', 'NV-E954', 'NV-T226', 'nv-x9']) {
      assert.strictEqual(guessFromName(name), 'solar', name);
    }
  });

  await t.test('an NVR is still a recorder, not a solar product', () => {
    // "nv-" carries the hyphen for exactly this reason.
    assert.strictEqual(guessFromName('NVR 8 Channel'), 'networking');
  });
});

test('IT covers more than networking', async (t) => {
  await t.test('cameras, by brand and by code', () => {
    // Hikvision's own codes carry no English word at all.
    assert.strictEqual(guessFromName('Hikvision DS-2CD1043G2'), 'networking');
    assert.strictEqual(guessFromName('DS-2CD2043G0-I'), 'networking');
    assert.strictEqual(guessFromName('Dahua 4MP Dome'), 'networking');
  });

  await t.test('phones and what is sold beside them', () => {
    assert.strictEqual(guessFromName('Tecno Spark 20'), 'networking');
    assert.strictEqual(guessFromName('iPhone 13 Pro'), 'networking');
    assert.strictEqual(guessFromName('Power Bank 20000mAh'), 'networking');
    assert.strictEqual(guessFromName('64GB Memory Card'), 'networking');
  });

  await t.test('and the networking gear it was already finding', () => {
    assert.strictEqual(guessFromName('RJ45 Connector 100pcs'), 'networking');
    assert.strictEqual(guessFromName('Starlink Mini Kit'), 'networking');
  });

  await t.test('a charge controller is still solar, not a phone charger', () => {
    // "charger" sits in IT and "charge controller" in solar; solar is read
    // first, so the specific one wins.
    assert.strictEqual(guessFromName('Charge Controller 60A'), 'solar');
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

  await t.test('the shop calls the middle one IT', () => {
    // The stored value stays 'networking' so nothing already written
    // against a category or a product has to be migrated; only the word on
    // the screen changes.
    assert.strictEqual(ASPECTS.find((a) => a.key === 'networking').label, 'IT');
  });
});
