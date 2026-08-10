/**
 * Ghana phone number helpers.
 *
 * Staff type numbers in whatever shape they remember them:
 *   0598565277, +233 59 856 5277, 233598565277, 059-856-5277, (059) 856 5277
 * All of those are the same subscriber. normaliseGhanaPhone() reduces them to
 * the wa.me / MSISDN form: 233XXXXXXXXX (12 digits, no plus, no spaces).
 */

// Ghana mobile network prefixes (the 2 digits after the leading 0 / 233)
const VALID_PREFIXES = [
  '20', '23', '24', '25', '26', '27', '28', '29', // MTN / AirtelTigo / Vodafone-Telecel ranges
  '30', // Accra landline range — still dialable, kept for completeness
  '31', '32', '50', '53', '54', '55', '56', '57', '59',
];

/**
 * Normalise any Ghanaian number to 233XXXXXXXXX.
 * @param {string} raw
 * @returns {string|null} normalised number, or null when it is not a valid GH number
 */
const normaliseGhanaPhone = (raw) => {
  if (!raw || typeof raw !== 'string') return null;

  // Strip everything that is not a digit (spaces, dashes, dots, brackets, the +)
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // 00233... international prefix
  if (digits.startsWith('00233')) digits = digits.slice(2);

  let national; // the 9 significant digits, e.g. 598565277

  if (digits.startsWith('233') && digits.length === 12) {
    national = digits.slice(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1);
  } else if (digits.length === 9) {
    // Typed without the leading zero, e.g. 598565277
    national = digits;
  } else {
    return null;
  }

  if (national.length !== 9) return null;
  if (!VALID_PREFIXES.includes(national.slice(0, 2))) return null;

  return `233${national}`;
};

/** True when the number can be turned into a valid wa.me target. */
const isValidGhanaPhone = (raw) => normaliseGhanaPhone(raw) !== null;

module.exports = { normaliseGhanaPhone, isValidGhanaPhone };
