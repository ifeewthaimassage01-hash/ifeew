import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, RefreshCw, TriangleAlert, Phone, Image as ImageIcon, CheckCircle2, Loader2, UserRound, Users } from 'lucide-react';
import { fmtDay, alertDialog, Modal } from '../components/ui';
import { getOwnerPass } from '../lib/auth';
import { bookingAdminApi } from '../lib/bookingAdminApi';
import { onBookingsChanged, useRealtimeStatus } from '../lib/bookingRealtime';
import { useAdminBookings } from './hooks';
import { toNum, slipState, fmtBaht, fmtTimeBkk } from './bookingUtils';
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

/* ══════════════════════════════════════════════════════════════════
   กล่องจบบริการ — เลือกหมอผู้ให้บริการก่อนบันทึก (คำขอผู้ใช้ 24 ต.ค. 2569)
   แตะชื่อหมอเดียว = บันทึกจบบริการทันที (ไม่ต้องยืนยันซ้ำ)
   ══════════════════════════════════════════════════════════════════ */
function CompleteTherapistDialog({ booking, therapists, finishingName, onFinish, onClose }) {  const busy = finishingName != null;
  return (
    <Modal onClose={busy ? () => {} : onClose}>
      <h3>จบบริการ</h3>
      <p className="bk-adm-dlg-sub">
        เดอร์ <b className="num">{booking?.code}</b>
        {booking?.customer_name ? <> · {booking.customer_name}</> : null}
        {booking?.service_name ? <> · {booking.service_name}</> : null}
      </p>

      <p className="bk-fin-label" id="bk-fin-label">
        <Users size={13} strokeWidth={1.9} /> หมอผู้ให้บริการ — แตะชื่อเพื่อบันทึกจบบริการ
      </p>
      <div className="bk-fin-list" aria-labelledby="bk-fin-label">
        {therapists.length === 0 && (
          <p className="bk-adm-dlg-hint" style={{ margin: '0 0 2px' }}>
            ยังไม่มีรายชื่อหมอในหน้า "จัดการร้าน"
          </p>
        )}
        {therapists.map((t) => {
          const nm = String(t?.name || '').trim();
          if (!nm) return null;
          return (
            <button key={t?.id ?? nm} type="button" className="bk-fin-opt" disabled={busy} onClick={() => onFinish(nm)}>
              <span className="bk-fin-ava" aria-hidden="true"><UserRound size={15} strokeWidth={2} /></span>
              <b>{nm}</b>
              {finishingName === nm
                ? <Loader2 size={15} strokeWidth={1.9} className="spin" aria-label="กำลังบันทึก" />
                : <CheckCircle2 size={15} strokeWidth={1.8} className="bk-fin-ghost" />}
            </button>
          );
        })}
        {/* ไม่บันทึกชื่อหมอก็จบได้ (คันเกียร์เสริม — กรณี list ยังไม่มีชื่อ) */}
        <button type="button" className="bk-fin-opt bk-fin-none" disabled={busy} onClick={() => onFinish('')}>
          จบบริการโดยไม่ระบุหมอ
        </button>
      </div>

      <div className="modal-row">
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={onClose}>
          ยกเลิก
        </button>
      </div>
    </Modal>
  );
}

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
  return (
    <article className="ob-card bkc">
      <div className="ob-head">
        <span className="ob-ava" aria-hidden="true"><CalendarCheck size={19} strokeWidth={2} /></span>
        <span className="ob-who">
          <b>{b?.customer_name || 'ไม่ระบุชื่อ'}<span className="bkc-pill">บิลจอง</span></b>
          <span className="muted num">
            {fmtDay(b?.slot_date) || 'ไม่ระบุวันที่'}
            {/* เวลาอยู่คอลัมน์แถวบริการด้านล่าง (จุดเดียว ไม่ซ้ำหัวการ์ด) */}
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
          {/* ราคาแสดงที่เดียวที่ยอดด้านล่าง (การ์ดจอง 1 แถว ไม่ต้องซ้ำ per-row เหมือนบิลหลายแถว) */}
        </div>
      </div>
      <div className="ob-total">
        <span className="ob-sum">
          <span className="ob-grand">{fmtBaht(price)}</span>
          {/* สถานะจ่าย/ยังไม่จ่าย = ป้ายชำระเงินด้านขวา (ไม่ซ้ำบรรทัด "ต้องโอน") */}
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

export default function BookingBillsSection({ data, onActiveCount, onDayCounts, dayFilter }) {
  const key = getOwnerPass(data?.ownerPass);
  const [authErr, setAuthErr] = useState('');
  const [slipView, setSlipView] = useState(null);
  // เดอร์ที่กำลังกด "รับบริการเสร็จ" อยู่ (รหัสจอง) — ปุ่มกันกดซ้ำ
  const [busyCode, setBusyCode] = useState('');
  // สถานะช่องรีอัลไทม์ — โชว์จุดเขียว/ส้ม บอกผู้ใช้ว่า "อัปเดตทันที" หรือรอบสำรอง 15 วิ
  const rt = useRealtimeStatus();

  const handleUnauthorized = useMemo(() => () => {
    setAuthErr('รหัสเจ้าของร้านไม่ถูกต้อง — ให้เจ้าของร้านตรวจสอบรหัสผ่านในหน้า "จัดการร้าน" แล้วลองใหม่');
  }, []);

  /* กด "รับบริการเสร็จ" → เลือกหมอผู้ให้บริการก่อนบันทึก (คำขอผู้ใช้ 24 ต.ค. 2569)
     การจองจากเว็บไม่ผูกหมอล่วงหน้า — หมอจริงถูกบันทึกตอนจบบริการนี้
     เดอร์บันทึกสำเร็จจะย้ายไปแท็บ "ประวัติบิล" (realtime + โหลดใหม่เองด้วย) */
  const [finishOf, setFinishOf] = useState(null);        // เดอร์ที่กำลังจะจบ (เปิดกล่องเลือกหมอ)
  const [finishingName, setFinishingName] = useState(null); // ชื่อหมอที่กำลังบันทึกอยู่ (spinner ต่อแถว)

  const finishWith = async (b, name) => {
    setFinishingName(name || '__none__');
    setBusyCode(b?.code || '');
    try {
      await bookingAdminApi.complete(key, { code: b?.code, therapist: name || '' });
      await loadData({ silent: true });
      setFinishOf(null);
    } catch (e) {
      setFinishOf(null);
      if (e?.code === 'UNAUTHORIZED' || e?.status === 401) handleUnauthorized();
      else alertDialog({ title: 'ทำไม่สำเร็จ', message: e?.message || 'กรุณาลองใหม่อีกครั้ง' });
    } finally {
      setFinishingName(null);
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

  /* จำนวนจองเปิดรายวัน (ทุกวันใน strip ถัดไป) → pill บนชิปเลือกวัน
     "วันไหนมีจองบ้าง" (คำขอผู้ใช้ 23 ต.ค. 2026) — นับจาก openAll ตัวเดียวกัน */
  const dayCounts = useMemo(() => {
    const m = {};
    openAll.forEach((b) => {
      const d = String(b?.slot_date || '').slice(0, 10);
      if (d) m[d] = (m[d] || 0) + 1;
    });
    return m;
  }, [openAll]);
  useEffect(() => {
    onDayCounts?.(dayCounts);
  }, [dayCounts, onDayCounts]);

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
              onDone={setFinishOf}
              busy={busyCode === b.code}
            />
          ))}
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, margin: '6px 0 2px' }}>
        {/* สถานะช่องรีอัลไทม์จริง: เขียว = เหตุการณ์ตอนนี้ทันที · ส้ม = ช่องตก ใช้รอบ 15 วิ สำรอง */}
        <span className={`rt-dot${rt === 'connected' ? ' rt-on' : rt === 'down' ? ' rt-off' : ''}`} aria-hidden="true" />
        {rt === 'connected'
          ? 'อัปเดตทันทีแบบเรียลไทม์'
          : (rt === 'down'
            ? 'รายการจองอัปเดตเองทุก 15 วินาที (ช่วงนี้ช่องเรียลไทม์หลุด — ใช้รอบสำรอง)'
            : 'รายการจองอัปเดตเองทุก 15 วินาที')}
        {' · ยืนยัน/ปฏิเสธที่หน้า “จัดการการจอง”'}
      </p>

      <SlipViewerDialog booking={slipView} onClose={() => setSlipView(null)} />

      {/* เลือกหมอผู้ให้บริการก่อนจบบริการ (คำขอผู้ใช้ 24 ต.ค. 2569) */}
      {finishOf && (
        <CompleteTherapistDialog
          booking={finishOf}
          therapists={(data?.therapists || []).filter((t) => t?.active !== false)}
          finishingName={finishingName}
          onFinish={(name) => finishWith(finishOf, name)}
          onClose={() => setFinishOf(null)}
        />
      )}
    </>
  );
}
