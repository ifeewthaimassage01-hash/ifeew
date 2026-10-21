// ค่าคงที่ + helper ของหน้าจัดการการจอง (ฝั่งร้าน)
// รวม adminConstants.js + adminUtils.js ของเว็บจอง และฟอร์แมตที่ POS ไม่มี (src/lib/format.js)

/* ══════════════════════════════════════════════════════════════════
   ค่าคงที่
   ══════════════════════════════════════════════════════════════════ */
export const REFRESH_MS = 15000;   // รีโหลดอัตโนมัติทุก 15 วินาที
export const LIST_LIMIT = 200;     // จำนวนรายการสูงสุดที่ขอจากเซิร์ฟเวอร์
// ชื่อร้าน: หน้า admin ไม่ดึง booking-config (ต้องใช้ได้แม้ระบบปิดรับจอง)
// → ใช้ค่าคงที่ตัวเดียวกับที่ AppShell ใช้เป็น fallback
export const SHOP_NAME = "I'FEEW";

/* ══════════════════════════════════════════════════════════════════
   สถานะการจอง (ของหน้า admin)
   ══════════════════════════════════════════════════════════════════ */
export const ADM_STATUS = {
  pending: { cls: 'is-pending', text: 'รอยืนยัน' },
  confirmed: { cls: 'is-confirmed', text: 'ยืนยันแล้ว' },
  cancelled: { cls: 'is-cancelled', text: 'ยกเลิกแล้ว' },
  expired: { cls: 'is-expired', text: 'หมดอายุ' },
  cancel_requested: { cls: 'is-cancel-requested', text: 'รอคืนเงิน' },
};

export const STATUS_OPTIONS = [
  { value: '', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รอยืนยัน' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
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
 * ยอดที่ต้องโอนจริง (ยอดไม่ซ้ำ — server เติมทศนิยมสุ่มให้เพื่อจับคู่ webhook)
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
