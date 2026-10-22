import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, RefreshCw, TriangleAlert, Phone, Image as ImageIcon, CheckCircle2, Loader2, UserRound } from 'lucide-react';
import { fmtDay, confirmDialog, alertDialog } from '../components/ui';
import { getOwnerPass } from '../lib/auth';
import { bookingAdminApi } from '../lib/bookingAdminApi';
import { onBookingsChanged } from '../lib/bookingRealtime';
import { useAdminBookings } from './hooks';
import { toNum, payBahtOf, slipState, fmtBaht, fmtTimeBkk } from './bookingUtils';
import BookingStatusBadge from './BookingStatusBadge';
import BookingPayBadge from './BookingPayBadge';
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

/* ══════════════════════════════════════════════════════════════════
   การ์ดจองผสานในการ์ด "บิลที่เปิดอยู่"
   — โครงการ์ดเดียวกับ ob-card (บิลหน้าร้าน: avatar / ชื่อ / แถวบริการ /
     แถวยอด) ให้อ่านเป็นกลุ่มบิลเปิดเดียวกัน
   — แต่แยกลักษณะชัด: เส้นประน้ำตาล + avatar เป็นไอคอนปฏิทิน + ป้าย
     "บิลจอง" — สายตาแยกได้ทันทีว่าใบไหนจอง / ใบไหนลูกค้าหน้าร้าน
   ══════════════════════════════════════════════════════════════════ */
function BookingOpenCard({ b, onOpenSlip, onDone, busy }) {
  const slip = slipState(b);
  const when = b?.slot_start ? fmtTimeBkk(b.slot_start) : '';
  const until = b?.slot_end ? fmtTimeBkk(b.slot_end) : '';
  const price = toNum(b?.amount) || 0;
  const payBaht = payBahtOf(b);
  return (
    <article className="ob-card bkc">
      <div className="ob-head">
        <span className="ob-ava" aria-hidden="true"><CalendarCheck size={19} strokeWidth={2} /></span>
        <span className="ob-who">
          <b>{b?.customer_name || 'ไม่ระบุชื่อ'}<span className="bkc-pill">บิลจอง</span></b>
          <span className="muted num">
            {fmtDay(b?.slot_date) || 'ไม่ระบุวันที่'}
            {when ? ` · ${when}` : ''}{until ? `–${until}` : ''}
            {/* หมอผู้บริการ = pill แยกตา (คำขอผู้ใช้) */}
            {b?.therapist_name && (
              <> ·{' '}
                <span className="bkc-doc-pill" title="หมอผู้ให้บริการ">
                  <UserRound size={10} strokeWidth={2.4} />
                  {String(b.therapist_name).startsWith('หมอ') ? b.therapist_name : `หมอ ${b.therapist_name}`}
                </span>
              </>
            )}
            {b?.customer_phone && (
              <> · <a href={`tel:${b.customer_phone}`} style={{ color: 'inherit' }}><Phone size={10} strokeWidth={2.2} /> <span className="num">{b.customer_phone}</span></a></>
            )}
          </span>
        </span>
        <BookingStatusBadge status={b?.status} />
      </div>
      <div className="ob-rows">
        <div className="ob-row">
          <span className="ob-time muted">{when}{until ? `–${until}` : ''}</span>
          <span className="ob-name">{b?.service_name || '—'}</span>
          <b className="ob-price">{fmtBaht(price)}</b>
        </div>
      </div>
      <div className="ob-total">
        <span className="ob-sum">
          <span className="ob-grand">{fmtBaht(price)}</span>
          <span className="muted">ต้องโอน <span className="num">{payBaht !== null ? fmtBaht(payBaht) : '—'}</span></span>
        </span>
        <span className="ob-btns">
          <BookingPayBadge status={b?.payment_status} />
          {/* รับบริการเสร็จ → เดอร์ย้ายไปแท็บ "ประวัติบิล" (คำขอผู้ใช้) */}
          {onDone && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onDone(b)}
              disabled={busy}
              title="กดเมื่อลูกค้ารับบริการเสร็จแล้ว — เดอร์จะย้ายไปแท็บ ประวัติบิล"
              aria-label={`ยืนยันว่าได้รับบริการเสร็จ แล้วย้ายเดอร์ ${b?.code || ''} ไปประวัติบิล`}
            >
              {busy
                ? <Loader2 size={13} strokeWidth={1.9} className="spin" />
                : <CheckCircle2 size={13} strokeWidth={1.9} />}
              รับบริการเสร็จ
            </button>
          )}
          {slip !== 'none' && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onOpenSlip(b)}
              aria-label={`ดูสลีปของเดอร์ ${b?.code || ''}`}
            >
              {slip === 'verified' ? <CheckCircle2 size={13} strokeWidth={1.9} /> : <ImageIcon size={13} strokeWidth={1.9} />}
              ดูสลีป
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

