// ══════════════════════════════════════════════════════════════════════════
// เดอร์ "ลูกค้าจอง" (จากเว็บจอง · จบบริการแล้ว status=completed)
// → แปลงเป็น "บิลเสมือน" รูปเดียวกับ data.bills เพื่อคำนวณรายได้ + ค่าแรงหมอ
//   ด้วยฟังก์ชันกลาง (billTotal / billLinesOf) ที่ทุกหน้าใช้อยู่แล้ว
//   (คำขอผู้ใช้ 23 ต.ค. 2026 — "เอาบิลที่ลูกค้าจอง คำนวนรายได้ ค่าแรงหมอ ด้วย")
//
// กติกา:
//   · นับเฉพาะสถานะ completed (รับบริการเสร็จจริง) — ค้างคิว/ยกเลิก/หมดอายุไม่นับ
//   · ราคาจาก bookings.amount (บาท) · ส่วนลด 0 · ค่าน้ำมัน 0
//   · หมอ: ใช้ therapist_id ถ้ามี ไม่งั้นหาจากชื่อใน data.therapists (ตัด 'หมอ '
//     และช่องว่างเทียบ) — หาไม่เจอ = ถือเป็นหมอวิ่งตาม isFreelance
//   · บริการ: จับคู่ data.services ด้วยชื่อ (ชื่อไทย svcLabel หรือ name) เพื่อ
//     ได้อัตราค่าแรงร้าน (flatRate/flatAmount) — ไม่เจอ = ค่าแรง 0 (ยอดยังนับ)
//   · หน้าที่ฉีดเข้าการคำนวณ: PageDashboard, PageCommission
//     (ผ่าน dataWithBookingBills — data.bills จริงใน state ไม่ถูกแตะ)
// ══════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { svcLabel } from './billing';
import { bookingAdminApi } from './bookingAdminApi';
import { onBookingsChanged } from './bookingRealtime';

/** เทียบชื่อแบบ tolerant ช่องว่าง/ตัวใหญ่เล็ก */
const normName = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

/** จับคู่บริการในร้านด้วยชื่อ → ได้ id (สำหรับอัตราค่าแรง) — ไม่เจอ = null */
function findServiceId(services, name) {
  const n = normName(name);
  return (services || []).find((s) => normName(svcLabel(s)) === n || normName(s?.name) === n)?.id || null;
}

/** จับคู่หมอ: id ตรงจาก booking ได้เลย · ไม่งั้นหาจากชื่อ (ตัดคำว่า หมอ ออก) */
function findTherapistId(therapists, tid, name) {
  if (tid) return tid;
  const n = normName(String(name || '').replace(/หมอ/g, ''));
  if (!n) return null;
  return (therapists || []).find((t) => normName(t?.name).replace(/หมอ/g, '') === n)?.id || null;
}

/**
 * เดอร์จอง 1 รายการ → บิลเสมือน (รูปเดียวกับบิลหน้าร้าน)
 * ใช้กับฟังก์ชันกลางที่รวมยอด/ค่าแรงของทุกหน้า
 */
export function bookingToBill(b, services, therapists) {
  const price = Number(b?.amount) || 0;
  return {
    id: `BK-${b?.code || b?.id || ''}`,
    // slot เป็น timestamptz (UTC) — bizDateOf ตัดตี 3 ให้เอง ตรงกับบิลหน้าร้าน
    date: b?.slot_start || b?.slot_date || '',
    createdAt: b?.created_at || '',
    customer: b?.customer_name || 'ลูกค้าจอง',
    status: 'paid', // จบบริการ = บิลเสร็จสมบูรณ์ (ลูกค้าจ่ายล่วงหน้าเต็มจำนวน)
    paymentMethod: 'จองออนไลน์',
    discount: 0,
    fuel: 0,
    booking: true, // ติดป้าย — กันหน้าไหนสับสนว่าเป็นบิลเก็บเองใน state หลัก
    items: [{
      serviceId: findServiceId(services, b?.service_name),
      serviceName: b?.service_name || 'บริการจากเว็บจอง',
      price,
      qty: 1,
      therapistId: findTherapistId(therapists, b?.therapist_id, b?.therapist_name),
      therapistName: b?.therapist_name || '',
      bookingCode: b?.code || '',
    }],
  };
}

/**
 * เดอร์จองที่จบบริการทั้งหมด → แถวบิลเสมือน (เรียงเก่า → ใหม่ตามเวลาสล็อต)
 * @param {object[]} bookings  ผลจาก bookingAdminApi.list (ดิบ)
 * @param {object[]} services  data.services
 * @param {object[]} therapists data.therapists
 */
export function bookingBillsOf(bookings, services, therapists) {
  return (bookings || [])
    .filter((b) => b && b.status === 'completed')
    .map((b) => bookingToBill(b, services, therapists))
    .sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')));
}

/**
 * ฉีดบิลเสมือนลง data แบบชั่วคราวสำหรับการคำนวณ — data.bills จริงไม่ถูกแตะ
 * ใช้: buildMonthReport(dataWithBookingBills(data, bookings), month)
 * @returns {object} สำเนา data ที่ bills รวมบิลจองแล้ว
 */
export function dataWithBookingBills(data, bookings) {
  const d = data || {};
  const virtual = bookingBillsOf(bookings, d.services, d.therapists);
  if (virtual.length === 0) return d;
  return { ...d, bills: [...(d.bills || []), ...virtual] };
}

/**
 * hook ดึงเดอร์จองที่จบบริการ (สด + รีเฟรชตาม realtime ของระบบจอง)
 * ใช้ในหน้าที่คำนวณรายได้/ค่าแรง (PageDashboard, PageCommission)
 * @param {string} ownerKey รหัสเจ้าของร้าน (x-admin-key) — ไม่มี = ไม่ดึง
 */
export function useCompletedBookings(ownerKey) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(Boolean(ownerKey));
  useEffect(() => {
    if (!ownerKey) {
      setBookings([]);
      setLoading(false);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    const load = async () => {
      try {
        const res = await bookingAdminApi.list(ownerKey, { status: 'completed', limit: 200 });
        if (alive) setBookings(res?.bookings || []);
      } catch {
        /* ดึงไม่ได้ = ไม่บวกบิลจอง (หน้ายังคิดบิลหน้าร้านปกติ) */
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    // ร้านกดจบบริการจากเครื่องอื่น → ยอดภาพรวม/ค่าแรงอัปเดตเอง
    const off = onBookingsChanged(() => load());
    return () => { alive = false; off?.(); };
  }, [ownerKey]);
  return { bookings, loading };
}
