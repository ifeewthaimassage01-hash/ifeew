// ตัวห่อเรียก Edge Function ฝั่งร้าน — `booking-admin`
//
// หน้าจัดการการจอง (admin) ไม่ใช่หน้าสาธารณะ → ทุกคำขอต้องส่ง header `x-admin-key`
//   เทียบกับ secret BOOKING_ADMIN_KEY ของ Edge Function (ฝั่ง server เทียบแบบ constant-time)
//   ถ้า server ยังไม่ได้ตั้ง key → 503 ADMIN_NOT_CONFIGURED · key ผิด → 401 UNAUTHORIZED
//
// error ที่โยนออกไป (AdminApiError) มี:
//   .code    = รหัส error จาก server (เช่น UNAUTHORIZED, AMOUNT_MISMATCH, BOOKING_CLOSED)
//   .message = ข้อความภาษาไทย (แสดงใน UI ได้เลย)
//   .status  = HTTP status (401/404/409/503)
//   .data    = payload ดิบจาก server (ถ้ามี)
import { supabase, isSupabaseConfigured } from './supabase';
import { readErrorPayload } from './httpError';

/** ชื่อ Edge Function */
const ADMIN_FN = 'booking-admin';

/** ชื่อ header ที่ต้องส่งทุกคำขอ */
const ADMIN_KEY_HEADER = 'x-admin-key';

/** error ที่โยนออกไปจาก adminApi — มี .code / .message / .status ให้หน้าเว็บแยกแยะได้ */
class AdminApiError extends Error {
  constructor(message, code = 'ERROR', status = 0, data = null) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

/**
 * เรียก booking-admin 1 ครั้ง
 * @param {object} body  payload ตาม action (list / confirm / reject / stats)
 * @param {string} key   รหัสผ่าน admin (ส่งเป็น header x-admin-key)
 */
async function invoke(body, key) {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminApiError(
      'ยังไม่ได้ตั้งค่า Supabase — กรุณาใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ในไฟล์ .env',
      'NO_SUPABASE',
      0,
    );
  }

  const adminKey = String(key || '').trim();
  if (!adminKey) {
    throw new AdminApiError(
      'ยังไม่ได้ใส่รหัสผ่านสำหรับหน้าจัดการการจอง',
      'NO_ADMIN_KEY',
      0,
    );
  }

  let data = null;
  let error = null;
  try {
    // supabase-js รองรับ headers ใน options ของ functions.invoke (^2.117)
    const res = await supabase.functions.invoke(ADMIN_FN, {
      body,
      headers: { [ADMIN_KEY_HEADER]: adminKey },
    });
    data = res?.data ?? null;
    error = res?.error ?? null;
  } catch (e) {
    console.error('[booking] เรียก booking-admin ไม่สำเร็จ', e);
    throw new AdminApiError(
      'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
      'NETWORK',
      0,
    );
  }

  if (error) {
    const payload = await readErrorPayload(error, ' admin ');
    // สถานะ HTTP: supabase-js เก็บไว้ที่ error.context.status (Response)
    const status = error.status || error.statusCode || error?.context?.status || 0;
    // ถ้า payload ไม่ใช่รูปแบบของระบบเรา ({ ok:false, error, message }) → เป็น error ระดับ platform
    //   (เช่น ฟังก์ชันยังไม่ได้ deploy · apikey ผิด · เซิร์ฟเวอร์ล่ม) → ต้องข้อความไทยที่บอกคนได้
    const isAppError = Boolean(payload && (payload.error || payload.ok === false));
    let code = 'ERROR';
    let message = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    if (isAppError) {
      code = payload.error || 'ERROR';
      message = payload.message || message;
    } else if (status === 404) {
      code = 'FN_NOT_DEPLOYED';
      message = 'ฟังก์ชันจัดการการจองยังไม่ได้ deploy — กรุณาติดต่อผู้ดูแลระบบ';
    } else if (status === 401 || status === 403) {
      code = 'INVALID_API_KEY';
      message = 'การตั้งค่า Supabase ไม่ถูกต้อง — กรุณาติดต่อผู้ดูแลระบบ';
    } else if (status >= 500) {
      code = 'SERVER_ERROR';
      message = 'เซิร์ฟเวอร์มีปัญหาชั่วคราว กรุณาลองใหม่อีกครั้ง';
    }
    console.error('[booking] booking-admin ตอบกลับผิดพลาด', { code, message, status });
    throw new AdminApiError(message, code, status, payload);
  }

  if (!data || data.ok === false) {
    const code = data?.error || 'ERROR';
    const message = data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    console.error('[booking] booking-admin ตอบกลับ ok=false', { code, message });
    throw new AdminApiError(message, code, 0, data);
  }

  return data;
}

/**
 * ตัวเรียก API ฝั่งร้าน
 *   ทุกฟังก์ชันรับ key เป็นอาร์กิวเมนต์แรก (เก็บใน sessionStorage ฝั่งหน้าเว็บ)
 */
export const bookingAdminApi = {
  /**
   * รายการการจอง
   * @param {string} key
   * @param {{date?: string, status?: string, limit?: number}} params
   *   date   = 'YYYY-MM-DD' (ว่าง = ทุกวัน) · status = ว่าง = ทุกสถานะ
   * @returns {Promise<{ok: true, bookings: object[], total: number}>}
   */
  list: (key, params = {}) => {
    const { date = '', status = '', limit = 200 } = params || {};
    return invoke({ action: 'list', date: date || '', status: status || '', limit }, key);
  },

  /**
   * ยืนยันการจ่ายเงินด้วยมือ (ร้านกดเอง)
   * @param {string} key
   * @param {{code: string, amount?: number}} params
   *   amount = ยอดที่ต้องโอน **หน่วยสตางค์** (เช่น 30037)
   *   ถ้าไม่ส่ง = ยืนยันแบบไม่ตรวจยอด (ร้านเช็คบัญชีเองแล้ว)
   *   ถ้าส่งแล้วไม่ตรงกับ pay_amount → 400 AMOUNT_MISMATCH
   */
  confirm: (key, params = {}) => {
    const { code, amount } = params || {};
    const body = { action: 'confirm', code: String(code || '').trim().toUpperCase() };
    if (amount !== undefined && amount !== null && amount !== '') body.amount = amount;
    return invoke(body, key);
  },

  /**
   * ปฏิเสธ/ยกเลิกการจอง
   * @param {string} key
   * @param {{code: string, reason?: string}} params
   */
  reject: (key, params = {}) => {
    const { code, reason } = params || {};
    return invoke(
      { action: 'reject', code: String(code || '').trim().toUpperCase(), reason: String(reason || '').slice(0, 300) },
      key,
    );
  },

  /**
   * สรุปยอดวันนี้ + จำนวนสลีปที่รอตรวจ
   * @param {string} key
   * @returns {Promise<{ok: true, stats: object}>}
   */
  stats: (key) => invoke({ action: 'stats' }, key),
};

export default bookingAdminApi;
