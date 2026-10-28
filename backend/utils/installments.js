/**
 * A balance broken into daily, weekly and monthly payments.
 *
 * A customer standing at the counter does not ask "what is the monthly?" —
 * they ask what it comes to, and then whether they can manage it. GHC2,700
 * over three months is GHC900 a month, which sounds like a lot; it is also
 * GHC30 a day, which does not. Showing all three at once is how the shop
 * closes the sale, and it is what staff were working out on paper.
 *
 * The same arithmetic as the Starlink flyer, deliberately: one way of
 * dividing a balance up in this system, not two that disagree in the last
 * pesewa.
 */

/**
 * How many payments a term of this many months holds, at each rhythm.
 *
 * A month is taken as 30 days and a week as 7, which is what a shop means
 * by "three months, weekly" — thirteen payments, not 13.04. Nobody collects
 * a fraction of a payment, and a schedule that says 13.04 reads as a
 * mistake.
 */
const PERIODS = {
  daily: (months) => Math.max(1, Math.round(months * 30)),
  weekly: (months) => Math.max(1, Math.round((months * 30) / 7)),
  monthly: (months) => Math.max(1, Math.round(months)),
};

const LABELS = {
  daily: { unit: 'a day', each: 'daily' },
  weekly: { unit: 'a week', each: 'weekly' },
  monthly: { unit: 'a month', each: 'monthly' },
};

/**
 * The plan behind an estimate.
 *
 * @param {Object} o
 * @param {number} o.total         what the goods come to
 * @param {number} o.downPayment   what the customer puts down today
 * @param {number} o.months        how long they have to clear the rest
 * @returns {{down: number, balance: number, months: number, options: Array}}
 */
const breakdown = ({ total, downPayment = 0, months = 3 } = {}) => {
  const goods = Math.max(0, Number(total) || 0);
  /**
   * A deposit larger than the goods is a typo, not a gift.
   *
   * Capping it keeps the balance at zero rather than producing negative
   * instalments, which print as "-GHC40 a week" and make the sheet
   * worthless.
   */
  const down = Math.min(goods, Math.max(0, Number(downPayment) || 0));
  const balance = Number((goods - down).toFixed(2));
  const term = Math.max(1, Math.min(60, Math.round(Number(months) || 0) || 1));

  const options = Object.keys(PERIODS).map((key) => {
    const periods = PERIODS[key](term);
    const amount = Number((balance / periods).toFixed(2));
    return {
      key,
      ...LABELS[key],
      periods,
      amount,
      /**
       * 833.33 a month comes to 2,499.99 over three months, not 2,500. A
       * customer who adds the figures up deserves to have been told it is
       * approximate rather than to think the shop cannot count. Compared on
       * the rounded figure, which is the one actually printed.
       */
      approx: Math.abs(amount * periods - balance) > 0.005,
      total: Number((amount * periods).toFixed(2)),
    };
  });

  return { down, balance, months: term, options };
};

module.exports = { breakdown, PERIODS };
