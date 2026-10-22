/**
 * The spend-and-get-a-gift promotion, as rules rather than as screen code.
 *
 * A till cannot rely on staff to remember a promotion: people change, the
 * threshold moves, and a customer who should have been given something
 * walks out without it — which costs the shop the goodwill it paid for by
 * running the promotion at all.
 *
 * Kept here, and kept pure, because these are the decisions worth being
 * able to read back out of a test: who qualifies, what is recorded, and
 * what comes off the shelf.
 */

/**
 * Does this sale qualify?
 *
 * Judged on what the customer actually pays, after any discount — a cart of
 * GHC3,100 marked down to GHC2,800 is a GHC2,800 sale, and treating it as
 * qualifying would have the shop giving gifts away against takings it never
 * had.
 */
const qualifies = (total, promo = {}) => {
  if (!promo || !promo.enabled) return false;
  const threshold = Number(promo.threshold) || 0;
  if (threshold <= 0) return false;
  return (Number(total) || 0) >= threshold;
};

/**
 * What the till said about the gift, cleaned up for storage.
 *
 * Trusted only for the answer — given or not, and what it was called. The
 * threshold is kept as it stood on the day, because a promotion gets
 * changed and last month's sales must still read correctly against the rule
 * that applied when they were made.
 */
const giftFor = (g) => {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return undefined;
  return {
    given: !!g.given,
    name: String(g.name || '').trim() || undefined,
    product_id: g.product_id || undefined,
    threshold: Number(g.threshold) || undefined,
  };
};

/**
 * What a gift takes off the shelf.
 *
 * Only a gift that was actually given, and only one the shop named a
 * product for. A crate of branded flasks that was never counted as stock
 * has nothing to deduct, and inventing a deduction for it puts the count
 * wrong the other way.
 */
const giftStockLines = (gift) => (
  gift && gift.given && gift.product_id
    ? [{ product_id: gift.product_id, quantity: 1 }]
    : []
);

module.exports = { qualifies, giftFor, giftStockLines };
