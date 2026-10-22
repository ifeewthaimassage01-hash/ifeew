import { useMemo, useState } from 'react';
import { CalendarCheck, TriangleAlert, RefreshCw, Search } from 'lucide-react';
import { Card, EmptyState, DatePicker } from '../components/ui';
import { getOwnerPass } from '../lib/auth';
import { bizToday } from '../utils/bkk';
import { useAdminBookings } from './hooks';
import BookingList from './BookingList';
import { SlipViewerDialog } from './BookingDialogs';
import { isTodoBooking } from './bookingUtils';

/* ══════════════════════════════════════════════════════════════════
   แท็บ "บิลจอง" ในเมนูบิล (PageBills) — 22 ต.ค. 2026
   การจองออนไลน์จากเว็บลูกค้า (ตาราง bookings) มาโชว์ในเมนูบิลแยกชัด
   — อ่านอย่างเดียว ไม่มีปุ่มยืนยัน/ปฏิเสธ (action ยังอยู่หน้า "จัดการการจอง")
   รีใช้ hook + รายการการ์ดของหน้าจัดการการจองเดิมทั้งหมด
   ══════════════════════════════════════════════════════════════════ */

function amtBaht(b) {
  // pay_amount = สตางค์ (ชำระแล้วถูกตั้งเสมอ) · ไม่มีค่อย fallback เป็น amount (บาท)
  const s = Number(b?.pay_amount);
  if (Number.isFinite(s) && s > 0) return s / 100;
  const a = Number(b?.amount);
  return Number.isFinite(a) ? a : 0;
}

const ST_GROUPS = [
  { v: 'all', l: 'ทุกสถานะ' },
  { v: 'confirmed', l: 'ยืนยันแล้ว' },
  { v: 'pending', l: 'รอยืนยัน' },
  { v: 'cancel_requested', l: 'รอคืนเงิน' },
  { v: 'closed', l: 'ยกเลิก/หมดอายุ' },
];
const passStatus = (b, f) => f === 'all'
  || (f === 'closed' ? b.status === 'cancelled' || b.status === 'expired' : b.status === f);

export default function BookingBillsSection({ data }) {
  const key = getOwnerPass(data?.ownerPass);
  const [authErr, setAuthErr] = useState('');
  const [date, setDate] = useState(() => bizToday());
  const [allDates, setAllDates] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [slipView, setSlipView] = useState(null);

  const handleUnauthorized = useMemo(() => () => {
    setAuthErr('รหัสเจ้าของร้านไม่ถูกต้อง — ให้เจ้าของร้านตรวจสอบรหัสผ่านในหน้า "จัดการร้าน" แล้วลองใหม่');
  }, []);

  const { filtered, total, loading, refreshing, error, loadData } = useAdminBookings({
    keyValue: key,
    date,
    allDates,
    statusFilter: '',
    query,
    paused: Boolean(slipView),
    onUnauthorized: handleUnauthorized,
  });

  /* กรองสถานะฝั่ง client (ค่า "ยกเลิก/หมดอายุ" รวม 2 สถานะ) */
  const visible = useMemo(
    () => filtered.filter((b) => passStatus(b, statusFilter)),
    [filtered, statusFilter],
  );
  const grouped = useMemo(() => {
    const todo = [];
    const history = [];
    visible.forEach((b) => (isTodoBooking(b) ? todo.push(b) : history.push(b)));
    return { todo, history };
  }, [visible]);

  const paidSum = visible.filter((b) => b.status === 'confirmed').reduce((s, b) => s + amtBaht(b), 0);
  const pendingCount = grouped.todo.filter((b) => b.status !== 'cancel_requested').length;

  if (!key) {
    return (
      <Card>
        <EmptyState
          icon={CalendarCheck}
          title="ยังไม่ได้ตั้งรหัสเจ้าของร้าน"
          subtitle="เมนูนี้เรียกรายการจองจากเซิร์ฟเวอร์ด้วยรหัสเจ้าของร้าน — กรุณาตั้งรหัสผ่านในหน้า “จัดการร้าน” ก่อน"
        />
      </Card>
    );
  }

  return (
    <>
      {/* หัวแยก "บิลจอง" — ตามที่ผู้ใช้ขอให้เห็นชัดว่าโซนนี้คือการจองจากเว็บ ไม่ใช่บิลหน้าร้าน */}
      <section className="bk-adm-sec" style={{ marginTop: 14 }}>
        <div className="bk-adm-sec-h">
          <span className="bk-adm-sec-ic"><CalendarCheck size={14} strokeWidth={1.9} /></span>
          <div className="bk-adm-sec-txt">
            <b>บิลจอง</b>
            <span>รายการจองออนไลน์จากเว็บลูกค้า · อัปเดตอัตโนมัติทุก 15 วินาที — ยืนยัน/ปฏิเสธที่หน้า “จัดการการจอง”</span>
          </div>
        </div>
      </section>

      <Card>
        <div className="field" style={{ marginBottom: 10 }}>
          <div className="search-wrap">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาเบอร์ลูกค้า / รหัสจอง / ชื่อ…"
              className="input"
            />
          </div>
        </div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <DatePicker date={date} onChange={setDate} />
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={allDates} onChange={(e) => setAllDates(e.target.checked)} />
            ทุกวัน
          </label>
          <select className="input" style={{ maxWidth: 170 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="กรองสถานะบิลจอง">
            {ST_GROUPS.map((g) => <option key={g.v} value={g.v}>{g.l}</option>)}
          </select>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadData()} disabled={refreshing} style={{ marginLeft: 'auto' }}>
            <RefreshCw size={14} strokeWidth={1.8} /> รีเฟรช
          </button>
        </div>
      </Card>

      {authErr && (
        <Card>
          <EmptyState icon={TriangleAlert} title="รหัสไม่ถูกต้อง" subtitle={authErr} />
        </Card>
      )}
      {error && !authErr && (
        <Card>
          <EmptyState icon={TriangleAlert} title="โหลดรายการจองไม่สำเร็จ" subtitle={error} />
        </Card>
      )}

      <div className="kpi-grid">
        <div className="kpi dark span2">
          <div className="kpi-label">ยอดบิลจอง (ยืนยันแล้ว)</div>
          <div className="kpi-value">฿ {paidSum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div className="kpi-sub">
            {visible.filter((b) => b.status === 'confirmed').length} ยืนยันแล้ว
            {pendingCount > 0 ? ` · ${pendingCount} รอดำเนินการ` : ''}
            {` · ${visible.filter((b) => b.status === 'cancelled' || b.status === 'expired' || b.status === 'cancel_requested').length} เดอร์ปิด`}
          </div>
        </div>
      </div>

      <BookingList
        filtered={visible}
        total={total}
        grouped={grouped}
        query={query}
        busy={loading || refreshing}
        onRefresh={() => loadData()}
        onOpenSlip={(b) => setSlipView(b)}
      />

      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
        รายการจองอัปเดตอัตโนมัติจากเว็บลูกค้าทุก 15 วินาที — ต้องการยืนยัน/ปฏิเสธให้ไปที่หน้า “จัดการการจอง”
      </p>

      <SlipViewerDialog booking={slipView} onClose={() => setSlipView(null)} />
    </>
  );
}
