// ค่าคงที่ + helper ของหน้าจัดการการจอง (ฝั่งร้าน)
// รวม adminConstants.js + adminUtils.js ของเว็บจอง และฟอร์แมตที่ POS ไม่มี (src/lib/format.js)
import { bkkToday } from '../utils/bkk';

/* ══════════════════════════════════════════════════════════════════
   ค่าคงที่
   ══════════════════════════════════════════════════════════════════ */
export const REFRESH_MS = 15000;   // รีโหลดอัตโนมัติทุก 15 วินาที
export const LIST_LIMIT = 200;     // จำนวนรายการสูงสุดที่ขอจากเซิร์ฟเวอร์
// ชื่อร้าน: หน้า admin ไม่ดึง booking-config (ต้องใช้ได้แม้ระบบปิดรับจอง)
// → ใช้ค่าคงที่ตัวเดียวกับที่ AppShell ใช้เป็น fallback
export const SHOP_NAME = "I'FEEW";

/* ชื่อวัน/เดือนไทย + label ชิปเลือกวัน (จาก OpenBills — แชร์ให้ POS บิลจองใช้ด้วย) */
export const TH_WD = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
export const TH_MO = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** label เต็มของวัน (สำหรับข้อความ/aria) — "วันนี้" / "ศุกร์ 23 ต.ค." */
export function dayChipLabel(d) {
  const [y, m, dd] = String(d || '').split('-').map(Number);
  if (!y || !m || !dd) return String(d || '—');
  if (d === bkkToday()) return 'วันนี้';
  const t = new Date(Date.UTC(y, m - 1, dd)); // FIX: weekday คำนวณด้วย UTC กัน machine-local getDay เพี้ยนถ้าเครื่องไม่เซต +7 (เช่นเดียวกับ dayList)
  const dow = t.getUTCDay();
  return `${TH_WD[dow]} ${dd} ${TH_MO[m - 1]}`;
}

/* ══════════════════════════════════════════════════════════════════
   สถานะการจอง (ของหน้า admin)
   ══════════════════════════════════════════════════════════════════ */
export const ADM_STATUS = {
  pending: { cls: 'is-pending', text: 'รอยืนยัน' },
  confirmed: { cls: 'is-confirmed', text: 'ยืนยันแล้ว' },
  completed: { cls: 'is-completed', text: 'จบบริการ' },
  cancelled: { cls: 'is-cancelled', text: 'ยกเลิกแล้ว' },
  expired: { cls: 'is-expired', text: 'หมดอายุ' },
  cancel_requested: { cls: 'is-cancel-requested', text: 'รอคืนเงิน' },
};

export const STATUS_OPTIONS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'completed', label: 'จบบริการ' },
  { value: 'cancelled', label: 'ยกเลิกแล้ว' },
  { value: 'expired', label: 'หมดอายุ' },
  { value: 'cancel_requested', label: 'รอคืนเงิน' },
];

/* ══════════════════════════════════════════════════════════════════
   ฟอร์แมต (คัดลอกจากเว็บจอง src/lib/format.js — POS ไม่มีไฟล์นี้)
   ══════════════════════════════════════════════════════════════════ */

/** แปลงค่าเป็นตัวเลข — คืน null ถ้าไม่ใช่ตัวเลขที่ใช้ได้ */
export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** เงินบาท — ฿ 1,234 (th-TH) */
export function fmtBaht(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '฿ 0';
  return `฿ ${n.toLocaleString('th-TH')}`;
}

/**
 * ยอดที่ต้องโอนจริง (ยอดตรงราคา — server คิดเป็นราคา × 100 สตางค์ ไม่มีทศนิยมสุ่มแล้ว)
 * ลำดับที่อ่าน: pay_amount_text → pay_amount (สตางค์) → amount (ราคาปกติ)
 * คืน null ถ้าไม่มีตัวเลขที่ใช้ได้เลย — ห้าม hardcode ค่าใด ๆ
 */
export function payAmountOf(booking) {
  if (!booking) return null;
  const raw = booking.pay_amount_text;
  if (raw !== null && raw !== undefined && raw !== '') {
    const text = Number(raw);
    if (Number.isFinite(text)) return text;
  }
  const satang = Number(booking.pay_amount);
  if (Number.isFinite(satang) && satang > 0) return satang / 100;
  const amount = Number(booking.amount);
  return Number.isFinite(amount) ? amount : null;
}

/** เวลาแบบสั้น: 10:00 (รับ ISO เต็มหรือ HH:mm) — ใช้ภายใน fmtTimeBkk */
function fmtTime(iso) {
  if (!iso) return '';
  const m = /(\d{2}):(\d{2})/.exec(String(iso));
  return m ? `${m[1]}:${m[2]}` : String(iso);
}

/** เวลาไทย HH:mm จาก timestamptz — ต้องแปลงตาม Asia/Bangkok
 *  ห้ามใช้ slice(11,16) ตรง ๆ เพราะ PostgREST คืน timestamptz เป็น UTC
 *  (10:00 ไทย = 03:00Z → slice จะโชว์ผิด 7 ชั่วโมง) */
