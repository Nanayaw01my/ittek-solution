/**
 * Push handling, imported into the generated service worker.
 *
 * It lives here rather than in the app because a push arrives when no page is
 * open — that is the whole point of it. vite-plugin-pwa generates the rest of
 * the worker, so this is pulled in through workbox's importScripts instead of
 * replacing it.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'ITTEK', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'ITTEK Solution';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Same tag replaces rather than stacks, so a busy afternoon does not
      // leave twenty identical lines on the phone.
      tag: data.tag || 'ittek',
      renotify: true,
      data: { link: data.link || '/notifications' },
    })
  );
});

/**
 * Tapping it should land on the thing it is about — and reuse a window that
 * is already open rather than starting a second copy of the app.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/notifications';

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(link).catch(() => {});
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(link);
  })());
});
