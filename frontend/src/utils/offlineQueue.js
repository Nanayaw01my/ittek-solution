const QUEUE_KEY = 'ittek_offline_sales_queue'
const PRODUCTS_KEY = 'ittek_products_cache'
const CACHE_TIME_KEY = 'ittek_products_cache_time'
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours

export const saveProductsCache = (products) => {
  try {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products))
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString())
  } catch {}
}

export const getCachedProducts = () => {
  try {
    const cached = localStorage.getItem(PRODUCTS_KEY)
    const time = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0')
    if (!cached || Date.now() - time > CACHE_MAX_AGE) return null
    return JSON.parse(cached)
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
