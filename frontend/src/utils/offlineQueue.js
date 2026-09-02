const QUEUE_KEY = 'ittek_offline_sales_queue'
const PRODUCTS_KEY = 'ittek_products_cache'
const CACHE_TIME_KEY = 'ittek_products_cache_time'
/**
 * The catalogue is kept until it is replaced, not until it expires.
 *
 * It used to be thrown away after 24 hours, which meant a shop whose internet
 * had been down for a day opened the till to an empty product list — exactly
 * the moment the offline copy is worth having. Stale prices can be seen and
 * judged; no products at all cannot be worked around.
 *
 * The age is shown on the sync button instead, so staff know how old the
 * figures are and can refresh them the moment there is a signal.
 */

export const saveProductsCache = (products) => {
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products))
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString())
    return true
  } catch {
    // Almost always the ~5MB quota. The queued sales matter more than the
    // catalogue — they are money that has not reached the server yet — so
    // drop the catalogue rather than let a half-written one sit there.
    try { localStorage.removeItem(PRODUCTS_KEY) } catch {}
    return false
  }
}

export const getCachedProducts = () => {
  try {
    const cached = localStorage.getItem(PRODUCTS_KEY)
    return cached ? JSON.parse(cached) : null
  } catch { return null }
}

/** When the catalogue was last downloaded, or null if it never has been. */
export const getProductsCacheTime = () => {
  try {
    const t = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0')
    return t > 0 ? t : null
  } catch { return null }
}

export const queueSale = (type, payload) => {
  try {
    const queue = getPendingQueue()
    const entry = {
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type,
      payload,
      timestamp: Date.now(),
    }
    queue.push(entry)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    return entry.id
  } catch { return null }
}

export const getPendingQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch { return [] }
}

export const removeSaleFromQueue = (id) => {
  try {
    const queue = getPendingQueue().filter(s => s.id !== id)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {}
}

export const clearPendingQueue = () => {
  try { localStorage.removeItem(QUEUE_KEY) } catch {}
}

export const clearAllOfflineData = () => {
  try {
    localStorage.removeItem(QUEUE_KEY)
    localStorage.removeItem(PRODUCTS_KEY)
    localStorage.removeItem(CACHE_TIME_KEY)
    localStorage.removeItem('ittek_settings_cache')
    localStorage.removeItem('ittek_local_holds')
    localStorage.removeItem('ittek_logo_data_url')
    localStorage.removeItem('ittek_logo_source_url')
  } catch {}
}

export const getPendingCount = () => getPendingQueue().length

// ─── Settings cache ──────────────────────────────────────────────────────────
// The receipt needs the shop name, address, phone and logo. Offline those come
// from here instead of the server, so a queued sale still prints properly.

const SETTINGS_KEY = 'ittek_settings_cache'

export const saveSettingsCache = (settings) => {
  try {
    if (settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}

export const getCachedSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
  } catch { return null }
}

// ─── Local held sales ────────────────────────────────────────────────────────
// Holds are normally server-side so any till can resume them. Offline they are
// kept here and marked `local: true`; they stay on this device until it is back
// online, which is the honest behaviour — another till genuinely cannot see a
// cart parked on a machine with no connection.

const LOCAL_HOLDS_KEY = 'ittek_local_holds'

export const getLocalHolds = () => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_HOLDS_KEY) || '[]')
  } catch { return [] }
}

export const saveLocalHold = (hold) => {
  try {
    const holds = getLocalHolds()
    const entry = {
      ...hold,
      _id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      reference: `HOLD-L${String(Date.now()).slice(-5)}`,
      local: true,
      createdAt: new Date().toISOString(),
    }
    holds.push(entry)
    localStorage.setItem(LOCAL_HOLDS_KEY, JSON.stringify(holds))
    return entry
  } catch { return null }
}

export const removeLocalHold = (id) => {
  try {
    localStorage.setItem(LOCAL_HOLDS_KEY, JSON.stringify(getLocalHolds().filter(h => h._id !== id)))
  } catch {}
}

// ─── Logo cache ──────────────────────────────────────────────────────────────
// The logo lives on Cloudinary, so offline the <img> simply fails and the
// receipt shows its alt text. Cache the actual bytes as a data URL while we
// still have a connection.

const LOGO_KEY = 'ittek_logo_data_url'
const LOGO_SRC_KEY = 'ittek_logo_source_url'

export const getCachedLogo = () => {
  try { return localStorage.getItem(LOGO_KEY) } catch { return null }
}

/**
 * Download the logo and keep it as a data URL. No-ops when the logo hasn't
 * changed, and fails quietly — a missing logo must never break a sale.
 */
export const cacheLogo = async (url) => {
  if (!url || typeof url !== 'string') return
  try {
    if (localStorage.getItem(LOGO_SRC_KEY) === url && localStorage.getItem(LOGO_KEY)) return

    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return
    const blob = await res.blob()

    // A few hundred KB of base64 is fine; anything larger risks the ~5MB
    // localStorage ceiling that also holds the sales queue.
    if (blob.size > 400 * 1024) return

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

    localStorage.setItem(LOGO_KEY, dataUrl)
    localStorage.setItem(LOGO_SRC_KEY, url)
  } catch {
    // CORS refusal, offline, quota — all non-fatal.
  }
}

// ─── Offline invoice numbers ─────────────────────────────────────────────────

const OFFLINE_SEQ_KEY = 'ittek_offline_invoice_seq'

/**
 * A readable placeholder in the same shape as a real invoice number:
 * POS-20260811-0001. A raw timestamp is unreadable and impossible for staff to
 * quote over the phone.
 *
 * It used to read OFFLINE-… , which printed on the customer's receipt and told
 * them about the state of the shop's internet. A receipt is a record of what
 * someone bought and what they paid; the shop's connection is the shop's
 * business. The POS- prefix keeps it plainly distinct from the server's INV-
 * series, so a provisional number is still obvious in the records.
 *
 * The server issues the real number on sync; this only identifies the paper
 * receipt in the meantime.
 */
export const nextOfflineInvoiceNo = () => {
  const now = new Date()
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  let seq = 1
  try {
    const stored = JSON.parse(localStorage.getItem(OFFLINE_SEQ_KEY) || '{}')
    seq = stored.date === datePart ? (stored.seq || 0) + 1 : 1
    localStorage.setItem(OFFLINE_SEQ_KEY, JSON.stringify({ date: datePart, seq }))
  } catch {}
  return `POS-${datePart}-${String(seq).padStart(4, '0')}`
}
