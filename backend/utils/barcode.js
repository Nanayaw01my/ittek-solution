/**
 * Barcodes for products the shop did not buy pre-labelled.
 *
 * A panel from a supplier arrives with a barcode printed on it. A bundle the
 * shop makes up, or an item whose label has rubbed off, has none — and
 * without one it cannot be scanned at the till.
 *
 * Generated codes are EAN-13 with a correct check digit, not just thirteen
 * random digits: a scanner computes that digit and refuses the code if it
 * does not match, so an invalid one would type nothing and look like a broken
 * scanner. They start with 2, which GS1 reserves for in-store use — meaning a
 * code minted here can never collide with a real product's barcode from a
 * manufacturer.
 */

/** The thirteenth digit, worked out from the first twelve. */
const checkDigit = (twelve) => {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
};

/** True when a full 13-digit code carries the right check digit. */
const isValidEan13 = (code) => {
  const s = String(code || '').trim();
  if (!/^\d{13}$/.test(s)) return false;
  return checkDigit(s.slice(0, 12)) === s[12];
};

/** One candidate: 2, eleven random digits, then the check digit. */
const mintEan13 = () => {
  let body = '2';
  for (let i = 0; i < 11; i++) body += Math.floor(Math.random() * 10);
  return body + checkDigit(body);
};

/**
 * A code no product is using yet.
 *
 * Random rather than sequential on purpose: two people adding products at the
 * same moment would both read the same "highest so far" and mint the same
 * number. The database's unique index is still the last word — this only
 * avoids handing out a code that is already visibly taken.
 */
const nextFreeBarcode = async (Product, attempts = 12) => {
  for (let i = 0; i < attempts; i++) {
    const candidate = mintEan13();
    const taken = await Product.findOne({
      $or: [{ barcode: candidate }, { 'variants.barcode': candidate }],
    }).select('_id').lean();
    if (!taken) return candidate;
  }
  return null;
};

/**
 * A barcode for a receipt, so a return can be scanned instead of typed.
 *
 * Starts with 9, where a product's starts with 2. That one digit is what
 * keeps the two apart: without it a receipt code could be minted that matches
 * a product's, and a scan at the refund screen would have no way to know
 * which was meant. It also means the prefix alone says what was scanned.
 *
 * The rest is random for the same reason product codes are — two tills
 * closing a sale in the same second must not mint the same number. The unique
 * index is still the last word.
 */
const mintReceiptBarcode = () => {
  let body = '9';
  for (let i = 0; i < 11; i++) body += Math.floor(Math.random() * 10);
  return body + checkDigit(body);
};

/** True for a code minted for a receipt rather than a product. */
const isReceiptBarcode = (code) => isValidEan13(code) && String(code)[0] === '9';

/**
 * A receipt code no sale is using yet.
 *
 * Returns null after enough failures rather than looping for ever: a sale
 * must never be held up by barcode minting, and a receipt with no barcode
 * still prints and can still be refunded by its invoice number.
 */
const nextFreeReceiptBarcode = async (Sale, attempts = 12) => {
  for (let i = 0; i < attempts; i++) {
    const candidate = mintReceiptBarcode();
    const taken = await Sale.findOne({ receipt_barcode: candidate }).select('_id').lean();
    if (!taken) return candidate;
  }
  return null;
};

module.exports = {
  checkDigit, isValidEan13, mintEan13, nextFreeBarcode,
  mintReceiptBarcode, isReceiptBarcode, nextFreeReceiptBarcode,
};
