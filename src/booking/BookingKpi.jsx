import { Inbox, ClipboardList } from 'lucide-react';
import { Kpi, fmtDay } from '../components/ui';

const kpiCount = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ══════════════════════════════════════════════════════════════════
   KPI: "ที่ต้องทำตอนนี้" + "สรุปวันนี้"
   ══════════════════════════════════════════════════════════════════ */
export default function BookingKpi({ stats }) {
  const s = stats || {};

  return (
    <>
      {/* ---------- ที่ต้องทำตอนนี้ ---------- */}
      <section className="bk-adm-sec">
        <div className="bk-adm-sec-h">
          <span className="bk-adm-sec-ic bk-adm-sec-ic-todo"><Inbox size={14} strokeWidth={1.9} /></span>
          <div className="bk-adm-sec-txt">
            <b>ที่ต้องทำตอนนี้</b>
            <span>งานที่รอคุณตรวจสอบและยืนยัน</span>
          </div>
        </div>
        <div className="bk-adm-stats-todo">
          <Kpi tone="brass" label="รอยืนยัน" value={kpiCount(s.today_pending)} sub="รอตรวจยอดที่โอน" />
          <Kpi tone="brass" label="รอตรวจสลีป" value={kpiCount(s.pending_with_slip)} sub="ลูกค้าส่งสลีปแล้ว" />
          <Kpi tone="alert" label="สลีปยังไม่ผ่านการตรวจ" value={kpiCount(s.unverified_slip_count)} sub="ต้องให้ลูกค้าส่งใหม่" />
        </div>
      </section>

      {/* ---------- สรุปวันนี้ ---------- */}
      <section className="bk-adm-sec">
        <div className="bk-adm-sec-h">
          <span className="bk-adm-sec-ic"><ClipboardList size={14} strokeWidth={1.9} /></span>
          <div className="bk-adm-sec-txt">
            <b>สรุปวันนี้</b>
            <span>ภาพรวมการจองของวันที่เลือก</span>
          </div>
        </div>
        <div className="bk-adm-stats-sum">
          <Kpi label="วันนี้ทั้งหมด" value={kpiCount(s.today_total)} sub={s.today ? `วันที่ ${fmtDay(s.today)}` : ''} />
          <Kpi tone="sage" label="ยืนยันแล้ว" value={kpiCount(s.today_confirmed)} />
          <Kpi label="ยกเลิก" value={kpiCount(s.today_cancelled)} />
        </div>
      </section>
    </>
  );
}
