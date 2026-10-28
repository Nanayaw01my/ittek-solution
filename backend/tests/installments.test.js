const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const B = path.join(__dirname, '..');
const { breakdown } = require(path.join(B, 'utils/installments.js'));

/**
 * A balance broken into daily, weekly and monthly payments.
 *
 * A customer asks what it comes to and then whether they can manage it.
 * GHC2,700 over three months is GHC900 a month, which sounds like a lot; it
 * is also GHC30 a day, which does not. The three are the same plan, and the
 * figures have to agree with each other or the sheet is worthless.
 */

test('the deposit and what is left', async (t) => {
  await t.test('the balance is the goods less what they put down', () => {
    const b = breakdown({ total: 3000, downPayment: 300, months: 3 });
    assert.strictEqual(b.down, 300);
    assert.strictEqual(b.balance, 2700);
  });

  await t.test('no deposit means the whole thing is spread', () => {
    assert.strictEqual(breakdown({ total: 3000, months: 3 }).balance, 3000);
  });

  await t.test('a deposit bigger than the goods is a typo, not a gift', () => {
    // Uncapped this prints "-GHC40 a week", which makes the sheet worthless.
    const b = breakdown({ total: 1000, downPayment: 5000, months: 3 });
    assert.strictEqual(b.down, 1000);
    assert.strictEqual(b.balance, 0);
    assert.ok(b.options.every((o) => o.amount === 0));
  });

  await t.test('paying it all today leaves nothing to spread', () => {
    const b = breakdown({ total: 1000, downPayment: 1000, months: 6 });
    assert.strictEqual(b.balance, 0);
  });
});

test('how many payments a term holds', async (t) => {
  await t.test('three months is 3 monthly, 13 weekly, 90 daily', () => {
    // What a shop means by "three months, weekly" is thirteen payments, not
    // 13.04 — nobody collects a fraction of a payment.
    const b = breakdown({ total: 2700, months: 3 });
    const by = Object.fromEntries(b.options.map((o) => [o.key, o.periods]));
    assert.deepStrictEqual(by, { daily: 90, weekly: 13, monthly: 3 });
  });

  await t.test('one month is 1, 4 and 30', () => {
    const by = Object.fromEntries(breakdown({ total: 600, months: 1 }).options.map((o) => [o.key, o.periods]));
    assert.deepStrictEqual(by, { daily: 30, weekly: 4, monthly: 1 });
  });

  await t.test('a term of nothing is one month, not an infinity', () => {
    // A blank or zero in the form must not divide by zero on the sheet.
    const b = breakdown({ total: 600, months: 0 });
    assert.strictEqual(b.months, 1);
    assert.ok(b.options.every((o) => Number.isFinite(o.amount)));
  });

  await t.test('an absurd term is capped rather than printed', () => {
    assert.strictEqual(breakdown({ total: 600, months: 999 }).months, 60);
  });
});

test('what each payment comes to', async (t) => {
  await t.test('GHC2,700 over three months', () => {
    const by = Object.fromEntries(breakdown({ total: 3000, downPayment: 300, months: 3 })
      .options.map((o) => [o.key, o.amount]));
    assert.strictEqual(by.monthly, 900);
    assert.strictEqual(by.daily, 30);
    assert.strictEqual(by.weekly, 207.69);
  });

  await t.test('a figure that does not divide evenly is marked approximate', () => {
    // 207.69 × 13 is 2,699.97, not 2,700. A customer who adds it up deserves
    // to have been told, rather than thinking the shop cannot count.
    const weekly = breakdown({ total: 3000, downPayment: 300, months: 3 })
      .options.find((o) => o.key === 'weekly');
    assert.strictEqual(weekly.approx, true);
    assert.ok(Math.abs(weekly.total - 2700) < 0.05);
  });

  await t.test('one that divides evenly is not', () => {
    const monthly = breakdown({ total: 3000, downPayment: 300, months: 3 })
      .options.find((o) => o.key === 'monthly');
    assert.strictEqual(monthly.approx, false);
  });

  await t.test('the three rhythms clear the same balance', () => {
    // They are one plan paid at three speeds. If they disagree by more than
    // rounding, the sheet is quoting three different prices.
    const b = breakdown({ total: 13000, downPayment: 4000, months: 6 });
    for (const o of b.options) {
      assert.ok(Math.abs(o.total - b.balance) < 1,
        `${o.key} clears ${o.total} against a balance of ${b.balance}`);
    }
  });

  await t.test('nothing at all does not produce NaN on a printed sheet', () => {
    const b = breakdown({});
    assert.strictEqual(b.balance, 0);
    assert.ok(b.options.every((o) => o.amount === 0));
  });
});
