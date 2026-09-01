/**
 * iPhone prices, and the installment terms worked out from them.
 *
 * Only the supplier's list price is written down below. Everything the shop
 * charges is derived from it by the rules in one place, so a new price list
 * means editing the numbers in BASE and nothing else — and so the arithmetic
 * on a sheet handed to a customer cannot quietly drift from the rule it is
 * supposed to follow.
 *
 * The rules, as set by the owner:
 *
 *   • Cash ("original") price is the list price plus 500.
 *     The iPhone 7 is the exception: plus 350.
 *   • On installment, the iPhone 11 and newer carry a further 2,000 — so 2,500
 *     over the list price. Older models carry only the 500, which means their
 *     installment price and their cash price are the same and no saving is
 *     printed against them.
 *   • Half the installment price is the down payment.
 *   • The remaining half is cleared over 3 months or 12 weeks.
 *   • The iPhone 7 is not sold on installment at all. It appears on the price
 *     list only.
 */

const CASH_MARKUP = 500;
const CASH_MARKUP_IPHONE_7 = 350;
const INSTALLMENT_EXTRA_11_UP = 2000;
const MONTHS = 3;
const WEEKS = 12;

/**
 * The supplier list, newest first — the order it is quoted in.
 *
 * `gen11up` marks the models that carry the extra 2,000 on installment.
 * `noInstallment` marks the iPhone 7, which is cash only.
 */
const BASE = [
  { name: '17 Pro Max 256GB (sealed)', price: 15800, gen11up: true },
  { name: '17 Pro 256GB (sealed)', price: 13800, gen11up: true },
  { name: '17 Pro 256GB (eSIM)', price: 12300, gen11up: true },
  { name: '17 Air 256GB (sealed)', price: 9600, gen11up: true },
  { name: '17 256GB (sealed)', price: 9700, gen11up: true },
  { name: '15 128GB', price: 5400, gen11up: true },
  { name: '14 Pro Max 256GB', price: 7000, gen11up: true },
  { name: '14 Pro 256GB', price: 6100, gen11up: true },
  { name: '14 Pro 128GB', price: 5800, gen11up: true },
  { name: '14 128GB', price: 3700, gen11up: true },
  { name: '13 Pro 256GB', price: 4600, gen11up: true },
  { name: '13 Pro 128GB', price: 4300, gen11up: true },
  { name: '13 128GB', price: 3300, gen11up: true },
  { name: '13 Mini 128GB', price: 2700, gen11up: true },
  { name: '12 Pro Max 128GB', price: 3850, gen11up: true },
  { name: '12 Pro 256GB', price: 3300, gen11up: true },
  { name: '12 Pro 128GB', price: 3200, gen11up: true },
  { name: '12 128GB', price: 2600, gen11up: true },
  { name: '12 64GB', price: 2300, gen11up: true },
  { name: '12 Mini 128GB', price: 2150, gen11up: true },
  { name: '12 Mini 64GB', price: 1900, gen11up: true },
  { name: '11 Pro Max 512GB', price: 3000, gen11up: true },
  { name: '11 Pro Max 256GB', price: 2950, gen11up: true },
  { name: '11 Pro 256GB', price: 2800, gen11up: true },
  { name: '11 Pro 64GB', price: 2550, gen11up: true },
  { name: '11 128GB', price: 2400, gen11up: true },
  { name: '11 64GB', price: 2000, gen11up: true },
  // Below the iPhone 11: the 500 only, so cash and installment price match.
  { name: 'XR 128GB', price: 1950 },
  { name: 'XR 64GB', price: 1750 },
  { name: 'SE 3 64GB', price: 1400 },
  { name: 'SE 2 64GB', price: 1200 },
  { name: '8 Plus 64GB', price: 1200 },
  { name: '7 Plus 128GB', price: 1100 },
  // Cash only, and a smaller markup.
  { name: '7 128GB', price: 700, noInstallment: true, cashMarkup: CASH_MARKUP_IPHONE_7 },
  { name: '7 32GB', price: 650, noInstallment: true, cashMarkup: CASH_MARKUP_IPHONE_7 },
];

/** To the pesewa. Rounding to the cedi would collect more than the balance. */
const round2 = (n) => Math.round(n * 100) / 100;

const cashPriceOf = (m) => m.price + (m.cashMarkup ?? CASH_MARKUP);

const installmentPriceOf = (m) =>
  m.price + CASH_MARKUP + (m.gen11up ? INSTALLMENT_EXTRA_11_UP : 0);

/** Every model with the price the shop sells it for outright. */
const IPHONE_PRICES = BASE.map((m) => ({
  name: 'iPhone ' + m.name,
  price: cashPriceOf(m),
}));

/**
 * The installment offers, in the shape the plan-sheet generator expects.
 *
 * `cashPrice` is set only where paying outright actually costs less, so the
 * older models do not print a "you save GHC0" panel.
 */
const IPHONE_PACKAGES = BASE.filter((m) => !m.noInstallment).map((m) => {
  const total = installmentPriceOf(m);
  const cash = cashPriceOf(m);
  const deposit = round2(total / 2);
  const balance = round2(total - deposit);

  return {
    name: 'iPhone ' + m.name,
    total,
    deposit,
    months: MONTHS,
    monthly: round2(balance / MONTHS),
    weeks: WEEKS,
    weekly: round2(balance / WEEKS),
    ...(cash < total ? { cashPrice: cash } : {}),
    contents: [],
  };
});

module.exports = {
  BASE,
  IPHONE_PRICES,
  IPHONE_PACKAGES,
  CASH_MARKUP,
  CASH_MARKUP_IPHONE_7,
  INSTALLMENT_EXTRA_11_UP,
  MONTHS,
  WEEKS,
};
