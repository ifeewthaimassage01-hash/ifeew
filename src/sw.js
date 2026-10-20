// Custom service worker (injectManifest) — I'FEEW POS
// precache manifest ถูก inject โดย vite-plugin-pwa (self.__WB_MANIFEST)
// + รับ Web Push สำหรับแอดมิน (บิลใหม่ / สรุปรายวัน)

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// อัปเดตแอปทันที — SW ใหม่คว้าควบคุมหน้าที่เปิดอยู่เลย ไม่ต้องรอผู้ใช้ปิดทุกแท็บ
// (registerSW.js ที่ vite สร้างมีแค่ register() ไม่มี autoUpdate จึงต้องทำเอง)
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

// Payload จาก Edge Functions: { title, body, kind, url }
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
  const kind = data.kind || '';
  const url = data.url || './';
  const actions =
    kind === 'bill' || kind === 'bill-open'
      ? [{ action: 'open-bill', title: 'ดูบิล' }, { action: 'dismiss', title: 'ปิด' }]
      : kind === 'daily'
        ? [{ action: 'open-summary', title: 'ดูสรุป' }, { action: 'dismiss', title: 'ปิด' }]
        : [];
  const options = {
    body: data.body || '',
    icon: './pwa-192x192.png',
    badge: './favicon-64.png',
    tag: kind || 'ifeew',
    actions,
    data: { url, kind },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = (event.notification.data && event.notification.data.url) || './';
  // action ว่าง (กดตัวแจ้งเตือน) / open-bill / open-summary → เปิด url เดียวกัน
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