export function fmtTimeBkk(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtTime(iso);
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
  } catch (e) {
    console.error('[booking] แปลงเวลาไทยไม่สำเร็จ', e);
    return fmtTime(iso);
  }
}

/** วันที่ไทย YYYY-MM-DD จาก timestamptz (แปลงตาม Asia/Bangkok ไม่ใช่ slice ดิบ) */
export function fmtDateBkk(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  try {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
    return p;
  } catch (e) {
    console.error('[booking] แปลงวันที่ไทยไม่สำเร็จ', e);
    return String(iso).slice(0, 10);
  }
}

/* ══════════════════════════════════════════════════════════════════
   helper ของหน้า admin
   ══════════════════════════════════════════════════════════════════ */

/** ยอดที่ต้องโอน (บาท) ของเดอร์นี้ */
export function payBahtOf(b) {
  return payAmountOf(b);
}

/** ยอดที่ต้องโอน (สตางค์) — ใช้ส่งให้ server เทียบ */
export function paySatangOf(b) {
  const baht = payBahtOf(b);
  if (baht !== null && Number.isFinite(baht)) return Math.round(baht * 100);
  const price = toNum(b?.amount) || 0;
  return Math.round(price * 100);
}

/** ตัวช่วยแสดงสถานะสลีป */
export function slipState(b) {
  if (!b?.slip_image_url) return 'none';
  return b?.slip_verified_at ? 'verified' : 'wait';
}

/** เดอร์ที่ยังต้องให้ร้านจัดการ (คิวงานค้าง) */
export function isTodoBooking(b) {
  return b?.status === 'pending' || b?.status === 'cancel_requested';
}

/* ══════════════════════════════════════════════════════════════════
   กันเวลาทับ: เดอร์จอง (เว็บ) vs บิลหน้าร้าน — 22 ต.ค. 2026
   ใช้ทั้งสองฝั่ง:
     · PagePOS  → ช่องเวลาของหมอคนนั้นที่มีเดอร์จองถือเป็น "ชนคิว"
     · BookingPage → เช็คก่อนกดยืนยันว่าหมอคนเดียวกันมีบิลหน้าร้านเปิดอยู่ทับ
   ══════════════════════════════════════════════════════════════════ */

/** นาทีของวัน (เวลากรุงเทพฯ) จาก ISO timestamp — null ถ้าไม่มีข้อมูล */
function isoMinutesBkk(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const h = Number(p.find((x) => x.type === 'hour')?.value);
  const m = Number(p.find((x) => x.type === 'minute')?.value);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h % 24) * 60 + m;
}

/** ช่วงเวลาสล็อตเดอร์จอง เป็นนาทีเริ่ม–จบ (เวลากรุงเทพฯ) · ไม่มี slot_start คืน null */
export function slotMinutesBkk(b) {
  const start = isoMinutesBkk(b?.slot_start);
  if (start == null) return null;
  const end = isoMinutesBkk(b?.slot_end);
  return { start, end: end == null ? start + 60 : Math.max(end, start) };
}

/** คีย์ชื่อหมอ เทียบข้ามระบบ — ตัดคำว่า "หมอ", prefix หมอวิ่ง (EXT-VIS-), ช่องว่าง และพิมพ์เล็ก */
export function therapistKey(s) {
  return String(s || '')
    .replace(/^ext-vis-/i, '')
    .replace(/หมอ/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** เวลา "HH:MM" → นาทีของวัน (null ถ้าไม่มี/ข้อมูลพัง) */
export function timeStrMinutes(t) {
  if (!t || !String(t).includes(':')) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * ค้นบิลหน้าร้านที่ "ทับกับเดอร์จอง" — หมอคนเดียวกัน (เทียบชื่อ) + วันเดียวกัน
 * + ช่วงเวลาทับกัน (ขอบจบบิลเผื่อพักห้อง 15 นาทีเหมือนระบบคิว POS)
 * คืนบิลที่เจอ (หรือ null) — เฉพาะบิลสถานะ open เท่านั้น
 */
export function findBillClashOfBooking(b, dataBills = [], dataTherapists = []) {
  const span = slotMinutesBkk(b);
  if (!span) return null;
  const nameKey = therapistKey(b?.therapist_name);
  if (!nameKey) return null;
  return (dataBills || []).find((bill) => {
    if (bill?.status !== 'open' || !bill?.startTime) return false;
    // วันเดียวกัน (biz date ของบิล = วันที่สล็อตเดอร์จอง รูปแบบ YYYY-MM-DD)
    if (bill.date && String(bill.date).slice(0, 10) !== String(b?.slot_date || '').slice(0, 10)) return false;
    const tName = bill.therapistName
      || (dataTherapists || []).find((t) => t.id === bill.therapistId)?.name
      || '';
    if (therapistKey(tName) !== nameKey) return false;
    const start = timeStrMinutes(bill.startTime);
    if (start == null) return false;
    const end = timeStrMinutes(bill.endTime) ?? start + 60;
    return span.start < end + 15 && span.end > start;
  }) || null;
}
