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

/** วันที่ไทย YYYY-MM-DD (offset = ±วัน) — คำนวณวันใน TZ Asia/Bangkok โดยตรง
 * (หา midnight ไทยก่อนแล้วค่อยบวกวัน จึงไม่เพี้ยนใกล้เที่ยงคืนเหมือน Date.now()+offset) */
export function bkkToday(offset = 0) {
  const p = parts();
  // midnight ไทยในรูป UTC instant: Date.UTC(y,m-1,d) คือเที่ยงคืน UTC จึงลบ 7 ชม. ได้ 00:00+07:00
  const bkkMidnightUtc = Date.UTC(Number(p.y), Number(p.m) - 1, Number(p.d)) - 7 * 3600000;
  // บวกวันแล้วชี้ไปกลางวัน (+12 ชม.) กันขอบเขต DST/ปัดเศษ แล้วแปลงกลับด้วย parts() (TZ Bangkok)
  const target = new Date(bkkMidnightUtc + offset * 86400000 + 12 * 3600000);
  const tp = parts(target);
  return `${tp.y}-${tp.m}-${tp.d}`;
}

/** เวลาปัจจุบันไทย ISO พร้อม offset +07:00 — ใช้เก็บ bill.date/paidAt/timestamp (timestamptz)
 * (ของเดิมส่ง wall-time ไม่มี offset ทำให้ Postgres ตีความเป็น UTC แล้วเพี้ยน 7 ชม.) */
export function bkkNow() {
  const p = parts();
  return `${p.y}-${p.m}-${p.d}T${p.H}:${p.M}:${p.S}+07:00`;
}

/** ชั่วโมงตัดยอดวันธุรกิจ — ร้านปิดดึก บิล 00:00–02:59 นับเป็นของวันก่อนหน้า */
export const BIZ_CUTOFF_HOUR = 3;

/** วันที่ธุรกิจ YYYY-MM-DD ของ timestamp — ถอย 3 ชม. แล้วอ่านวันที่ไทย
 * (รับทั้ง ISO มี offset, wall-time ไม่มี offset ถือว่าไทย, และ date ล้วนที่นับตามปฏิทิน) */
export function bizDateOf(ts) {
  if (!ts) return '';
  let s = String(ts);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += '+07:00';
  const ms = new Date(s).getTime();
  if (Number.isNaN(ms)) {
    const m = String(ts).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(m) ? m : '';
  }
  const p = parts(new Date(ms - BIZ_CUTOFF_HOUR * 3600000));
  return `${p.y}-${p.m}-${p.d}`;
}

/** วันที่ธุรกิจวันนี้ (หลังตี 3 = วันใหม่) */
export function bizToday() {
  return bizDateOf(new Date());
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
 * แสดงผลวันที่/เวลาเป็นไทย — รับทั้ง ISO มี Z/offset และ wall-time ไม่มี offset
 * (wall-time ไม่มี offset ถือว่าเป็นเวลาไทยอยู่แล้ว; bkkNow() รุ่นใหม่ส่ง +07:00 มาให้ตรง timestamptz)
 */
export function fmtBkk(dateStr, opts) {
  if (!dateStr) return '—';
  let s = String(dateStr);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += '+07:00';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString('th-TH', { timeZone: BKK_TZ, ...(opts || {}) });
}
