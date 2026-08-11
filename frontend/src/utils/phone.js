/**
 * Ghana phone helpers (mirror of backend/utils/phone.js).
 *
 * Staff type numbers however they remember them — 0598565277,
 * +233 59 856 5277, 233598565277, 059-856-5277 — and they all mean the same
 * subscriber. Everything is normalised to the wa.me form: 233XXXXXXXXX.
 */

const VALID_PREFIXES = [
  '20', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '50', '53', '54', '55', '56', '57', '59',
]

export const normaliseGhanaPhone = (raw) => {
  if (!raw || typeof raw !== 'string') return null

  let digits = raw.replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('00233')) digits = digits.slice(2)

  let national
  if (digits.startsWith('233') && digits.length === 12) {
    national = digits.slice(3)
  } else if (digits.startsWith('0') && digits.length === 10) {
    national = digits.slice(1)
  } else if (digits.length === 9) {
    national = digits
  } else {
    return null
  }

  if (national.length !== 9) return null
  if (!VALID_PREFIXES.includes(national.slice(0, 2))) return null

  return `233${national}`
}

export const isValidGhanaPhone = (raw) => normaliseGhanaPhone(raw) !== null

/**
 * Rough "is this a phone/tablet" check.
 * Only used to pick which WhatsApp surface to open — never for anything
 * where being wrong would break the flow.
 */
const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent)
}

/**
 * Build the WhatsApp deep link for a receipt.
 *
 * Note: no deep link can auto-send — WhatsApp only lets us pre-fill the
 * message, the staff member still taps send. That is a WhatsApp restriction,
 * not something we can work around without the paid Business Cloud API.
 *
 * On phones we use wa.me, which opens the app straight on the chat. On desktop
 * wa.me shows an "Open app / Continue to WhatsApp Web" landing page first, so
 * we skip it by going directly to WhatsApp Web.
 *
 * Returns null when the number isn't a usable Ghana number — callers should
 * disable the button rather than open a broken chat.
 */
export const buildWhatsAppReceiptLink = ({ phone, invoiceNo, total, receiptUrl, companyName }) => {
  const msisdn = normaliseGhanaPhone(phone)
  if (!msisdn) return null

  const amount = `GH₵${Number(total || 0).toFixed(2)}`
  const lines = [
    `Thank you for shopping with ${companyName || 'DAN & DOR SOLAR COMPANY LIMITED'}!`,
    '',
    `Invoice: ${invoiceNo}`,
    `Total: ${amount}`,
  ]
  if (receiptUrl) {
    lines.push('', `View your receipt online: ${receiptUrl}`)
  }

  const text = encodeURIComponent(lines.join('\n'))

  return isMobileDevice()
    ? `https://wa.me/${msisdn}?text=${text}`
    : `https://web.whatsapp.com/send?phone=${msisdn}&text=${text}`
}
