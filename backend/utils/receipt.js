const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * Random, unguessable token used in public receipt URLs.
 * The sale's ObjectId is deliberately NOT used — ObjectIds are sequential-ish
 * and easy to enumerate, which would expose other customers' receipts.
 */
const generateReceiptToken = () => crypto.randomBytes(16).toString('hex');

/** Public base URL of the app (where the React receipt page is served from). */
const getPublicBaseUrl = () =>
  (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://ittek-solution.vercel.app').replace(/\/+$/, '');

/** Public, login-free URL for a receipt. */
const buildReceiptUrl = (token) => `${getPublicBaseUrl()}/r/${token}`;

/**
 * Render a receipt URL as a QR code.
 * @returns {Promise<string|null>} PNG data URL, or null if generation failed
 */
const generateReceiptQr = async (url) => {
  if (!url) return null;
  try {
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  } catch (err) {
    console.error('QR generation error:', err.message);
    return null;
  }
};

/** Same QR, as a raw PNG buffer (for embedding into the PDF receipt). */
const generateReceiptQrBuffer = async (url) => {
  if (!url) return null;
  try {
    return await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', margin: 1, width: 240, type: 'png' });
  } catch (err) {
    console.error('QR buffer generation error:', err.message);
    return null;
  }
};

/**
 * Attach receipt_url + qr_code to a sale payload being returned to the POS.
 * Backfills receipt_token on older sales that predate this feature.
 * @param {import('mongoose').Document} saleDoc - a Sale mongoose document
 * @returns {Promise<Object>} plain object safe to send to the till
 */
const withReceiptQr = async (saleDoc) => {
  if (!saleDoc) return saleDoc;

  let token = saleDoc.receipt_token;
  if (!token) {
    token = generateReceiptToken();
    saleDoc.receipt_token = token;
    await saleDoc.save();
  }

  const receipt_url = buildReceiptUrl(token);
  const obj = typeof saleDoc.toObject === 'function' ? saleDoc.toObject() : { ...saleDoc };
  return { ...obj, receipt_url, qr_code: await generateReceiptQr(receipt_url) };
};

module.exports = {
  generateReceiptToken,
  getPublicBaseUrl,
  buildReceiptUrl,
  generateReceiptQr,
  generateReceiptQrBuffer,
  withReceiptQr,
};
