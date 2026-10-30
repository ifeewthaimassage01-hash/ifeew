// ช่องเรียลไทม์ของ "การจองจากเว็บ" — 22 ต.ค. 2026
//
// ทางท่อระบบ: trigger trg_booking_changed (DB) บันทึกแถวเหตุการณ์จิ๋วลง
//   booking_events ทุกครั้งที่ตาราง bookings ถูกสร้าง/แก้ไข/ลบ
//   (ตารางนี้ไม่มีข้อมูลลูกค้า — anon อ่านได้ตาม policy เพื่อให้ POS
//   subscribe ได้โดยไม่ต้องใช้รหัสเจ้าของร้าน)
// ฝั่งนี้: subscribe postgres_changes ของ booking_events → debounce แล้ว
//   เรียกผู้สนใจทุกตัว · ใช้ channel เดียวทั้งแอป (นับ ref) กันเปิดซ้อนหลายช่อง
// ใช้ร่วมกับ polling เดิม (15/60 วิ) เป็นเฟลบแค็ก — realtime ล้มก็ยังมีรอบเก่าดูแล
//
// 5 พ.ย. 2026 — เพิ่ม auto-reconnect: เดิมช่องพัง (CHANNEL_ERROR / TIMED_OUT /
//   CLOSED — เน็ตหลุด, เครื่องกลับจาก sleep, wifi ช่วงสลับ) แล้วทิ้งไปตลอดกาล
//   ช่องที่ CLOSED แล้ว supabase-js ไม่ rejoin ให้เอง ต้องรื้อ + subscribe ใหม่เอง
//   — ถอยหลัง 1→2→4→8→15→30 วิ (cap) · ต่อสำเร็จเมื่อไร นับถอยหลังก็กลับมาเริ่ม 0
//   — เน็ตกลับมา (event online) หรือกลับมาดูจอ (visibilitychange) → รีเชื่อมทันที
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const DEBOUNCE_MS = 350;
/* ถอยหลังเชื่อมใหม่ — ดัชนีเกินความยาว = ใช้ตัวสุดท้ายต่อเนื่อง */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000];

let channel = null;
let refs = 0;
const listeners = new Set();
let timer = null;
let retryTimer = null;
let attempt = 0;          // นับความพยายามเชื่อมใหม่ — SUBSCRIBED แล้วรีเซ็ตเป็น 0
let retrying = false;     // เว้นรอบถอยหลังอยู่ไหม (กัน setTimeout ทับซ้ำ)
let tearingDown = false;  // รื้อช่องเอง (removeChannel) → CLOSED ที่วิ่งกลับมาทีหลังคือเรื่องปกติ

/* ─── สถานะช่องเรียลไทม์ (บอกผู้ใช้ว่า "อัปเดตทันที" หรือกำลังใช้รอบสำรอง) ───
 * 'unknown'    = ยังไม่ทราบ (เพิ่งเริ่มเชื่อม)
 * 'connected'  = ช่อง postgres_changes พร้อม — การเปลี่ยนแปลงถึงแบบทันที
 * 'down'       = ช่องตก (เน็ตหลุด/เชื่อมไม่สำเร็จ) — polling 15/60 วิ ดูแลชั่วคราว */
export const RT_CONNECTING = 'unknown';
export const RT_CONNECTED = 'connected';
export const RT_DOWN = 'down';

let realtimeStatus = RT_CONNECTING;
const statusListeners = new Set();

function setStatus(next) {
  if (realtimeStatus === next) return;
  realtimeStatus = next;
  statusListeners.forEach((cb) => {
    try { cb(next); } catch (e) { /* ผู้ฟังพัง ไม่กระทบช่องหลัก */ }
  });
}

function notifyListeners() {
  listeners.forEach((cb) => {
    try { cb(); } catch (e) { console.error('[booking] realtime listener ผิดพลาด', e); }
  });
}

function handleEvent() {
  // กระแสข่าวชุดเดียวอาจมีหลายแถว (update เป็นชุด) — debounce รวบเป็นรอบเดียว
  clearTimeout(timer);
  timer = setTimeout(notifyListeners, DEBOUNCE_MS);
}

/* ─── auto-reconnect ─── */

function cancelRetry() {
  clearTimeout(retryTimer);
  retryTimer = null;
  retrying = false;
}

/* รื้อช่องเดิม (removeChannel คืน promise — รอมันจบ กันช่องซ้ายค้าง) */
function teardownChannel() {
  const ch = channel;
  channel = null;
  if (!ch || !supabase) return;
  tearingDown = true;
  Promise.resolve(supabase.removeChannel(ch)).finally(() => { tearingDown = false; });
}

