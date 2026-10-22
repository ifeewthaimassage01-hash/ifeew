// ช่องเรียลไทม์ของ "การจองจากเว็บ" — 22 ต.ค. 2026
//
// ทางท่อระบบ: trigger trg_booking_changed (DB) บันทึกแถวเหตุการณ์จิ๋วลง
//   booking_events ทุกครั้งที่ตาราง bookings ถูกสร้าง/แก้ไข/ลบ
//   (ตารางนี้ไม่มีข้อมูลลูกค้า — anon อ่านได้ตาม policy เพื่อให้ POS
//   subscribe ได้โดยไม่ต้องใช้รหัสเจ้าของร้าน)
// ฝั่งนี้: subscribe postgres_changes ของ booking_events → debounce แล้ว
//   เรียกผู้สนใจทุกตัว · ใช้ channel เดียวทั้งแอป (นับ ref) กันเปิดซ้อนหลายช่อง
// ใช้ร่วมกับ polling เดิม (15/60 วิ) เป็นเฟลบแค็ก — realtime ล้มก็ยังมีรอบเก่าดูแล
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const DEBOUNCE_MS = 350;

let channel = null;
let refs = 0;
const listeners = new Set();
let timer = null;

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

function ensureChannel() {
  if (channel || !supabase) return;
  setStatus(RT_CONNECTING);
  channel = supabase
    .channel('booking-events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_events' }, handleEvent)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // ช่องพร้อม — เหตุการณ์เดอร์จองถึงแบบทันที (ไม่ต้องรอรอบ polling)
        setStatus(RT_CONNECTED);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // realtime ตกน้ำ → ไม่รื้อทุกอย่าง ให้ polling เดิมดูแลข้อมูลตามรอบเดิม
        console.error('[booking] realtime ช่องเดอร์จองเชื่อมไม่สำเร็จ — ยังมี polling ตามเดิม', status);
        setStatus(RT_DOWN);
      }
    });
}

/**
 * เข้าร่วมช่องเรียลไทม์ของเดอร์จอง — คืนฟังก์ชันเลิกสมัคร (เรียกครั้งเดียวพอ)
 * cb (รวม debounce แล้ว) จะถูกเรียกทุกครั้งที่เดอร์จองเปลี่ยนฝั่ง server
 */
export function onBookingsChanged(cb) {
  if (!supabase) return () => {}; // ไม่ได้เชื่อม supabase → นิ่ง (polling เดิมดูแลเอง)
  ensureChannel();
  listeners.add(cb);
  refs += 1;
  return () => {
    listeners.delete(cb);
    refs -= 1;
    if (refs <= 0) {
      refs = 0;
      clearTimeout(timer);
      if (channel) { supabase.removeChannel(channel); channel = null; }
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
