// เวลากลางของแอป — Asia/Bangkok (UTC+07:00)
// ใช้แทน new Date()/toISOString()/getHours() ทุกจุดที่เกี่ยวกับ "วัน-เวลาไทย"
// เก็บวันที่เป็น wall-time ไทย (ไม่มี offset) เพื่อให้ slice(0,10) ตรงกับวันที่ไทยเสมอ

export const BKK_TZ = 'Asia/Bangkok';

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: BKK_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

function parts(now = new Date()) {
  const p = {};
  for (const { type, value } of dtf.formatToParts(now)) p[type] = value;
  return {
    y: p.year, m: p.month, d: p.day,
    H: p.hour === '24' ? '00' : p.hour, M: p.minute, S: p.second,
  };
}

/** วันที่ไทย YYYY-MM-DD (offset = ±วัน) */
export function bkkToday(offset = 0) {
  const p = parts(new Date(Date.now() + offset * 86400000));
  return `${p.y}-${p.m}-${p.d}`;
}

/** เวลาปัจจุบันไทย YYYY-MM-DDTHH:mm:ss (ไม่มี offset) — ใช้เก็บ bill.date/createdAt/timestamp */
export function bkkNow() {
  const p = parts();
  return `${p.y}-${p.m}-${p.d}T${p.H}:${p.M}:${p.S}`;
}

/** ปี ค.ศ. ไทย (สำหรับ footer) */
export function bkkYear() {
  return parts().y;
}

/** นาทีตั้งแต่เที่ยงคืนตามเวลาไทย — ใช้ตั้งค่า default เวลาเริ่มใน POS */
export function bkkMinutes() {
  const p = parts();
  return Number(p.H) * 60 + Number(p.M);
}

/**
 * แสดงผลวันที่/เวลาเป็นไทย — รับทั้ง ISO มี Z และ wall-time ไม่มี offset
 * (wall-time ไม่มี offset ถือว่าเป็นเวลาไทยอยู่แล้ว)
 */
export function fmtBkk(dateStr, opts) {
  if (!dateStr) return '—';
  let s = String(dateStr);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += '+07:00';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString('th-TH', { timeZone: BKK_TZ, ...(opts || {}) });
}
