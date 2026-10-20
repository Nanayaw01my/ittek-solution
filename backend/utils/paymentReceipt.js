/**
 * Telling the customer their payment landed.
 *
 * Somebody pays off part of a debt, a layaway or a credit agreement at the
 * counter and walks away with a slip of paper, or with nothing at all if the
 * printer is out. The shop's record
 * is updated; the customer's record is their memory. That gap is where
 * "I paid you last month" arguments come from, and the shop has no answer
 * that is not its own word against theirs.
 *
 * A text closes it. It costs one credit, it arrives on the phone the debt
 * was recorded against, and it states the amount, what is left, and the
 * receipt number — so the next conversation starts from the same figures.
 *
 * The same care as the chaser: it never throws at the caller, it is skipped
 * for anybody who asked not to be messaged, and a failure to text must never
 * fail the payment. The money was taken. The text is a courtesy on top.
 */

const Settings = require('../models/Settings');
const Contact = require('../models/Contact');
const { sendSms } = require('./arkesel');
const { normaliseGhanaPhone } = require('./phone');

/** Cedis as a customer reads them, without the symbol costing two characters. */
const money = (n) => `GHC${(Number(n) || 0).toFixed(2)}`;

/**
 * What the customer reads.
 *
 * Written to fit one message — 160 characters is one credit, and a receipt
 * that silently costs three is a receipt the shop stops sending. The shop
 * name is dropped before anything that carries meaning if the figures and
 * the name make it long, because the sender ID beside the text already says
 * who it is from.
 *
 * Exported on its own so the words can be tested without sending anything.
 */
const composeReceiptSms = ({ company, name, amount, remaining, receiptNo, settledNote }) => {
  const first = String(name || '').trim().split(/\s+/)[0] || 'Customer';
  const settled = Number(remaining) <= 0.004;

  // What "nothing left to pay" means differs by plan. A layaway customer
  // has goods waiting for them and should be told to come for them; a debt
  // is simply finished.
  const done = settledNote || 'Your balance is now cleared. Thank you.';

  const core = settled
    ? `Hi ${first}, we received ${money(amount)}. ${done}`
    : `Hi ${first}, we received ${money(amount)}. Balance left: ${money(remaining)}.`;

  const parts = [core];
  if (receiptNo) parts.push(`Ref ${receiptNo}.`);

  const withShop = company ? `${parts.join(' ')} ${String(company).trim()}` : parts.join(' ');
  // One credit if it fits; the shop name is the first thing to go, never a
  // figure.
  return withShop.length <= 160 ? withShop : parts.join(' ');
};

/**
 * Text the debtor that their payment was received.
 *
 * Returns {sent, reason} rather than throwing — every caller is in the
 * middle of recording money, and nothing here is worth losing that over.
 */
const sendPaymentReceipt = async ({ name, phone, amount, remaining, receiptNo, settledNote }) => {
  try {
    const number = normaliseGhanaPhone(phone);
    if (!number) return { sent: false, reason: 'no usable phone number on the debt' };

    const settings = await Settings.findOne()
      .select('+sms_config.api_key sms_config.sender_id sms_config.enabled '
        + 'sms_config.payment_receipts company_name')
      .lean();

    const sms = settings?.sms_config || {};
    // Off by explicit choice, not by accident: undefined means on, because
    // a shop that has set texting up wants its receipts.
    if (sms.payment_receipts === false) return { sent: false, reason: 'payment texts are switched off' };
    if (sms.enabled === false) return { sent: false, reason: 'texting is switched off' };

    const apiKey = sms.api_key || process.env.ARKESEL_API_KEY || '';
    const sender = sms.sender_id || process.env.ARKESEL_SENDER_ID || '';
    if (!apiKey || !sender) return { sent: false, reason: 'no Arkesel key or sender ID' };

    // Somebody who asked not to be messaged is not messaged, whatever the
    // message is for.
    const optedOut = await Contact.findOne({ phone: number, do_not_contact: true })
      .select('_id').lean().catch(() => null);
    if (optedOut) return { sent: false, reason: 'this customer asked not to be messaged' };

    const message = composeReceiptSms({
      company: settings?.company_name,
      name,
      amount,
      remaining,
      receiptNo,
      settledNote,
    });

    const result = await sendSms({ apiKey, sender, to: number, message });
    if (!result.ok) return { sent: false, reason: result.message };

    return { sent: true, to: number, credits: result.credits, message };
  } catch (err) {
    // The payment is already recorded by the time this runs. A fault here is
    // worth knowing about and not worth undoing money over.
    console.error('[PaymentReceipt] could not text the customer:', err.message);
    return { sent: false, reason: err.message };
  }
};

/**
 * Write down whether the customer was told, without that ever mattering.
 *
 * This runs after money has been taken and saved. Anything it does must be
 * incapable of failing the payment — including a model that turns out not
 * to have the method, which throws where it stands rather than returning a
 * promise to catch. So: try/catch around the lot, and a log.
 *
 * @param {Object} Model   the mongoose model holding the payment
 * @param {Object} filter  which document and which payment
 * @param {Object} texted  the result from sendPaymentReceipt
 */
const recordSend = async (Model, filter, texted) => {
  try {
    await Model.updateOne(filter, {
      $set: {
        'payments.$.sms_sent': !!texted?.sent,
        'payments.$.sms_error': texted?.sent ? undefined : String(texted?.reason || ''),
      },
    });
  } catch (err) {
    console.error('[PaymentReceipt] could not record the text:', err.message);
  }
};

module.exports = { sendPaymentReceipt, composeReceiptSms, recordSend, money };
