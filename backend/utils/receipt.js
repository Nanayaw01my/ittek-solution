const crypto = require('crypto');
const QRCode = require('qrcode');

/**
 * Random, unguessable token used in public receipt URLs.
 * The sale's ObjectId is deliberately NOT used — ObjectIds are sequential-ish
 * and easy to enumerate, which would expose other customers' receipts.
 */
const generateReceiptToken = () => crypto.randomBytes(16).toString('hex');

/**
 * Public base URL of the app (where the React receipt page is served from).
 *
 * Prefers explicit config, then falls back to the host the request actually
 * arrived on — so QR codes point at whatever domain the app is deployed under
 * (Render, Vercel, a custom domain) without needing a code change.
 */
const getPublicBaseUrl = (req) => {
  const configured = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const host = req?.get?.('host');
  if (host) {
    const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    return `${proto}://${host}`;
  }

  return 'https://ittek-solution.vercel.app';
};

/** Public, login-free URL for a receipt. */
const buildReceiptUrl = (token, req) => `${getPublicBaseUrl(req)}/r/${token}`;

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
 * Attach the public receipt_url to a sale payload being returned to the POS.
 * Backfills receipt_token on older sales that predate this feature.
 *
 * It used to attach a rendered QR code as well — a 240px PNG as a base64
 * data URL, a few kilobytes on every sale, over the shop's mobile data.
 * The slip no longer prints one, so nothing was left to show it: the link
 * goes to the customer over WhatsApp, where it is tappable. The URL is
 * still here, and the PDF receipt still draws its own QR from it, because
 * an A4 page has room to spare and no roll to waste.
 *
 * @param {import('mongoose').Document} saleDoc - a Sale mongoose document
 * @param {Object} [req] - Express request, used to derive the public host
 * @returns {Promise<Object>} plain object safe to send to the till
 */
const withReceiptLink = async (saleDoc, req) => {
  if (!saleDoc) return saleDoc;

  let token = saleDoc.receipt_token;
  if (!token) {
    token = generateReceiptToken();
    saleDoc.receipt_token = token;
    await saleDoc.save();
  }

  const receipt_url = buildReceiptUrl(token, req);
  const obj = typeof saleDoc.toObject === 'function' ? saleDoc.toObject() : { ...saleDoc };
  return { ...obj, receipt_url };
};

module.exports = {
  generateReceiptToken,
  getPublicBaseUrl,
  buildReceiptUrl,
  generateReceiptQr,
  generateReceiptQrBuffer,
  withReceiptLink,
};
