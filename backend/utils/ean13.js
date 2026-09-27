/**
 * Drawing an EAN-13 barcode.
 *
 * There is no barcode library in this project, and a barcode is not a font —
 * it is a specific pattern of bars a scanner's optics expect. Getting it
 * slightly wrong produces something that looks like a barcode and scans as
 * nothing, which is worse than printing no barcode at all, so the patterns
 * below are the published ones and the tests decode them back.
 *
 * A symbol is 95 modules: a guard, six digits on the left at seven modules
 * each, a centre guard, six on the right, a guard. The thirteenth digit is
 * never drawn — it is carried by the *parity* chosen for the left-hand six,
 * which is why the table below exists.
 */

const L = ['0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'];

// R is L inverted; G is R reversed. Written out rather than derived so a
// mistake shows up as a wrong constant instead of a wrong transformation.
const R = ['1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'];

const G = ['0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'];

/** Which of the left-hand six are L and which are G, per the first digit. */
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

const checkDigit = (twelve) => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
};

/**
 * The code as a drawable EAN-13, or null when it is not one.
 *
 * A 12-digit UPC-A is an EAN-13 with a leading zero, so it is accepted. A
 * code of any other length, or with a wrong check digit, returns null: the
 * caller prints the number as text rather than drawing bars that no scanner
 * would read.
 */
const normalise = (raw) => {
  const s = String(raw || '').replace(/\s/g, '');
  if (!/^\d+$/.test(s)) return null;
  const thirteen = s.length === 12 ? `0${s}` : s;
  if (thirteen.length !== 13) return null;
  if (checkDigit(thirteen.slice(0, 12)) !== thirteen[12]) return null;
  return thirteen;
};

/**
 * The 95 modules as a string of '0' and '1'. '1' is a bar, '0' is a space.
 */
const modules = (raw) => {
  const code = normalise(raw);
  if (!code) return null;

  const digits = code.split('').map(Number);
  const parity = PARITY[digits[0]];

  let bits = '101';                                    // start guard
  for (let i = 0; i < 6; i++) {
    bits += (parity[i] === 'L' ? L : G)[digits[i + 1]];
  }
  bits += '01010';                                     // centre guard
  for (let i = 0; i < 6; i++) bits += R[digits[i + 7]];
  bits += '101';                                       // end guard
  return bits;
};

module.exports = { modules, normalise, checkDigit, L, G, R, PARITY };
