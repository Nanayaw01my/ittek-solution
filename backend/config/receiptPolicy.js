/**
 * What the receipt says about returns.
 *
 * The shop's rule, in the shop's words: goods sold are not returnable,
 * and a refund is something the shop may grant rather than something a
 * customer is owed. The slip said the opposite of this — "Returns are
 * accepted subject to our terms and conditions" — on every sale since
 * the till was built, which is a promise the shop never made.
 *
 * One string, used by the printed slip, the PDF and the link sent to
 * the customer's phone, so the three cannot drift apart and quote the
 * customer three different policies. It is a setting rather than a
 * constant because the wording is the shop's business, not the
 * software's, and changing it should not need a deployment.
 */
const DEFAULT_RETURNS_POLICY =
  'GOODS SOLD ARE NOT RETURNABLE. Some items may be refunded under our '
  + 'returns policy — please ask in store. Keep this receipt as proof of purchase.';

module.exports = { DEFAULT_RETURNS_POLICY };
