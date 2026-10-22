import { RefreshCw, ClipboardList, ListChecks, History } from 'lucide-react';
import { EmptyState } from '../components/ui';
import { useRealtimeStatus } from '../lib/bookingRealtime';
import BookingCard from './BookingCard';

/* ══════════════════════════════════════════════════════════════════
   รายการการจอง: หัวรายการ + counter + empty state + 2 กลุ่มการ์ด
   ══════════════════════════════════════════════════════════════════ */
export default function BookingList({
  filtered, total, grouped, query, onRefresh, busy, onConfirm, onReject, onOpenSlip,
}) {
  // ข้อความ empty state นับตามสถานะช่อง: realtime = "ทันที" · down/unknown = รอบ 15 วิ สำรอง
  const rt = useRealtimeStatus();
  return (
    <>
      <div className="bk-adm-list-head">
        <b>รายการการจอง</b>
        <span className="muted num">
          {filtered.length} รายการ{filtered.length !== total ? ` (จากทั้งหมด ${total})` : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card bk-adm-empty">
          <EmptyState
            icon={ClipboardList}
            title={query ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีการจองในวันที่เลือก'}
            subtitle={
              query
                ? 'ลองเปลี่ยนคำค้นหา หรือกดรีเฟรชเพื่อดูข้อมูลล่าสุด'
                : (rt === 'connected'
                ? 'เปลี่ยนวันที่หรือสถานะด้านบน — ข้อมูลอัปเดตทันทีแบบเรียลไทม์'
                : 'เปลี่ยนวันที่หรือสถานะด้านบน — ระบบรีโหลดอัตโนมัติทุก 15 วินาที')
            }
          />
          <div className="bk-adm-empty-act">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRefresh()}>
              <RefreshCw size={14} strokeWidth={1.8} /> รีเฟรช
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ---------- ต้องดำเนินการ ---------- */}
          {grouped.todo.length > 0 && (
            <section className="bk-adm-sec">
              <div className="bk-adm-sec-h">
                <span className="bk-adm-sec-ic bk-adm-sec-ic-todo"><ListChecks size={14} strokeWidth={1.9} /></span>
                <div className="bk-adm-sec-txt">
                  <b>ต้องดำเนินการ</b>
                  <span>{grouped.todo.length} รายการ — ตรวจยอดแล้วกดยืนยันหรือปฏิเสธ</span>
                </div>
              </div>
              <div className="bk-adm-list">
                {grouped.todo.map((b, i) => (
                  <BookingCard
                    key={b?.code || `todo-${i}`}
                    b={b}
                    todo
                    busy={busy}
                    onConfirm={onConfirm}
                    onReject={onReject}
                    onOpenSlip={onOpenSlip}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ---------- ประวัติ ---------- */}
          {grouped.history.length > 0 && (
            <section className="bk-adm-sec">
              <div className="bk-adm-sec-h">
                <span className="bk-adm-sec-ic"><History size={14} strokeWidth={1.9} /></span>
                <div className="bk-adm-sec-txt">
                  <b>ประวัติการจอง</b>
                  <span>{grouped.history.length} รายการ — ยืนยันแล้ว / ยกเลิก / หมดอายุ</span>
                </div>
              </div>
              <div className="bk-adm-list">
                {grouped.history.map((b, i) => (
                  <BookingCard
                    key={b?.code || `hist-${i}`}
                    b={b}
                    busy={busy}
                    onConfirm={onConfirm}
                    onReject={onReject}
                    onOpenSlip={onOpenSlip}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
