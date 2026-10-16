// Custom service worker (injectManifest) — I'FEEW POS
// precache manifest ถูก inject โดย vite-plugin-pwa (self.__WB_MANIFEST)
// + รับ Web Push สำหรับแอดมิน (บิลใหม่ / สรุปรายวัน)

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Payload จาก Edge Functions: { title, body, url }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { body: event.data ? event.data.text() : '' };
    } catch {
      data = {};
    }
  }
  const title = data.title || "I'FEEW POS";
  const options = {
    body: data.body || '',
    icon: './pwa-192x192.png',
    badge: './favicon-64.png',
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if ('focus' in w) {
          try { await w.focus(); } catch { /* ข้าม */ }
          try { await w.navigate(url); } catch { /* ข้าม */ }
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
