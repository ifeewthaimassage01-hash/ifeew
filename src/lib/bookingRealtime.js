// ช่องเรียลไทม์ของ "การจองจากเว็บ" — 22 ต.ค. 2026
//
// ทางท่อระบบ: trigger trg_booking_changed (DB) บันทึกแถวเหตุการณ์จิ๋วลง
//   booking_events ทุกครั้งที่ตาราง bookings ถูกสร้าง/แก้ไข/ลบ
//   (ตารางนี้ไม่มีข้อมูลลูกค้า — anon อ่านได้ตาม policy เพื่อให้ POS
//   subscribe ได้โดยไม่ต้องใช้รหัสเจ้าของร้าน)
// ฝั่งนี้: subscribe postgres_changes ของ booking_events → debounce แล้ว
//   เรียกผู้สนใจทุกตัว · ใช้ channel เดียวทั้งแอป (นับ ref) กันเปิดซ้อนหลายช่อง
// ใช้ร่วมกับ polling เดิม (15/60 วิ) เป็นเฟลบแค็ก — realtime ล้มก็ยังมีรอบเก่าดูแล
import { supabase } from './supabase';

const DEBOUNCE_MS = 350;

let channel = null;
let refs = 0;
const listeners = new Set();
let timer = null;

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
  channel = supabase
    .channel('booking-events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_events' }, handleEvent)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // realtime ตกน้ำ → ไม่รื้อทุกอย่าง ให้ polling เดิมดูแลข้อมูลตามรอบเดิม
        console.error('[booking] realtime ช่องเดอร์จองเชื่อมไม่สำเร็จ — ยังมี polling ตามเดิม', status);
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
    }
  };
}
