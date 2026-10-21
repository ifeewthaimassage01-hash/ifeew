// สถานะการชำระเงินของการจอง — unpaid / paid / failed / refunded
// ใช้คลาส .badge ของแอป (มี .badge.ok เพิ่มใน booking.css)
const PAY_MAP = {
  unpaid: { cls: 'neutral', text: 'ยังไม่ชำระ' },
  paid: { cls: 'ok', text: 'ชำระแล้ว' },
  failed: { cls: 'void', text: 'ชำระไม่สำเร็จ' },
  refunded: { cls: 'info', text: 'คืนเงินแล้ว' },
};

export default function BookingPayBadge({ status }) {
  if (!status) return null;
  const s = PAY_MAP[status];
  if (!s) return <span className="badge neutral">{status || '—'}</span>;
  return <span className={`badge ${s.cls}`}>{s.text}</span>;
}
