const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const B = path.join(__dirname, '..');
const { qualifies, giftFor, giftStockLines } = require(path.join(B, 'utils/giftPromo.js'));

/**
 * Spend this much, get a gift.
 *
 * The promotion only works if the till remembers it — staff change, the
 * threshold moves, and a customer who qualified and was not told walks out
 * having cost the shop the goodwill it paid for by running it at all.
 */

test('who qualifies', async (t) => {
  const promo = { enabled: true, threshold: 3000 };

  await t.test('exactly the threshold counts', async () => {
    // "3000 upwards" includes 3000. Off-by-one here is a customer being
    // refused a gift at the counter while holding a receipt for the figure
    // on the poster.
    assert.strictEqual(qualifies(3000, promo), true);
  });

  await t.test('a penny under does not', () => {
    assert.strictEqual(qualifies(2999.99, promo), false);
  });

  await t.test('switched off means nobody qualifies', () => {
    assert.strictEqual(qualifies(10000, { enabled: false, threshold: 3000 }), false);
  });

  await t.test('no threshold set means nobody qualifies', () => {
    // Otherwise enabling the promotion with the figure left blank gives a
    // gift away on every sale in the shop.
    assert.strictEqual(qualifies(10, { enabled: true, threshold: 0 }), false);
    assert.strictEqual(qualifies(10, { enabled: true }), false);
  });

  await t.test('no promotion at all is not an error', () => {
    assert.strictEqual(qualifies(10000, undefined), false);
    assert.strictEqual(qualifies(10000, {}), false);
  });
});

test('what is recorded against the sale', async (t) => {
  await t.test('a gift given, with what it was', () => {
    const g = giftFor({ given: true, name: ' a branded flask ', threshold: 3000 });
    assert.strictEqual(g.given, true);
    assert.strictEqual(g.name, 'a branded flask');
  });

  await t.test('a gift refused is recorded too, not left blank', () => {
    // The more interesting row: a customer who qualified and got nothing.
    // Recording only the gifts given would hide a promotion quietly not
    // being run.
    const g = giftFor({ given: false, name: 'a cap', threshold: 3000 });
    assert.strictEqual(g.given, false);
    assert.strictEqual(g.name, 'a cap');
  });

  await t.test("the day's threshold is kept with the sale", () => {
    // The promotion will be changed. Last month's sales must still read
    // correctly against the rule that applied when they were made.
    assert.strictEqual(giftFor({ given: true, threshold: 3000 }).threshold, 3000);
  });

  await t.test('nothing sent means no gift on the sale', () => {
    assert.strictEqual(giftFor(undefined), undefined);
    assert.strictEqual(giftFor(null), undefined);
  });

  await t.test('rubbish sent as a gift does not become one', () => {
    assert.strictEqual(giftFor('yes please'), undefined);
    assert.strictEqual(giftFor(['flask']), undefined);
  });

  await t.test('a gift claimed without a name is still a gift', () => {
    // Somebody cleared the name in Settings mid-shift. The answer still
    // matters more than the label.
    const g = giftFor({ given: true, threshold: 3000 });
    assert.strictEqual(g.given, true);
    assert.strictEqual(g.name, undefined);
  });
});

test('what a gift takes off the shelf', async (t) => {
  await t.test('a stocked gift deducts one', () => {
    assert.deepStrictEqual(
      giftStockLines({ given: true, product_id: 'p9', name: 'Torch' }),
      [{ product_id: 'p9', quantity: 1 }]
    );
  });

  await t.test('a gift that is not stock deducts nothing', () => {
    // A crate of branded flasks was never counted in. Inventing a deduction
    // for it puts the count wrong the other way.
    assert.deepStrictEqual(giftStockLines({ given: true, name: 'a branded flask' }), []);
  });

  await t.test('a gift refused never touches stock, even a stocked one', () => {
    assert.deepStrictEqual(giftStockLines({ given: false, product_id: 'p9' }), []);
  });

  await t.test('no gift at all touches nothing', () => {
    assert.deepStrictEqual(giftStockLines(undefined), []);
    assert.deepStrictEqual(giftStockLines({}), []);
  });
});
