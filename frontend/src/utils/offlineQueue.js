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
  } catch {}
}

export const getPendingCount = () => getPendingQueue().length
