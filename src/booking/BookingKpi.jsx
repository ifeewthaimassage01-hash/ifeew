import { Inbox, ClipboardList } from 'lucide-react';
import { Kpi, fmtDay } from '../components/ui';

const kpiCount = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ══════════════════════════════════════════════════════════════════
   KPI: "ที่ต้องทำตอนนี้" + "สรุปวันนี้"
   ══════════════════════════════════════════════════════════════════ */
export default function BookingKpi({ stats }) {
  const s = stats || {};
  // งานค้างจริง = 3 ตัวเลขนี้รวมกัน — ไม่มีเลยก็ไม่ต้องกินพื้นที่การ์ด 3 ใบ
  const todoCount = kpiCount(s.today_pending) + kpiCount(s.pending_with_slip) + kpiCount(s.unverified_slip_count);

  return (
    <>
      {/* ---------- ที่ต้องทำตอนนี้ ---------- */}
      <section className="bk-adm-sec">
        <div className="bk-adm-sec-h">
          <span className="bk-adm-sec-ic bk-adm-sec-ic-todo"><Inbox size={14} strokeWidth={1.9} /></span>
          <div className="bk-adm-sec-txt">
            <b>ที่ต้องทำตอนนี้</b>
            <span>{todoCount > 0 ? `งานที่รอคุณตรวจสอบและยืนยัน · ${todoCount} รายการ` : 'งานที่รอคุณตรวจสอบและยืนยัน'}</span>
          </div>
        </div>
        {todoCount > 0 ? (
          <div className="bk-adm-stats-todo">
            <Kpi tone="brass" label="รอยืนยัน" value={kpiCount(s.today_pending)} sub="รอตรวจยอดที่โอน" />
            <Kpi tone="brass" label="รอตรวจสลิป" value={kpiCount(s.pending_with_slip)} sub="ลูกค้าส่งสลิปแล้ว" />
            <Kpi tone="alert" label="สลิปยังไม่ผ่านการตรวจ" value={kpiCount(s.unverified_slip_count)} sub="ต้องให้ลูกค้าส่งใหม่" />
          </div>
        ) : (
          <p className="bk-adm-note">ไม่มีงานค้าง — ไม่มีรายการรอยืนยันหรือสลิปที่ต้องตรวจ</p>
        )}
      </section>

      {/* ---------- สรุปวันนี้ (บรรทัดเดียว — เป็นข้อมูลอ้างอิง ไม่ใช่งานที่ต้องกด) ---------- */}
      <section className="bk-adm-sec">
        <div className="bk-adm-sec-h">
          <span className="bk-adm-sec-ic"><ClipboardList size={14} strokeWidth={1.9} /></span>
          <div className="bk-adm-sec-txt">
            <b>สรุปวันนี้</b>
            <span>{s.today ? `วันที่ ${fmtDay(s.today)}` : 'ภาพรวมการจองของวันที่เลือก'}</span>
          </div>
        </div>
        <div className="bk-sum-line">
          <span><b>{kpiCount(s.today_total)}</b> ทั้งหมด</span>
          <span><b>{kpiCount(s.today_confirmed)}</b> ยืนยันแล้ว</span>
          <span><b>{kpiCount(s.today_cancelled)}</b> ยกเลิก</span>
        </div>
      </section>
    </>
  );
}
