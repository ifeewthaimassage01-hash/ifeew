import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, RefreshCw, TriangleAlert, Image as ImageIcon, CheckCircle2, Loader2, UserRound, Users, ChevronUp, ChevronDown, ChevronRight, Clock, Pencil, Trash2 } from 'lucide-react';
import { alertDialog, Modal, formatDuration } from '../components/ui';
import { bkkMinutes, bkkToday } from '../utils/bkk';
import { getOwnerPass } from '../lib/auth';
import { bookingAdminApi } from '../lib/bookingAdminApi';
import { onBookingsChanged, useRealtimeStatus } from '../lib/bookingRealtime';
import { useAdminBookings } from './hooks';
import { toNum, slipState, fmtBaht, fmtTimeBkk, slotMinutesBkk } from './bookingUtils';
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

export default function BookingBillsSection({ data, onActiveCount, onDayCounts, dayFilter, ownBookingRows, ownBookingCount, startEdit, requestVoid, startCheckoutBill, onLoading }) {
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

  /* เรียงตามเวลา ▲/▼ (แบบ mockup 5 พ.ย. 2026) — คีย์ = slot_start
     (ISO timestamptz เรียง lexicographic ได้ตรงเวลา) */
  const [sortDir, setSortDir] = useState('asc');
  const sortedOpen = useMemo(() => {
    const arr = [...open];
    arr.sort((x, y) => {
      const kx = String(x?.slot_start || '');
      const ky = String(y?.slot_start || '');
      return sortDir === 'asc' ? kx.localeCompare(ky) : ky.localeCompare(kx);
    });
    return arr;
  }, [open, sortDir]);

  /* รายงานจำนวนขึ้นหน้า — badge แท็บ "บิลที่เปิดอยู่" + hint หัวการ์ดรวมคิดกัน
     (นับตามที่โชว์จริง: เลือกวันอยู่ = นับวันนั้น) */
  useEffect(() => {
    onActiveCount?.(open.length + (ownBookingCount || 0));
  }, [open.length, ownBookingCount, onActiveCount]);

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

  // รายงานสถานะโหลดขึ้นหน้า — กัน OpenBillsSection สรุป "ว่าง" ก่อนดึงการจองเว็บเสร็จ
  useEffect(() => {
    onLoading?.(loading);
  }, [loading, onLoading]);

  /* เรียลไทม์: เดอร์จองเปลี่ยนฝั่ง server (มีคนจองใหม่/จ่ายเงิน/ร้านยืนยันฯ) → โหลดใหม่ทันที
     guard แบบเดียวกับฝั่งหน้าร้าน (App.reload): งดโหลดกลาง dialog — ดูสลีป · เลือกหมอจบบริการ
     · modal ของแอป (.modal-ov เช่น เช็คบิล/แก้ไขบิลหน้าร้านที่เปิดค้างบนหน้าเดียวกัน)
     เหตุการณ์ที่พลาดช่วง dialog เปิด รอบสำรอง 15 วิ ตามมาให้เองหลังปิด */
  const slipOpenRef = useRef(false);
  slipOpenRef.current = Boolean(slipView);
  const finishOpenRef = useRef(false);
  finishOpenRef.current = Boolean(finishOf);
  useEffect(() => onBookingsChanged(() => {
    if (slipOpenRef.current || finishOpenRef.current) return;
    if (typeof document !== 'undefined' && document.querySelector('.modal-ov')) return;
    loadData({ silent: true });
  }), [loadData]);

  if (!key) {
    return (
      <p className="muted" style={{ fontSize: 13, margin: '0 0 2px' }}>
        ลูกค้าจอง — ยังไม่ได้ตั้งรหัสเจ้าของร้าน จึงดึงการจองจากเว็บไม่ได้
      </p>
    );
  }

  /* ไม่มีทั้งการจองเว็บและบิลจองร้านรับเอง (รวมช่วงกำลังโหลด — ไม่โชว์ข้อความ/การ์ดว่าง)
     → OpenBillsSection จะโชว์ empty state ใหญ่แทน (กัน flash ด้วย bkLoading ฝั่งหน้า) */
  const hasContent = open.length > 0 || (ownBookingCount || 0) > 0;
  if (!hasContent && !authErr && !error && !slipView && !finishOf) return null;

  return (
    <>
      {/* ══ กลุ่ม 2 · ออเดอร์จอง — ธีมเขียว (แบบ mockup 5 พ.ย. 2026) ══
          โครงแถวเดียวกับออเดอร์หน้าร้าน: [ซ้าย: ลำดับ+ป้าย+เวลา+บริการ] [ขวา: ยอด+ปุ่ม]
          แตะแถว = ดูสลิป · ปุ่มเขียว = จบบริการ (เลือกหมอผู้ให้บริการ) */}
      <section className="osec osec-green" aria-label="ออเดอร์จอง">
        <header className="osec-head">
          <span className="osec-ic" aria-hidden="true"><CalendarCheck size={16} strokeWidth={2} /></span>
          <h2>จอง</h2>
          <span className="osec-count num" title="จำนวนการจอง (บิลจอง) ที่เปิดอยู่">{open.length + (ownBookingCount || 0)}</span>
          <span className="osec-head-sp" />

          <button
            type="button"
            className="osec-sort"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            aria-label={sortDir === 'asc' ? 'เรียงตามเวลา (เร็ว→สาย) — กดเพื่อกลับทิศ' : 'เรียงตามเวลา (สาย→เร็ว) — กดเพื่อกลับทิศ'}
            title={sortDir === 'asc' ? 'เรียงเช้า→ค่ำ — กดเพื่อกลับทิศ' : 'เรียงค่ำ→เช้า — กดเพื่อกลับทิศ'}
          >
            เรียงตามเวลา {sortDir === 'asc' ? <ChevronUp size={13} strokeWidth={2.2} /> : <ChevronDown size={13} strokeWidth={2.2} />}
          </button>
        </header>
        <div className="osec-body">
          {/* บิลจองร้านรับเอง (จาก data.bills) — แสดงใน section เดียวกับการจองจากเว็บ */}
          {ownBookingRows && ownBookingRows.length > 0 && ownBookingRows.map((r, i) => (
            <article
              key={r.b.id}
              className="orow"
              onClick={() => startEdit && startEdit(r.b)}
              title="แตะเพื่อแก้ไขบิล"
              aria-label={`บิลจอง ลำดับ ${i + 1} · ${r.svcName} · เวลา ${r.timeText} · ฿ ${r.total.toLocaleString()}`}
            >
              <div className="orow-main">
                <span className="orow-tag">
                  <span className="orow-pill green"> จอง</span>
                  <span className="orow-time num">{r.timeText}</span>
                </span>
                <span className="orow-svc" title={`รับจองโดย ${r.booker || '—'}${r.customer ? ` · ลูกค้า: ${r.customer}` : ''}`}>
                  <b>{r.svcName}{r.rows2.length > 1 ? ` +${r.rows2.length - 1}` : ''}</b>
                  <small className="num">
                    {formatDuration(r.mins) || '—'} · รับจองโดย {r.booker || '—'}{r.customer ? ` · ${r.customer}` : ''}
                    {r.hasDoc ? ` · ${r.docName}${r.docExtra}` : ''}
                  </small>
                </span>
              </div>
              <span className="orow-cta">
                <b className="orow-amt num">฿ {r.total.toLocaleString()}</b>
                <span className="orow-actions">
                  <button
                    type="button"
                    className="orow-link"
                    title={`แก้ไขบิล ${r.b.id}`}
                    aria-label={`แก้ไขบิล ${r.b.id}`}
                    onClick={(e) => { e.stopPropagation(); startEdit && startEdit(r.b); }}
                  >
                    <Pencil size={11} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="orow-link danger"
                    title={`ยกเลิกบิล ${r.b.id}`}
                    aria-label={`ยกเลิกบิล ${r.b.id}`}
                    onClick={(e) => { e.stopPropagation(); requestVoid && requestVoid(r.b); }}
                  >
                    <Trash2 size={11} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="orow-btn brown"
                    title={`เช็คบิล (ชำระเงิน/ออกใบเสร็จ) ฿ ${r.total.toLocaleString()}`}
                    onClick={(e) => { e.stopPropagation(); startCheckoutBill && startCheckoutBill(r.b); }}
                  >
                     <ChevronRight size={13} strokeWidth={2.4} />
                  </button>
                </span>
              </span>
            </article>
          ))}
          {authErr ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
              <TriangleAlert size={14} style={{ flexShrink: 0 }} /> {authErr}
            </div>
          ) : error ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
              <TriangleAlert size={14} style={{ flexShrink: 0 }} /> โหลดรายการจองไม่สำเร็จ — {error}
            </div>
          ) : open.length === 0 ? null : (
            sortedOpen.map((b, i) => {
              const slip = slipState(b);
              const when = b?.slot_start ? fmtTimeBkk(b.slot_start) : '';
              const until = b?.slot_end ? fmtTimeBkk(b.slot_end) : '';
              const span = slotMinutesBkk(b);
              const mins = span ? span.end - span.start : null;
              /* ถึงเวลารับบริการแล้ว? = วันนี้ + slot เริ่มไม่เกิน now+5 นาที
                 — อนาคต/อีกวัน = ปุ่ม "รอเวลา" */
              const started = Boolean(span)
                && String(b?.slot_date || '').slice(0, 10) === bkkToday()
                && bkkMinutes() + 5 >= span.start;
              /* ป้ายแถว: ยืนยันแล้ว = เขียว "จองล่วงหน้า" · รอยืนยัน/รอคืนเงิน = เหลือง */
              const pill = b?.status === 'pending'
                ? { cls: 'amber', label: 'รอยืนยัน' }
                : b?.status === 'cancel_requested'
                  ? { cls: 'amber', label: 'รอคืนเงิน' }
                  : { cls: 'green', label: 'จองล่วงหน้า' };
              const price = toNum(b?.amount) || 0;
              return (
                <article
                  key={b.code}
                  className="orow"
                  title={slip !== 'none' ? 'แตะเพื่อดูสลิป' : undefined}
                  onClick={slip !== 'none' ? () => setSlipView(b) : undefined}
                  aria-label={`ออเดอร์จอง ลำดับ ${i + 1} · ${b?.service_name || '—'} · ${when}${until ? `–${until}` : ''} · ${b?.customer_name || 'ไม่ระบุชื่อ'} · ฿ ${price.toLocaleString()}`}
                >
                  <div className="orow-main">
                    <span className="orow-num" aria-hidden="true">{i + 1}</span>
                    <span className="orow-tag">
                      <span className={`orow-pill ${pill.cls}`}>{pill.cls === 'green' ? <CalendarCheck size={10} strokeWidth={2.4} /> : <Clock size={10} strokeWidth={2.4} />} {pill.label}</span>
                      {/* เวลาอยู่ของเดอร์ (ตามสเก็ตช์: แสดงเฉพาะเวลาเริ่ม — ช่วงเต็มอยู่ใน tooltip) */}
                      <span className="orow-time num" title={when && until ? `${when} น. – ${until} น.` : undefined}>{when ? `${when} น.` : '—'}</span>
                    </span>
                    <span
                      className="orow-svc"
                      title={[
                        b?.customer_name ? `ลูกค้า: ${b.customer_name}` : 'ไม่ระบุชื่อ',
                        b?.customer_phone ? `โทร ${b.customer_phone}` : null,
                        b?.therapist_name ? `หมอ: ${String(b.therapist_name).startsWith('หมอ') ? b.therapist_name : `หมอ ${b.therapist_name}`}` : null,
                      ].filter(Boolean).join(' · ')}
                    >
                      <b>{b?.service_name || '—'}</b>
                      <small className="num">
                        {formatDuration(mins) || '—'}
                        {b?.customer_name ? ` · ${b.customer_name}` : ''}
                        {b?.therapist_name ? ` · ${String(b.therapist_name).startsWith('หมอ') ? b.therapist_name : `หมอ ${b.therapist_name}`}` : ''}
                      </small>
                    </span>
                  </div>
                  <span className="orow-cta">
                    {/* บรรทัดบน: ยอด + ป้ายชำระเงิน (คู่กัน — ช่วยคอลัมน์บริการได้กว้างขึ้น) */}
                    <span className="orow-top">
                      <b className="orow-amt num">{fmtBaht(price)}</b>
                      <BookingPayBadge status={b?.payment_status} />
                    </span>
                    <span className="orow-actions">
                      {slip !== 'none' && (
                        <button
                          type="button"
                          className={`orow-ic${slip === 'verified' ? ' ok' : ''}`}
                          title={slip === 'verified' ? 'ดูสลิป (ตรวจแล้ว)' : 'ดูสลิป'}
                          aria-label={`ดูสลิปของเดอร์ ${b?.code || ''}`}
                          onClick={(e) => { e.stopPropagation(); setSlipView(b); }}
                        >
                          {slip === 'verified' ? <CheckCircle2 size={14} strokeWidth={1.9} /> : <ImageIcon size={14} strokeWidth={1.9} />}
                        </button>
                      )}
                      {b?.status === 'confirmed' ? (
                        started ? (
                          <button
                            type="button"
                            className="orow-btn green"
                            disabled={busyCode === b?.code}
                            onClick={(e) => { e.stopPropagation(); setFinishOf(b); }}
                            title="บันทึกจบบริการ — เลือกหมอผู้ให้บริการก่อนบันทึก"
                            aria-label={`จบบริการของเดอร์ ${b?.code || ''}`}
                          >
                            {busyCode === b?.code ? <Loader2 size={13} strokeWidth={1.9} className="spin" /> : null}
                            จบบริการ <ChevronRight size={13} strokeWidth={2.4} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="orow-btn ghost-green"
                            onClick={(e) => { e.stopPropagation(); setFinishOf(b); }}
                            title="ยังไม่ถึงเวลานัด — กดบังคับจบบริการได้ถ้าลูกค้ามาก่อนเวลา"
                            aria-label={`จบบริการก่อนเวลาของเดอร์ ${b?.code || ''}`}
                          >
                            <Clock size={13} strokeWidth={2.2} /> รอเวลา
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="orow-btn ghost-amber"
                          title={b?.status === 'pending' ? 'ยืนยัน/ปฏิเสธที่หน้า "จัดการการจอง"' : 'อนุมัติคืนเงินที่หน้า "จัดการการจอง"'}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {b?.status === 'pending' ? 'รอยืนยัน' : 'รอคืนเงิน'}
                        </button>
                      )}
                    </span>
                  </span>
                </article>
              );
            })
          )}
        </div>
      </section>

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
