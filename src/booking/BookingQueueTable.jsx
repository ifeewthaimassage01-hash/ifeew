import { useMemo, useState } from 'react';
import { ChevronDown, CalendarClock, Phone } from 'lucide-react';
import { fmtTimeBkk, fmtDateBkk } from './bookingUtils';
import BookingStatusBadge from './BookingStatusBadge';

/* ══════════════════════════════════════════════════════════════════
   ตารางคิวตามเวลา — เดอร์จองของวันที่เลือก เรียงจากเช้าไปค่ำ
   แถวละ: เวลาเริ่ม–จบ · ลูกค้า (ชื่อ + เบอร์) · บริการ + หมอ · สถานะ
   ใช้ตัวกรองตัวเดียวกับรายการด้านล่าง (filtered) แต่เรียง/จัดตามเวลาแทนสถานะ
   ใช้ตอน "ทุกวันที่" ด้วย → มีคอลัมน์วันที่ต่อท้ายเวลา
   ══════════════════════════════════════════════════════════════════ */
export default function BookingQueueTable({ filtered, allDates }) {
  const [open, setOpen] = useState(true);

  const rows = useMemo(() => [...(filtered || [])].sort((a, b) => {
    const ta = new Date(a?.slot_start || a?.slot_date || '')?.getTime() || 0;
    const tb = new Date(b?.slot_start || b?.slot_date || '')?.getTime() || 0;
    return ta - tb || String(a?.code || '').localeCompare(String(b?.code || ''));
  }), [filtered]);

  /* ไม่มีรายการ → ซ่อนส่วนนี้ (รายการด้านล่างมี empty state ของตัวเองแล้ว) */
  if (rows.length === 0) return null;

  return (
    <section className="bk-queue">
      <button
        type="button"
        className="bk-queue-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="bk-queue-body"
      >
        <span className="bk-queue-ic" aria-hidden="true"><CalendarClock size={14} strokeWidth={1.9} /></span>
        <span className="bk-queue-txt">
          <b>ตารางคิวตามเวลา</b>
          <span>{rows.length} คิว — เรียงจากเช้าไปค่ำ</span>
        </span>
        <ChevronDown size={15} strokeWidth={2} className={`bk-queue-chev${open ? ' up' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="bk-queue-body" id="bk-queue-body">
          {rows.map((b, i) => {
            const start = b?.slot_start ? fmtTimeBkk(b.slot_start) : '—';
            const end = b?.slot_end ? fmtTimeBkk(b.slot_end) : '';
            return (
              <div key={b?.code || `q-${i}`} className="bk-queue-row">
                <span className="bk-queue-time num">
                  <b>{start}</b>
                  {end ? <small>ถึง {end}</small> : null}
                </span>
                <span className="bk-queue-main">
                  <span className="bk-queue-cust">
                    {b?.customer_name || 'ไม่ระบุชื่อ'}
                    {b?.customer_phone && (
                      <a className="bk-queue-phone num" href={`tel:${b.customer_phone}`} aria-label={`โทร ${b.customer_phone}`}>
                        <Phone size={11} strokeWidth={1.9} />
                      </a>
                    )}
                  </span>
                  <span className="bk-queue-svc">
                    {b?.service_name || '—'}
                    {b?.therapist_name ? ` · ${b.therapist_name}` : ''}
                    {allDates && b?.slot_start ? ` · ${fmtDateBkk(b.slot_start)}` : ''}
                  </span>
                </span>
                <span className="bk-queue-st"><BookingStatusBadge status={b?.status} /></span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
