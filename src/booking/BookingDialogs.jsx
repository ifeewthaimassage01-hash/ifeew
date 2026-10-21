import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal, Lightbox } from '../components/ui';
import { toNum, payBahtOf, paySatangOf, fmtBaht } from './bookingUtils';

/* ══════════════════════════════════════════════════════════════════
   กล่องยืนยันการโอน
   ══════════════════════════════════════════════════════════════════ */
export function ConfirmTransferDialog({ booking, busy, error, mismatch, onCancel, onSubmit, onForce }) {
  const [checked, setChecked] = useState(true);
  const [step2, setStep2] = useState(false);
  const payBaht = payBahtOf(booking);
  const price = toNum(booking?.amount) || 0;

  const onClickConfirm = () => {
    // ติ๊ก = ส่งยอดให้ server เทียบ (ปลอดภัย)
    if (checked) {
      onSubmit({ amount: paySatangOf(booking) });
      return;
    }
    // ไม่ติ๊ก = ยืนยันแบบไม่ตรวจยอด → ต้องกดยืนยัน 2 ครั้ง
    if (!step2) {
      setStep2(true);
      return;
    }
    onSubmit({ amount: null });
  };

  return (
    <Modal onClose={onCancel}>
      <h3>ยืนยันการโอน</h3>
      <p className="bk-adm-dlg-sub">
        เดอร์ <b className="num">{booking?.code}</b>
        {booking?.customer_name ? <> · {booking.customer_name}</> : null}
      </p>

      <div className="bk-adm-amount-box">
        <span className="bk-adm-amount-label">ยอดที่ต้องโอน</span>
        <b className="bk-adm-amount-big num">{payBaht !== null ? fmtBaht(payBaht) : '—'}</b>
        {price > 0 && <span className="bk-adm-amount-sub">ราคาบริการ {fmtBaht(price)}</span>}
      </div>

      <p className="bk-adm-dlg-hint">
        เทียบยอดด้านบนกับแอปธนาคารของคุณก่อนยืนยัน — ต้องโอนตรงตามยอดที่แสดง
      </p>

      <label className="bk-adm-check">
        <input type="checkbox" checked={checked} onChange={(e) => { setChecked(e.target.checked); setStep2(false); }} />
        <span>ยืนยันว่าโอนถูกยอด (ส่งให้ระบบเทียบยอดให้อีกครั้ง)</span>
      </label>

      {step2 && (
        <div className="alert warn">
          <TriangleAlert size={15} strokeWidth={1.8} className="eic" />
          <div>กดปุ่มยืนยันอีกครั้งเพื่อยืนยันแบบไม่ตรวจยอด (คุณตรวจบัญชีเองแล้ว)</div>
        </div>
      )}

      {error && (
        <div className="alert err" role="alert">
          <TriangleAlert size={15} strokeWidth={1.8} className="eic" />
          <div>{error}</div>
        </div>
      )}

      <div className="modal-row">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>ยกเลิก</button>
        <button type="button" className="btn btn-primary" onClick={onClickConfirm} disabled={busy}>
          {busy ? 'กำลังยืนยัน…' : step2 ? 'กดอีกครั้งเพื่อยืนยัน' : 'ยืนยันการโอน'}
        </button>
      </div>

      {mismatch && (
        <div className="bk-adm-force">
          <button type="button" className="btn btn-ghost btn-block" onClick={onForce} disabled={busy}>
            ยืนยันโดยไม่ตรวจยอด
          </button>
          <p className="bk-adm-dlg-hint" style={{ textAlign: 'center', marginTop: 6 }}>
            ใช้เมื่อคุณเช็คบัญชีเองแล้วว่ายอดถูกต้อง — ระบบจะบันทึกว่าเป็นการยืนยันแบบไม่ตรวจยอด
          </p>
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════
   กล่องปฏิเสธ/ยกเลิก
   ══════════════════════════════════════════════════════════════════ */
export function RejectBookingDialog({ booking, busy, error, onCancel, onSubmit }) {
  const [reason, setReason] = useState('');
  return (
    <Modal onClose={onCancel}>
      <h3>ปฏิเสธ/ยกเลิกการจอง</h3>
      <p className="bk-adm-dlg-sub">
        เดอร์ <b className="num">{booking?.code}</b>
        {booking?.customer_name ? <> · {booking.customer_name}</> : null}
        {booking?.customer_phone ? <> · <span className="num">{booking.customer_phone}</span></> : null}
      </p>
      <p className="bk-adm-dlg-hint">
        เดอร์นี้จะถูกเปลี่ยนเป็น “ยกเลิกแล้ว” และคิวเวลาจะกลับมาให้ลูกค้าจองได้
      </p>

      <div className="field">
        <label htmlFor="adm-reason">เหตุผล (ไม่บังคับ)</label>
        <textarea
          id="adm-reason" className="input" value={reason} maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น โอนยอดไม่ครบ / สลีปไม่ชัดเจน"
        />
      </div>

      {error && (
        <div className="alert err" role="alert">
          <TriangleAlert size={15} strokeWidth={1.8} className="eic" />
          <div>{error}</div>
        </div>
      )}

      <div className="modal-row">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>ยกเลิก</button>
        <button type="button" className="btn btn-danger" onClick={() => onSubmit(reason)} disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'ยืนยันการปฏิเสธ'}
        </button>
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ดูสลีปขนาดเต็ด (ใช้ Lightbox ของแอป)
   ══════════════════════════════════════════════════════════════════ */
export function SlipViewerDialog({ booking, onClose }) {
  const url = booking?.slip_image_url || '';
  if (!url) return null;
  return (
    <Lightbox
      url={url}
      title={`สลีปการโอน · เดอร์ ${booking?.code || '—'}${booking?.customer_name ? ` · ${booking.customer_name}` : ''}`}
      onClose={onClose}
    />
  );
}

export default ConfirmTransferDialog;