function scheduleRetry() {
  cancelRetry();
  if (refs <= 0 || channel) return;
  const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
  attempt += 1;
  retrying = true;
  retryTimer = setTimeout(() => {
    retrying = false;
    retryTimer = null;
    if (refs <= 0 || channel) return;
    ensureChannel(); // ระหว่างเว้นวรรคอาจมีการรื้อทั้งหมดก่อนแล้ว — เช็คก่อนเชื่อมเสมอ
  }, delay);
}

/* เหตุการณ์เบราว์เซอร์ — เน็ตกลับมา / กลับมาดูจอ → รีเชื่อมทันที ไม่รอถอยหลัง */
function reconnectNow() {
  if (refs <= 0 || channel) return;
  attempt = 0; // event online/visible = โอกาสดี เริ่มนับถอยหลังใหม่
  cancelRetry();
  ensureChannel();
}
window.addEventListener('online', reconnectNow);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reconnectNow();
});

function ensureChannel() {
  if (channel || !supabase || !refs || retrying) return;
  setStatus(RT_CONNECTING);
  let ch = supabase.channel('booking-events');
  ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: 'booking_events' }, handleEvent);
  channel = ch; // ลงทะเบียนก่อน subscribe — subscribe callback จะไม่มีห้วงเบลอเห็น channel ยัง null
  ch.subscribe((status) => {
    // ช่องถูกตัดสิทธิ์ไปแล้ว (มีการรื้อ + สร้างช่องใหม่) — CLOSED ที่วิ่งกลับมาจากช่องเก่าคือปกติ เมิน
    if (ch !== channel) return;
    if (status === 'SUBSCRIBED') {
      // ช่องพร้อม — เหตุการณ์เดอร์จองถึงแบบทันที (ไม่ต้องรอรอบ polling)
      attempt = 0; // ต่อได้แล้ว — รอบถัดไปถ้าตก เริ่มถอยหลังรอบแรกใหม่
      cancelRetry();
      setStatus(RT_CONNECTED);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      // realtime ตกน้ำ → รื้อช่องที่พังแล้วจัดตาคิวเชื่อมใหม่ (ปกติ CLOSED ไม่มีใคร rejoin ให้)
      const silent = tearingDown; // รื้อเองเพราะพ้นหน้า → CLOSED ขึ้นทีหลังเป็นงานบ้าน ไม่รกคอนโซล
      teardownChannel();
      setStatus(RT_DOWN);
      if (!silent) console.error('[booking] realtime ช่องเดอร์จองหลุด — จะเชื่อมใหม่อัตโนมัติ (ยังมี polling ตามเดิม)', status);
      scheduleRetry();
    }
  });
}

/**
 * เข้าร่วมช่องเรียลไทม์ของเดอร์จอง — คืนฟังก์ชันเลิกสมัคร (เรียกครั้งเดียวพอ)
 * cb (รวม debounce แล้ว) จะถูกเรียกทุกครั้งที่เดอร์จองเปลี่ยนฝั่ง server
 */
export function onBookingsChanged(cb) {
  if (!supabase) return () => {}; // ไม่ได้เชื่อม supabase → นิ่ง (polling เดิมดูแลเอง)
  const hadRefs = refs > 0;
  refs += 1;
  if (!hadRefs) ensureChannel(); // คนแรกที่มา — เริ่มเชื่อมเลย (ตาคิวเก่าถูกยกเลิกตั้งแต่ตอนรื้อแล้ว)
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
    refs -= 1;
    if (refs <= 0) {
      refs = 0;
      clearTimeout(timer);
      cancelRetry(); // ยกเลิกตาคิวเชื่อมใหม่ด้วย — ไม่มีใครฟังแล้ว อย่าเชื่อมเปล่า ๆ
      teardownChannel();
      setStatus(RT_CONNECTING); // รื้อช่องแล้ว — รอเชื่อมใหม่ตอนมีคนใช้อีก
    }
  };
}

/**
 * ติดตามสถานะช่องเรียลไทม์ — cb รับ 'unknown' | 'connected' | 'down'
 * (ไม่ดันช่องเอง: หน้าที่แสดงสถานะย่อม subscribe onBookingsChanged อยู่แล้ว)
 */
export function onRealtimeStatus(cb) {
  statusListeners.add(cb);
  try { cb(realtimeStatus); } catch (e) { /* แจ้งค่าปัจจุบันทันที */ }
  return () => { statusListeners.delete(cb); };
}

/** hook ฝั่ง UI — คืนสถานะช่องปัจจุบัน ('unknown' | 'connected' | 'down') */
export function useRealtimeStatus() {
  const [status, setStatus] = useState(realtimeStatus);
  useEffect(() => onRealtimeStatus(setStatus), []);
  return status;
}
