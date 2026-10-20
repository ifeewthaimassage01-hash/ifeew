// ตรวจเวอร์ชัน deployment + ล้าง cache + รีเฟรชแอป
// - version.json ถูกปล่อยตอน build (ดู vite.config.js) → เทียบกับ __APP_VERSION__ ที่ฝังใน bundle
// - ตอนเจอเวอร์ชันใหม่: อัปเดต service worker → รอ SW ใหม่คว้าควบคุม → ล้าง cache → reload

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const VERSION_FILE = 'version.json';
export const CHECK_INTERVAL_MS = 5 * 60 * 1000; // เช็คทุก 5 นาที

// จำเวอร์ชันที่เคย "พยายามอัปเดต" ไว้ — กันลูปรีเฟรชไม่รู้จบ
// (กรณี sw.js ถูก cache ที่ server/CDN → SW ไม่อัปเดต → รีเฟรชแล้วแอปยังเป็นเวอร์ชันเก่าอยู่)
export const UPDATE_ATTEMPT_KEY = 'ifeew_update_attempt';
export function markUpdateAttempt(version) {
  try { localStorage.setItem(UPDATE_ATTEMPT_KEY, String(version || '')); } catch { /* ignore */ }
}
export function getUpdateAttempt() {
  try { return localStorage.getItem(UPDATE_ATTEMPT_KEY) || ''; } catch { return ''; }
}

// หา URL ของ version.json ให้ตรงกับโฟลเดอร์ที่วางไฟล์ไว้ (แอปอาจอยู่ใน sub-path)
// — ใช้ scope ของ service worker ก่อน (ชี้ตรงที่สุด) แล้วค่อย fallback ไปที่ base ของหน้า
async function resolveVersionUrl() {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.scope) return new URL(VERSION_FILE, reg.scope).toString();
    }
  } catch { /* ignore */ }
  const base = new URL(document.baseURI);
  // ตัวสุดท้ายของ path ถ้ามีจุด = ไฟล์ (เช่น index.html) → ตัดทิ้งใช้โฟลเดอร์แม่
  // ถ้าไม่มีจุด = โฟลเดอร์ (เช่น /ifeew) → เติม '/' ให้ path ถูกต้อง
  const last = base.pathname.split('/').pop() || '';
  if (last.includes('.')) base.pathname = base.pathname.replace(/[^/]*$/, '');
  else if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(VERSION_FILE, base).toString();
}

// ดึงเวอร์ชันล่าสุดจาก server (กัน cache ทุกรอบ)
export async function fetchLatestVersion() {
  try {
    const url = new URL(await resolveVersionUrl());
    url.searchParams.set('t', String(Date.now()));
    const res = await fetch(url.toString(), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return null;
    const data = await res.json();
    const v = String(data?.version || '').trim();
    return v || null;
  } catch {
    return null;
  }
}

// คืนเวอร์ชันใหม่ที่ต่างจากที่กำลังรันอยู่ — null = อัปเดตแล้ว/เช็คไม่ได้
export async function checkForUpdate() {
  const latest = await fetchLatestVersion();
  if (!latest || latest === APP_VERSION) return null;
  return latest;
}

// รอจนกว่า SW ใหม่จะคว้าควบคุมหน้า (controllerchange) — timeout ไม่เกิน 5 วินาที
function waitForControllerChange(timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!('serviceWorker' in navigator)) { resolve(false); return; }
    let done = false;
    const finish = (ok) => { if (done) return; done = true; navigator.serviceWorker.removeEventListener('controllerchange', onChange); resolve(ok); };
    const onChange = () => finish(true);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    setTimeout(() => finish(false), timeoutMs);
  });
}

// ล้าง cache ที่ไม่ใช่ precache ของ workbox (เช่น google-fonts) — เก็บ precache ไว้
// เพราะถ้าลบ precache ทิ้งแล้ว reload หน้าไม่มีไฟล์ให้เสิร์ฟ
export async function clearCachesExceptPrecache() {
  try {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !/workbox-precache/i.test(k)).map((k) => caches.delete(k).catch(() => {})));
  } catch { /* ignore */ }
}

// ลบ cache ทั้งหมด (ใช้ตอน "ล้างแคช" แบบหนัก)
export async function clearAllCaches() {
  try {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
  } catch { /* ignore */ }
}

/* ---------- กู้สถานการณ์ "แอปพังหลัง deploy" ----------
   ถ้า SW ใหม่คว้าควบคุมเอง (เช่น เบราว์เซอร์เช็ค sw.js ตอนเปิดหน้าใหม่) แอปต้องรีเฟรช
   ไม่งั้นหน้าค้างเป็นของเก่า (ไฟล์ asset เก่าถูกลบจาก server ไปแล้ว → โหลดไม่ขึ้น)
   — ลงทะเบียนระดับ module เพื่อให้ทำงานแม้ React tree ล่มไปแล้ว */
let autoReloadGuard = () => true; // App จะมาตั้งเอง (เช่น มี modal เปิดอยู่ → ยังไม่รีเฟรช)
let updating = false; // กำลังอัปเดตอยู่ → ปล่อยให้ applyUpdate() เป็นคนรีเฟรชเอง
export function setAutoReloadGuard(fn) { autoReloadGuard = fn; }

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // ติดตั้งครั้งแรก — ไม่ต้องรีเฟรช
    if (updating) return; // applyUpdate() จะรีเฟรชเองอยู่แล้ว
    if (!autoReloadGuard()) return; // มีงานค้าง (modal เปิด) — ยังไม่รีเฟรช
    window.location.reload();
  });
}

// อัปเดต SW → รอคว้าควบคุม → ล้าง cache → รีเฟรช (ใช้ตอนเจอเวอร์ชันใหม่)
export async function applyUpdate() {
  updating = true; // กัน auto-reload ของ listener รีเฟรชซ้ำ
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => {});
        await waitForControllerChange();
      }
    }
  } catch { /* ignore */ }
  await clearCachesExceptPrecache();
  window.location.reload();
}

// ล้างแคชแบบหนัก: ถอด service worker ออก + ลบ cache ทั้งหมด → รีเฟรช
// (หลัง reload แอปจะ register SW ใหม่และ precache ใหม่เอง)
export async function hardClearCacheAndReload() {
  updating = true; // กัน auto-reload ของ listener รีเฟรชซ้ำ
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch { /* ignore */ }
  await clearAllCaches();
  window.location.reload();
}
