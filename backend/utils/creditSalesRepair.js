const CreditAgreement = require('../models/CreditAgreement');
const Sale = require('../models/Sale');

/**
 * Credit agreement money that never reached the sales book.
 *
 * Until f5c177b..699e623, recording a payment against an agreement wrote
 * it onto the agreement and nowhere else. The day's takings are the sum
 * of that day's Sale rows, so every one of those payments is missing from
 * the figures for the day it was taken — the cash went in the drawer with
 * nothing to say how it got there.
 *
 * The fix stops it happening again; it does nothing about what is already
 * missing. This finds those payments and can write the rows that should
 * have been written at the time, dated to the day the money actually
 * changed hands rather than to the day somebody noticed.
 *
 * Two safeguards, because this writes money into the shop's figures:
 *
 * It is idempotent. An instalment that has a sale row carries its id in
 * `sale_ref` and is skipped. A deposit has no subdocument to mark, so it
 * is matched by the invoice number the row would have — and `invoice_no`
 * is uniquely indexed, so even a race cannot double-count one.
 *
 * And it reports before it writes. `findMissing` only reads, so the shop
 * can see exactly which payments are involved and what the day's takings
 * would become, and decide, rather than being handed a changed total.
 */

/** The invoice number a given payment's sale row would carry. */
const invoiceFor = (agreement, kind, paymentId, at) => {
  const d = at ? new Date(at) : new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const tail = kind === 'deposit' ? 'DEP' : String(paymentId || '').slice(-4).toUpperCase();
  return `CRD-${datePart}-${String(agreement._id).slice(-4).toUpperCase()}-${tail}`;
};

/**
 * Every credit payment with no sale row behind it.
 *
 * @param {Object} [opts]
 * @param {Date} [opts.since] - only payments taken on or after this moment
 * @returns {Promise<Array>} one entry per missing payment, newest first
 */
const findMissing = async ({ since } = {}) => {
  const agreements = await CreditAgreement.find({}).lean();
  const missing = [];

  // Which deposit rows already exist, in one query rather than one per
  // agreement — a shop with a few hundred agreements would otherwise make
  // a few hundred round trips to answer a question nobody asked for.
  const depositInvoices = new Set(
    (await Sale.find({ credit_ref: { $ne: null } }).select('invoice_no').lean())
      .map((s) => s.invoice_no)
  );

  for (const a of agreements) {
    const after = (d) => !since || new Date(d) >= new Date(since);

    const deposit = Number(a.down_payment) || 0;
    const depositAt = a.start_date || a.createdAt;
    if (deposit > 0 && after(depositAt)
        && !depositInvoices.has(invoiceFor(a, 'deposit', null, depositAt))) {
      missing.push({
        key: `${a._id}:deposit`,
        agreement_id: String(a._id),
        customer_name: a.customer_name,
        kind: 'deposit',
        amount: deposit,
        paid_at: depositAt,
        payment_method: 'cash',
      });
    }

    for (const p of a.payments || []) {
      if (p.sale_ref) continue;
      const at = p.payment_date || a.createdAt;
      if (!after(at)) continue;
      const amount = Number(p.amount) || 0;
      // A payment that is not a real figure is not money, and must never
      // become a sale row: one NaN makes a whole day's takings NaN.
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (depositInvoices.has(invoiceFor(a, 'instalment', p._id, at))) continue;
      missing.push({
        key: `${a._id}:${p._id}`,
        agreement_id: String(a._id),
        payment_id: String(p._id),
        customer_name: a.customer_name,
        kind: 'instalment',
        amount,
        paid_at: at,
        payment_method: p.payment_method || 'cash',
      });
    }
  }

  missing.sort((x, y) => new Date(y.paid_at) - new Date(x.paid_at));
  return missing;
};

/**
 * Write the missing rows.
 *
 * @param {Object} opts
 * @param {Date} [opts.since] - as findMissing
 * @param {string[]} [opts.keys] - only these entries, by `key`
 * @param {Object} opts.user - who is doing the repair; the rows are
 *   attributed to them, because somebody has to own a figure and the
 *   person who collected the cash weeks ago is not necessarily reachable
 * @returns {Promise<{repaired: Array, failed: Array, total: number}>}
 */
const repairMissing = async ({ since, keys, user }) => {
  const wanted = Array.isArray(keys) && keys.length ? new Set(keys) : null;
  const candidates = (await findMissing({ since }))
    .filter((m) => !wanted || wanted.has(m.key));

  const repaired = [];
  const failed = [];

  for (const m of candidates) {
    try {
      const at = new Date(m.paid_at);
      const sale = await Sale.create({
        invoice_no: invoiceFor(
          { _id: m.agreement_id }, m.kind, m.payment_id, at),
        user_id: user._id,
        customer_name: m.customer_name,
        credit_ref: m.agreement_id,
        subtotal: m.amount,
        discount: 0,
        total_amount: m.amount,
        cart_total: m.amount,
        debt_amount: 0,
        payment_status: 'debt_payment',
        payment_method: m.payment_method || 'cash',
        sale_date: at,
        items: [],
      });

      // Mark the instalment, so a second run skips it even if the invoice
      // check above ever changes shape.
      if (m.kind === 'instalment') {
        await CreditAgreement.updateOne(
          { _id: m.agreement_id, 'payments._id': m.payment_id },
          { $set: { 'payments.$.sale_ref': sale._id } }
        );
      }

      repaired.push({ ...m, invoice_no: sale.invoice_no });
    } catch (err) {
      // A duplicate invoice means the row was already there: the unique
      // index doing its job, not a failure worth alarming anybody about.
      failed.push({ ...m, reason: err.code === 11000 ? 'already recorded' : err.message });
    }
  }

  return { repaired, failed, total: candidates.length };
};

module.exports = { findMissing, repairMissing, invoiceFor };
