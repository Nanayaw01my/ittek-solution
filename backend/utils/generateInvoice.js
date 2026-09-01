const Sale = require('../models/Sale');

/**
 * The next invoice number for today, in the form INV-YYYYMMDD-XXXX.
 *
 * Derived from the HIGHEST number already issued today, not from a count of
 * today's sales. Counting was wrong in a way that broke the till outright:
 * delete a sale — which the Delete Records screen exists to do — and the count
 * drops below the highest number issued, so the next sale regenerates a number
 * that is already taken. `invoice_no` is a unique index, so that sale fails
 * with a duplicate key error, and so does every attempt after it. The till
 * stops taking money until someone works out why.
 *
 * It also could not survive two tills selling at the same moment, since both
 * counted the same total before either had written.
 *
 * The sequence is zero-padded to four digits, so ordering the strings orders
 * the numbers. Past 9999 in a day the padding grows and lexical order would
 * drift from numeric order, so the tail is parsed and compared as a number.
 */
const nextInvoiceNo = async (datePart) => {
  const todays = await Sale.find({ invoice_no: { $regex: `^INV-${datePart}-` } })
    .select('invoice_no')
    .sort({ invoice_no: -1 })
    .limit(50)
    .lean();

  const highest = todays.reduce((max, s) => {
    const n = parseInt(String(s.invoice_no).split('-').pop(), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `INV-${datePart}-${String(highest + 1).padStart(4, '0')}`;
};

const todayPart = () => {
  const now = new Date();
  return `${now.getFullYear()}`
    + `${String(now.getMonth() + 1).padStart(2, '0')}`
    + `${String(now.getDate()).padStart(2, '0')}`;
};

const generateInvoiceNo = async () => nextInvoiceNo(todayPart());

/**
 * Write a sale, taking the next free invoice number.
 *
 * Retries on a duplicate invoice number rather than failing the sale. Two
 * tills can read the same highest number before either has written, and the
 * loser of that race must not lose the sale — it simply takes the next number.
 * Any other error is a real problem and is passed straight up.
 *
 * @param {Object} data - the sale document, without invoice_no
 * @param {number} attempts - how many numbers to try before giving up
 */
const createSaleWithInvoice = async (data, attempts = 8) => {
  const datePart = todayPart();

  for (let i = 0; i < attempts; i++) {
    const invoice_no = await nextInvoiceNo(datePart);
    try {
      return await Sale.create({ ...data, invoice_no });
    } catch (err) {
      const isDuplicateInvoice = err?.code === 11000
        && JSON.stringify(err?.keyPattern || err?.keyValue || {}).includes('invoice_no');
      if (!isDuplicateInvoice || i === attempts - 1) throw err;
      // Someone else took that number between the read and the write. Round
      // again — nextInvoiceNo will now see theirs.
    }
  }

  throw new Error('Could not allocate an invoice number.');
};

module.exports = { generateInvoiceNo, createSaleWithInvoice };
