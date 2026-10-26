import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, RefreshCw, TriangleAlert, CheckCircle2 } from 'lucide-react';
import { PageHeader, alertDialog } from '../components/ui';
import { getOwnerPass } from '../lib/auth';
import { onBookingsChanged, useRealtimeStatus } from '../lib/bookingRealtime';
import { bkkToday } from '../utils/bkk';
import { useAdminBookings, useAdminDecision } from './hooks';
import { findBillClashOfBooking } from './bookingUtils';
import BookingFilters from './BookingFilters';
import BookingQueueTable from './BookingQueueTable';
import BookingKpi from './BookingKpi';
import BookingList from './BookingList';
import { ConfirmTransferDialog, RejectBookingDialog, SlipViewerDialog } from './BookingDialogs';

/* ══════════════════════════════════════════════════════════════════
   หน้าจัดการการจองออนไลน์ (ฝั่งเจ้าของร้าน)
   — ไม่มีหน้า login ซ้ำ: ใช้รหัสเจ้าของร้านตัวเดียวกับตอนเข้าระบบ POS
     (Edge Function booking-admin ยอมรับรหัสนี้เป็น admin key)
   ══════════════════════════════════════════════════════════════════ */
export default function BookingPage({ data }) {
  /* รหัสเจ้าของร้าน (ค่าเดียวกับตอน login เข้าแอป POS) ใช้เป็น admin key */
  const key = getOwnerPass(data?.ownerPass);

  const [toast, setToast] = useState('');
  const [authErr, setAuthErr] = useState('');
  // สถานะช่องรีอัลไทม์ — subtitle/ข้อความท้ายหน้าบอกผู้ใช้ให้ตรงความจริง
  const rt = useRealtimeStatus();

  /* ตัวกรอง */
  const [date, setDate] = useState(() => bkkToday());
  const [allDates, setAllDates] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');

  /* กล่องยืนยัน/ปฏิเสธ/ดูสลีป — อยู่ใน hook (useAdminDecision) */
  const loadDataRef = useRef(null);

  /* 401 = รหัสเจ้าของร้านไม่ตรงกับที่ server ตั้งไว้ */
  const handleUnauthorized = useMemo(() => () => {
    setAuthErr('รหัสเจ้าของร้านไม่ถูกต้อง — ให้เจ้าของร้านตรวจสอบรหัสผ่านในหน้า "จัดการร้าน" แล้วลองใหม่');
  }, []);

  const {
    dialog, setDialog, dialogBusy, dialogErr, mismatch, slipView, setSlipView, busy,
    openConfirm, doConfirm, openReject, doReject,
  } = useAdminDecision({ keyValue: key, setToast, onUnauthorized: handleUnauthorized, loadDataRef });

  /* กันเวลาทับ: หมอคนเดียวกัน (เทียบชื่อ) มีบิลหน้าร้านสถานะ "เปิดอยู่" ที่ช่วงเวลาทับ
     กับสล็อตเดอร์จอง → ไม่เปิดกล่องยืนยัน แจ้งให้ตรวจสอบก่อน
     (ส่วนใหญ่แปลว่าร้านเปิดบิลหน้าร้านรับลูกค้าจองคนนี้ไปแล้ว — ควรปฏิเสธเดอร์จองแทน) */
  const handleConfirmClick = (b) => {
    const clash = findBillClashOfBooking(b, data?.bills || [], data?.therapists || []);
    if (clash) {
      const endTxt = clash.endTime ? `–${clash.endTime}` : '';
      alertDialog({
        title: 'ช่วงเวลาทับกับบิลหน้าร้าน',
        message: `หมอ ${b?.therapist_name || '—'} มีบิลหน้าร้านเปิดอยู่เวลา ${clash.startTime}${endTxt} ที่ทับกับเดอร์จอง ${b?.code} — ถ้าลูกค้าเข้าบริการผ่านบิลหน้าร้านนั้นแล้ว ให้ปฏิเสธเดอร์จองแทนการยืนยัน`,
      });
      return;
    }
    openConfirm(b);
  };

  const {
    total, stats, loading, refreshing, error, loadData, filtered, grouped,
  } = useAdminBookings({
    keyValue: key,
    date,
    allDates,
    statusFilter,
    query,
    // เปิดกล่องอยู่ → ห้ามรีโหลดอัตโนมัติ
    paused: busy,
    onUnauthorized: handleUnauthorized,
    loadDataRef,
  });

  /* เรียลไทม์: เดอร์จองเปลี่ยนฝั่ง server → โหลดใหม่ทันที (นอกจาก polling 15 วิ)
     งดตอนเปิดกล่องยืนยัน/ปฏิเสธ/ดูสลีป กันข้อมูลรีเซ็ตกลางกล่อง — ใช้ ref อ่านค่าล่าสุด */
  const busyGuardRef = useRef(false);
  busyGuardRef.current = Boolean(dialog || dialogBusy);
  useEffect(() => onBookingsChanged(() => {
    if (!busyGuardRef.current) loadData({ silent: true });
  }), [loadData]);

  /* toast หายไปเอง */
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /* ══════════════════════════════════════════════════════════════════
     หน้าหลัก — รายการการจอง (ไม่ต้องล็อกซ้ำ ใช้รหัสเจ้าของร้านตัวเดียวกับตอนเข้าระบบ)
     ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="bk-adm">
      <PageHeader
        icon={CalendarCheck}
        title="จองออนไลน์"
        subtitle={`ยืนยันหรือปฏิเสธการจองที่ลูกค้าทำผ่านเว็บไซต์ — ${rt === 'connected' ? 'ข้อมูลอัปเดตทันทีแบบเรียลไทม์' : 'ระบบรีโหลดอัตโนมัติทุก 15 วินาที'}`}
        actions={(
          <button
            type="button"
            className="icon-btn"
            onClick={() => loadData({ silent: true })}
            disabled={refreshing}
            aria-label="รีเฟรชข้อมูล"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={15} strokeWidth={1.8} className={refreshing ? 'spin' : ''} />
          </button>
        )}
      />

      {authErr && (
        <div className="err-banner" role="alert">
          <TriangleAlert size={16} strokeWidth={1.8} className="eic" />
          <div>{authErr}</div>
        </div>
      )}

      {loading ? (
        <div className="bk-adm-loading">
          <div className="loadbar" role="status" aria-label="กำลังโหลดข้อมูลการจอง"><i /></div>
        </div>
      ) : (
        <>
          {error && (
            <div className="err-banner" role="alert">
              <TriangleAlert size={16} strokeWidth={1.8} className="eic" />
              <div>
                <div>{error}</div>
                <button type="button" className="btn btn-ghost btn-sm mt8" onClick={() => loadData()}>
                  <RefreshCw size={14} strokeWidth={1.8} /> ลองใหม่
                </button>
              </div>
            </div>
          )}

          {/* ---------- KPI: ที่ต้องทำตอนนี้ + สรุปวันนี้ ---------- */}
          <BookingKpi stats={stats} />

          {/* ---------- ตัวกรอง ---------- */}
          <BookingFilters
            date={date}
            allDates={allDates}
            statusFilter={statusFilter}
            query={query}
            onDateChange={(v) => { setAllDates(false); setDate(v || bkkToday()); }}
            onToggleAllDates={() => setAllDates((v) => !v)}
            onStatusChange={setStatusFilter}
            onQueryChange={setQuery}
          />

          {/* ---------- ตารางคิวตามเวลา (เดอร์เรียงเช้าไปค่ำ) ---------- */}
          <BookingQueueTable filtered={filtered} allDates={allDates} />

          {/* ---------- รายการการจอง ---------- */}
          <BookingList
            filtered={filtered}
            total={total}
            grouped={grouped}
            query={query}
            onRefresh={loadData}
            busy={dialogBusy}
            onConfirm={handleConfirmClick}
            onReject={openReject}
            onOpenSlip={setSlipView}
          />

          <p className="bk-adm-foot-note">
            <span className={`rt-dot${rt === 'connected' ? ' rt-on' : rt === 'down' ? ' rt-off' : ''}`} aria-hidden="true" />
            {rt === 'connected'
              ? 'ข้อมูลอัปเดตทันทีแบบเรียลไทม์'
              : (rt === 'down' ? 'ระบบรีโหลดอัตโนมัติทุก 15 วินาที (ช่องเรียลไทม์หลุดชั่วคราว)' : 'ระบบรีโหลดอัตโนมัติทุก 15 วินาที')}
            {' — หน้านี้สำหรับเจ้าของร้านเท่านั้น'}
          </p>
        </>
      )}

      {/* ---------- กล่องยืนยัน/ปฏิเสธ ---------- */}
      {dialog?.kind === 'confirm' && (
        <ConfirmTransferDialog
          key={`cf-${dialog.booking?.code}`}
          booking={dialog.booking}
          busy={dialogBusy}
          error={dialogErr}
          mismatch={mismatch}
          onCancel={() => setDialog(null)}
          onSubmit={doConfirm}
          onForce={() => doConfirm({ amount: null })}
        />
      )}
      {dialog?.kind === 'reject' && (
        <RejectBookingDialog
          key={`rj-${dialog.booking?.code}`}
          booking={dialog.booking}
          busy={dialogBusy}
          error={dialogErr}
          onCancel={() => setDialog(null)}
          onSubmit={doReject}
        />
      )}

      {/* ---------- ดูสลีปขนาดเต็ด ---------- */}
      {slipView && <SlipViewerDialog booking={slipView} onClose={() => setSlipView(null)} />}

      {/* ---------- toast ---------- */}
      {toast && (
        <div className="toast-wrap">
          <div className="toast" role="status" aria-live="polite">
            <CheckCircle2 size={15} strokeWidth={1.8} /> {toast}
          </div>
        </div>
      )}
    </div>
  );
}
