/**
 * EAN-13 bars, in the browser.
 *
 * A deliberate second copy of backend/utils/ean13.js rather than a shared
 * module: the backend is CommonJS and draws into a PDF, this runs in the page
 * and draws into an SVG, and there is no build step joining the two. The
 * patterns are the published ones, so the two copies cannot disagree about
 * anything that matters — a wrong constant here would show up as a barcode
 * that will not scan, which the tests catch.
 *
 * A symbol is 95 modules: a guard, six digits on the left at seven modules
 * each, a centre guard, six on the right, a guard. The thirteenth digit is
 * never drawn — the parity chosen for the left-hand six carries it.
 */

const L = ['0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011']

const R = ['1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100']

const G = ['0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111']

/** Which of the left-hand six are L and which are G, per the first digit. */
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
]

export const checkDigit = (twelve) => {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3)
  return String((10 - (sum % 10)) % 10)
}

/**
 * The code's 95 modules as a string of '0' and '1', or null when the code is
 * not a valid EAN-13.
 *
 * Refusing an invalid code rather than drawing it is the point: a scanner
 * computes the check digit itself and stays silent when it disagrees, so a
 * wrong code looks exactly like a broken scanner to whoever is holding it.
 */
export const modules = (code) => {
  const s = String(code || '').trim()
  if (!/^\d{13}$/.test(s)) return null
  if (checkDigit(s.slice(0, 12)) !== s[12]) return null

  const parity = PARITY[Number(s[0])]
  let bits = '101'
  for (let i = 0; i < 6; i++) {
    const d = Number(s[i + 1])
    bits += parity[i] === 'L' ? L[d] : G[d]
  }
  bits += '01010'
  for (let i = 7; i < 13; i++) bits += R[Number(s[i])]
  bits += '101'
  return bits
}

/**
 * The runs of bars, as {start, width} in modules.
 *
 * Returned as runs rather than 95 separate rectangles so a thermal printer is
 * given one solid bar where there is one bar. Drawing 95 abutting rectangles
 * leaves hairline gaps at some zoom levels, and a scanner reads those gaps.
 */
export const bars = (bitString) => {
  const out = []
  let run = 0
  for (let i = 0; i <= bitString.length; i++) {
    if (bitString[i] === '1') { run += 1; continue }
    if (run > 0) out.push({ start: i - run, width: run })
    run = 0
  }
  return out
}

/** Whether a guard bar at this position runs longer, as printed codes do. */
export const isGuard = (start, width) => {
  const end = start + width
  return start < 3 || (start > 45 && end < 51) || end > 92
}
