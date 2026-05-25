const CACHE = 'ittek-app-v2'

self.addEventListener('install', (e) => {
  // Cache the app entry point immediately on install
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['/', '/index.html']))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  // Remove old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Never intercept API calls — let them fail so offline queue handles them
  if (url.pathname.startsWith('/api/')) return

  // Only handle same-origin requests
  if (url.origin !== location.origin) return

  if (e.request.mode === 'navigate') {
    // Page loads/refreshes: try network first, fall back to cached app shell
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return res
        })
        .catch(() =>
          caches.match('/index.html').then(r => r || caches.match('/'))
        )
    )
    return
  }

  // JS, CSS, fonts, images: serve from cache if available, fetch and cache otherwise
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fromNetwork = fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      return cached || fromNetwork
    })
  )
})
