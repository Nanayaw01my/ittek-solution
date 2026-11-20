/**
 * What the receipt says about returns — the browser's copy of
 * backend/config/receiptPolicy.js.
 *
 * Kept in step by backend/tests/receiptPolicy.test.js, which reads both
 * files and compares them. Three surfaces print this — the thermal
 * slip, the PDF and the link the customer opens on their phone — and a
 * shop must not quote a customer three different policies.
 */
export const DEFAULT_RETURNS_POLICY =
  'GOODS SOLD ARE NOT RETURNABLE. Some items may be refunded under our '
  + 'returns policy — please ask in store. Keep this receipt as proof of purchase.'

/** The shop's wording if it has set one, otherwise the standard. */
export const returnsPolicy = (settings) =>
  (settings?.receipt_policy || '').trim() || DEFAULT_RETURNS_POLICY
