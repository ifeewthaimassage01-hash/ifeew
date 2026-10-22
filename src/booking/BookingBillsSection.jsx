import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { getOwnerPass } from '../lib/auth';
import { onBookingsChanged } from '../lib/bookingRealtime';
import { useAdminBookings } from './hooks';
import BookingCard from './BookingCard';
import { SlipViewerDialog } from './BookingDialogs';

/* ══════════════════════════════════════════════════════════════════
   กลุ่ม "ลูกค้าจอง" ในการ์ด "บิลที่เปิดอยู่" (เสียบเป็น children ของ
   OpenBillsSection — 22 ต.ค. 2026)

   การจองออนไลน์จากเว็บลูกค้า นับเป็นบิลที่เปิดอยู่เช่นเดียวกับบิลของ
   ลูกค้าหน้าร้าน แค่แยกกลุ่มด้วยป้าย — สถานะที่ "เปิดอยู่":
     · pending (รอยืนยัน) · confirmed (ยืนยันแล้ว ยังไม่เข้ารับบริการ)
     · cancel_requested (รอคืนเงิน)
   ยกเลิก/หมดอายุ = บิลปิด ไปดูที่หน้า "จัดการการจอง"
   — อ่านอย่างเดียว: ไม่มีปุ่มยืนยัน/ปฏิเสธ (action ยังอยู่หน้าจัดการการจอง)
   ══════════════════════════════════════════════════════════════════ */

/** สถานะที่ถือว่าเป็น "บิลเปิด" อยู่ (สอดคล้อง isTodoBooking + confirmed) */
const OPEN_STATUSES = ['pending', 'confirmed', 'cancel_requested'];

export default function BookingBillsSection({ data, onActiveCount }) {
  const key = getOwnerPass(data?.ownerPass);
  const [authErr, setAuthErr] = useState('');
  const [slipView, setSlipView] = useState(null);

  const handleUnauthorized = useMemo(() => () => {
    setAuthErr('รหัสเจ้าของร้านไม่ถูกต้อง — ให้เจ้าของร้านตรวจสอบรหัสผ่านในหน้า "จัดการร้าน" แล้วลองใหม่');
  }, []);

  const { filtered, loading, refreshing, error, loadData } = useAdminBookings({
    keyValue: key,
    // ไม่ใช้ตัวกรองวันสถานะ — เดอร์จองถือเป็นบิลเปิดจนกว่าจะยืนยัน/ยกเลิก จึงกวาดทุกวัน
    date: '',
    allDates: true,
    statusFilter: '',
    query: '',
    // เปิดกล่องดูสลีปอยู่ → งดรีโหลดอัตโนมัติ
    paused: Boolean(slipView),
    onUnauthorized: handleUnauthorized,
  });

  const open = useMemo(
    () => filtered.filter((b) => OPEN_STATUSES.includes(b?.status)),
    [filtered],
  );

  /* รายงานจำนวนขึ้นหน้า — badge แท็บ "บิลที่เปิดอยู่" + hint หัวการ์ดรวมคิดกัน */
  useEffect(() => {
    onActiveCount?.(open.length);
  }, [open.length, onActiveCount]);

  /* เรียลไทม์: เดอร์จองเปลี่ยนฝั่ง server (มีคนจองใหม่/จ่ายเงิน/ร้านยืนยันฯ) → โหลดใหม่ทันที
     (งดตอนเปิดกล่องดูสลีป · polling 15 วิ ยังทำงานตามเดิมเป็นเฟลบแค็ก) */
  const slipOpenRef = useRef(false);
  slipOpenRef.current = Boolean(slipView);
  useEffect(() => onBookingsChanged(() => {
    if (!slipOpenRef.current) loadData({ silent: true });
  }), [loadData]);

  if (!key) {
    return (
      <p className="muted" style={{ fontSize: 13, margin: '0 0 2px' }}>
        ลูกค้าจอง — ยังไม่ได้ตั้งรหัสเจ้าของร้าน จึงดึงการจองจากเว็บไม่ได้
      </p>
    );
  }

  return (
    <>
      <div className="bk-sep-label">
        <CalendarCheck size={14} strokeWidth={1.9} style={{ color: 'var(--brown)', flexShrink: 0 }} />
        <b>ลูกค้าจอง</b>
        <span className="muted num" style={{ fontSize: 12 }}>
          {open.length} รายการ{refreshing ? ' · กำลังรีเฟรช…' : ''}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 12 }}
          onClick={() => loadData()}
          disabled={refreshing}
        >
          <RefreshCw size={13} strokeWidth={1.8} /> รีเฟรช
        </button>
      </div>

      {authErr ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
          <TriangleAlert size={14} style={{ flexShrink: 0 }} /> {authErr}
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
          <TriangleAlert size={14} style={{ flexShrink: 0 }} /> โหลดรายการจองไม่สำเร็จ — {error}
        </div>
      ) : loading ? (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 4px' }}>กำลังโหลดการจอง…</p>
      ) : open.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: '0 0 4px' }}>ไม่มีการจองจากเว็บที่เปิดอยู่</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {open.map((b) => (
            <BookingCard key={b.code} b={b} onOpenSlip={setSlipView} />
          ))}
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, margin: '6px 0 2px' }}>
        รายการจองอัปเดตเองทุก 15 วินาที · ยืนยัน/ปฏิเสธที่หน้า “จัดการการจอง”
      </p>

      <SlipViewerDialog booking={slipView} onClose={() => setSlipView(null)} />
    </>
  );
}