export default function BookingBillsSection({ data, onActiveCount, dayFilter }) {
  const key = getOwnerPass(data?.ownerPass);
  const [authErr, setAuthErr] = useState('');
  const [slipView, setSlipView] = useState(null);
  // เดอร์ที่กำลังกด "รับบริการเสร็จ" อยู่ (รหัสจอง) — ปุ่มกันกดซ้ำ
  const [busyCode, setBusyCode] = useState('');

  const handleUnauthorized = useMemo(() => () => {
    setAuthErr('รหัสเจ้าของร้านไม่ถูกต้อง — ให้เจ้าของร้านตรวจสอบรหัสผ่านในหน้า "จัดการร้าน" แล้วลองใหม่');
  }, []);

  /* ปุ่ม "รับบริการเสร็จ" บนการ์ดจอง — ยืนยันแล้วตั้งสถานะ completed
     เดอร์หายจากกลุ่มนี้ทันที (realtime + โหลดใหม่เองด้วย) และไปโผล่ในแท็บ "ประวัติบิล" */
  const doComplete = async (b) => {
    const go = await confirmDialog({
      title: 'รับบริการเสร็จแล้ว?',
      message: `${b?.customer_name || 'ลูกค้า'} · ${b?.service_name || 'บริการ'} ${b?.slot_date || ''} — เดอร์นี้จะย้ายไปแท็บ "ประวัติบิล"`,
      confirmLabel: 'จบบริการ',
    });
    if (!go) return;
    setBusyCode(b?.code || '');
    try {
      await bookingAdminApi.complete(key, { code: b?.code });
      await loadData({ silent: true });
    } catch (e) {
      if (e?.code === 'UNAUTHORIZED' || e?.status === 401) handleUnauthorized();
      else alertDialog({ title: 'ทำไม่สำเร็จ', message: e?.message || 'กรุณาลองใหม่อีกครั้ง' });
    } finally {
      setBusyCode('');
    }
  };

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

  const openAll = useMemo(
    () => filtered.filter((b) => OPEN_STATUSES.includes(b?.status)),
    [filtered],
  );
  // เลือกวันอยู่ (แถบเลือกวันของการ์ด "บิลที่เปิดอยู่") → กรองเหลือวันนั้น
  const open = useMemo(
    () => (dayFilter
      ? openAll.filter((b) => String(b?.slot_date || '').slice(0, 10) === dayFilter)
      : openAll),
    [openAll, dayFilter],
  );

  /* รายงานจำนวนขึ้นหน้า — badge แท็บ "บิลที่เปิดอยู่" + hint หัวการ์ดรวมคิดกัน
     (นับตามที่โชว์จริง: เลือกวันอยู่ = นับวันนั้น) */
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
            <BookingOpenCard
              key={b.code}
              b={b}
              onOpenSlip={setSlipView}
              onDone={doComplete}
              busy={busyCode === b.code}
            />
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
