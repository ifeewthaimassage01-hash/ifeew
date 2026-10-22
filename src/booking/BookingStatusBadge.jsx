// สถานะการจอง — pending / confirmed / completed / cancelled / expired / cancel_requested
// ใช้คลาส .bk-adm-badge ของหน้าจัดการการจอง (ห้ามใช้ StatusBadge ของบิลใน POS — คนละชุดสถานะ)
const STATUS_MAP = {
  pending: { cls: 'is-pending', text: 'รอยืนยัน' },
  confirmed: { cls: 'is-confirmed', text: 'ยืนยันแล้ว' },
  completed: { cls: 'is-completed', text: 'จบบริการ' },
  cancelled: { cls: 'is-cancelled', text: 'ยกเลิกแล้ว' },
  expired: { cls: 'is-expired', text: 'หมดอายุ' },
  cancel_requested: { cls: 'is-cancel-requested', text: 'รอคืนเงิน' },
};

export default function BookingStatusBadge({ status }) {
  const s = STATUS_MAP[status];
  if (!s) return <span className="bk-adm-badge is-cancelled">{status || '—'}</span>;
  return <span className={`bk-adm-badge ${s.cls}`}>{s.text}</span>;
}
