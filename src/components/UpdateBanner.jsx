import { RefreshCw, X } from 'lucide-react';

/* แบนเนอร์แจ้ง "มีเวอร์ชันใหม่" — ลอยกลางจอบน (fixed) ให้เห็นชัดแต่ไม่บังงาน
   props: latest = เวอร์ชันใหม่, seconds = นับถอยหลังก่อนรีเฟรช, busy = กำลังอัปเดต
          onApply = กด "อัปเดตเลย", onClose = กด X (เลือก "ไว้ก่อน" ยกเลิก auto-reload) */
export default function UpdateBanner({ latest, seconds, busy, onApply, onClose }) {
  if (!latest) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <RefreshCw size={17} className="update-ic" />
      <div className="update-txt">
        <b>มีเวอร์ชันใหม่ ({latest}) พร้อมใช้งาน</b>
        <span>จะรีเฟรชอัตโนมัติใน {seconds} วินาที</span>
      </div>
      <button type="button" className="update-btn" onClick={onApply} disabled={busy}>
        {busy ? 'กำลังอัปเดต…' : 'อัปเดตเลย'}
      </button>
      <button type="button" className="update-x" onClick={onClose} aria-label="ปิด (ไว้ก่อน)" title="ไว้ก่อน">
        <X size={15} />
      </button>
    </div>
  );
}
