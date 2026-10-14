// ตัวสร้างรหัส — ไม่เปลี่ยน format
import { bkkToday } from '../utils/bkk';

/* รหัสบิล — INV-YYYYMMDD-<millis>-<rand3> ชนกันยาก (millis+สุ่ม) + เช็คซ้ำกับบิลเดิม
 * @param {Array|string[]|{bills:Array}} [existing] — รายการบิลเดิม (array ของ {id} / string[] / {bills}) เพื่อกันชน */
export function generateBillId(existing) {
  const ymd = bkkToday().replace(/-/g, '');
  let taken = null;
  if (Array.isArray(existing)) {
    taken = new Set(existing.map((b) => (typeof b === 'string' ? b : b?.id)));
  } else if (existing?.bills) {
    taken = new Set(existing.bills.map((b) => b.id));
  }
  for (let i = 0; i < 5; i += 1) {
    const rand = Math.floor(Math.random() * 900 + 100).toString(); // 100-999 (3 หลักเสมอ)
    const id = `INV-${ymd}-${Date.now()}-${rand}`;
    if (!taken || !taken.has(id)) return id;
  }
  // fallback กรณีชน 5 ครั้งติด (แทบเป็นไปไม่ได้): เติมสุ่มเพิ่ม
  const rand = Math.floor(Math.random() * 900 + 100).toString();
  return `INV-${ymd}-${Date.now()}-${rand}${Math.floor(Math.random() * 90 + 10)}`;
}

/* รหัสค่าใช้จ่ายแบบ time-based ชนกันยากแม้ลบแถวแล้ว
 * @param {Array} [_existing] — รับไว้เพื่อ API สมมาตร (ไม่ต้องใช้ก็ได้เพราะ time-based+random ชนยากอยู่แล้ว) */
export function nextExpenseId(_existing) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `EXP-${crypto.randomUUID()}`;
  } catch { /* fallback ด้านล่าง */ }
  const ymd = bkkToday().replace(/-/g, '');
  const t36 = Date.now().toString(36).toUpperCase();
  const r36 = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  return `EXP-${ymd}-${t36}-${r36}`;
}
