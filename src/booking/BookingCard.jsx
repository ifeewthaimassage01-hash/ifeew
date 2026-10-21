import {
  Phone, Banknote, CheckCircle2, XCircle, TriangleAlert, Clock, Image as ImageIcon,
} from 'lucide-react';
import { fmtDay } from '../components/ui';
import { toNum, payBahtOf, slipState, fmtBaht, fmtTimeBkk, fmtDateBkk } from './bookingUtils';
import BookingStatusBadge from './BookingStatusBadge';
import BookingPayBadge from './BookingPayBadge';

/* ══════════════════════════════════════════════════════════════════
   การ์ดการจอง 1 รายการ
   ══════════════════════════════════════════════════════════════════ */
export default function BookingCard({ b, busy, todo, onConfirm, onReject, onOpenSlip }) {
  const paid = b?.payment_status === 'paid';
  const payBaht = payBahtOf(b);
  const price = toNum(b?.amount) || 0;
  const slip = slipState(b);
  const when = b?.slot_start ? fmtTimeBkk(b.slot_start) : '';
  const until = b?.slot_end ? fmtTimeBkk(b.slot_end) : '';
  const code = b?.code || '';

  return (
    <article className={`bk-adm-card${todo ? ' is-todo' : ''}`}>
      <div className="bk-adm-card-top">
        <div className="bk-adm-code num">{code || '—'}</div>
        <BookingStatusBadge status={b?.status} />
        <div className="bk-adm-when">
          <Clock size={13} strokeWidth={1.8} />
          <span className="num">
            {fmtDay(b?.slot_date) || 'ไม่ระบุวันที่'}{when ? ` · ${when}` : ''}{until ? `–${until}` : ''}
          </span>
        </div>
      </div>

      <div className="bk-adm-rows">
        <div className="bk-adm-row">
          <span className="bk-adm-row-k">ลูกค้า</span>
          <span className="bk-adm-row-v">
            {b?.customer_name || 'ไม่ระบุชื่อ'}
            {b?.customer_phone && (
              <a className="bk-adm-phone" href={`tel:${b.customer_phone}`}>
                <Phone size={12} strokeWidth={1.9} /> <span className="num">{b.customer_phone}</span>
              </a>
            )}
          </span>
        </div>
        <div className="bk-adm-row">
          <span className="bk-adm-row-k">บริการ</span>
          <span className="bk-adm-row-v">
            {b?.service_name || '—'}
            {b?.therapist_name ? <em className="bk-adm-thera">หมอ{b.therapist_name}</em> : null}
          </span>
        </div>
      </div>

      <div className="bk-adm-amounts">
        {price > 0 && (
          <span className="bk-adm-price">
            ราคา <span className="num">{fmtBaht(price)}</span>
          </span>
        )}
        <span className="bk-adm-pay">
          ต้องโอน <span className="num">{payBaht !== null ? fmtBaht(payBaht) : '—'}</span>
        </span>
        <BookingPayBadge status={b?.payment_status} />
      </div>

      {b?.status === 'cancel_requested' && (
        <div className="bk-adm-warn">
          <TriangleAlert size={15} strokeWidth={1.8} className="eic" />
          <div>รอติดต่อคืนเงินลูกค้า — ลูกค้าแจ้งขอยกเลิกหลังชำระเงินแล้ว</div>
        </div>
      )}

      {slip !== 'none' && (
        <div className="bk-adm-slip">
          <button
            type="button"
            className="bk-adm-slip-thumb"
            onClick={() => onOpenSlip(b)}
            aria-label={`ดูสลีปขนาดเต็ดของเดอร์ ${code}`}
          >
            <img src={b.slip_image_url} alt="สลีปการโอนของลูกค้า" loading="lazy" />
            <span className="bk-adm-slip-zoom"><ImageIcon size={13} strokeWidth={1.9} /></span>
          </button>
          <div className="bk-adm-slip-info">
            {slip === 'verified' ? (
              <span className="bk-adm-slip-tag is-verified">
                <CheckCircle2 size={12} strokeWidth={1.9} /> สลีปผ่านการตรวจสอบ
              </span>
            ) : (
              <span className="bk-adm-slip-tag is-wait">
                <TriangleAlert size={12} strokeWidth={1.9} /> รอตรวจสลีป
              </span>
            )}
            {b?.slip_sender && <div className="bk-adm-slip-row">ผู้โอน: {b.slip_sender}</div>}
            {b?.slip_bank && <div className="bk-adm-slip-row">ธนาคาร: {b.slip_bank}</div>}
            {b?.slip_trans_ref && <div className="bk-adm-slip-row">เลขอ้างอิง: <span className="num">{b.slip_trans_ref}</span></div>}
          </div>
        </div>
      )}

      {paid ? (
        <div className="bk-adm-paid">
          <CheckCircle2 size={15} strokeWidth={1.8} className="eic" />
          <div>
            <b>ยืนยันแล้ว</b>
            {b?.paid_at && (
              <div className="bk-adm-paid-sub">
                จ่ายเมื่อ {fmtDateBkk(b.paid_at)} เวลา <span className="num">{fmtTimeBkk(b.paid_at)}</span>
              </div>
            )}
            {b?.transaction_id && (
              <div className="bk-adm-paid-sub">เลขอ้างอิง <span className="num">{b.transaction_id}</span></div>
            )}
          </div>
        </div>
      ) : (
        <div className="bk-adm-acts">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(b)}
            disabled={busy}
            aria-label={`ยืนยันการโอนเดอร์ ${code}`}
          >
            <Banknote size={15} strokeWidth={1.8} /> ยืนยันการโอน
          </button>
          <button
            type="button"
            className="btn btn-ghost bk-adm-btn-reject"
            onClick={() => onReject(b)}
            disabled={busy}
            aria-label={`ปฏิเสธหรือยกเลิกเดอร์ ${code}`}
          >
            <XCircle size={15} strokeWidth={1.8} /> ปฏิเสธ/ยกเลิก
          </button>
        </div>
      )}
    </article>
  );
}
