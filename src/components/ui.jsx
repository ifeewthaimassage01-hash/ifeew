import { useState, useEffect } from 'react';
import { CheckCircle2, TriangleAlert, X } from 'lucide-react';
import { bkkToday } from '../utils/bkk';

export function PageHeader({ icon: Icon, title, subtitle, actions, eyebrow }) {
  return (
    <header className="pagehead">
      {eyebrow && <div className="eyebrow"><span>{eyebrow}</span></div>}
      <div className="pagehead-row">
        <div className="pagehead-main">
          {Icon && <div className="pagehead-icon"><Icon size={22} strokeWidth={1.8} /></div>}
          <div style={{ minWidth: 0 }}>
            <h1 className="h1">{title}</h1>
            {subtitle && <p className="muted" style={{ margin: '2px 0 0' }}>{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="pagehead-actions">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ children, className = '', style }) {
  return <div className={`card ${className}`} style={style}>{children}</div>;
}

export function CardHead({ title, hint, right }) {
  return (
    <div className="card-h">
      <div>
        <h2>{title}</h2>
        {hint && <small className="muted" style={{ display: 'block', marginTop: 2 }}>{hint}</small>}
      </div>
      {right}
    </div>
  );
}

export function Kpi({ tone = '', label, value, sub, span = false, small = false }) {
  return (
    <div className={`kpi ${tone}${span ? ' span2' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${small ? ' sm' : ''}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-ic"><Icon size={26} strokeWidth={1.6} /></div>}
      <b>{title}</b>
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}

export function StatusBadge({ status }) {
  if (status === 'paid') return <span className="badge paid">● ชำระแล้ว</span>;
  if (status === 'open') return <span className="badge open">◷ เปิดบิลอยู่</span>;
  if (status === 'cancelled') return <span className="badge void">✕ ยกเลิกแล้ว</span>;
  return <span className="badge info">◷ {status}</span>;
}

/* ระยะเวลา — แสดงให้ลูกค้า/พนักงานอ่านง่าย เช่น 60 → "1 ชม", 90 → "1.5 ชม", 120 → "2 ชม" */
export function formatDuration(min) {
  if (min == null || min === '') return '';
  const m = Number(min);
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${h} ชม`;
  if (r === 30) return `${h}.5 ชม`;
  return `${h} ชม ${r} นาที`;
}

export function formatDurationLong(min) {
  if (min == null || min === '') return '';
  const m = Number(min);
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return h === 1 ? '1 ชม (60 นาที)' : `${h} ชม (${m} นาที)`;
  if (r === 30) return `${h}.5 ชม (${m} นาที)`;
  return `${h} ชม ${r} นาที (${m} นาที)`;
}

/* ตัวกรองช่วงวันที่ — date picker ล้วน ไม่มี preset (ว่าง = ทั้งหมด, ปุ่มล้าง = กลับไปวันนี้) */
function todayLocal() {
  return bkkToday();
}
export function DateRange({ from, to, onChange }) {
  const set = (key, val) => {
    let f = key === 'from' ? val : (from || '');
    let t = key === 'to' ? val : (to || '');
    if (f && t && f > t) { const tmp = f; f = t; t = tmp; }
    onChange({ from: f, to: t });
  };
  return (
    <div className="daterange">
      <div className="dr-field"><label>ตั้งแต่</label><input type="date" value={from || ''} onChange={(e) => set('from', e.target.value)} className="input" /></div>
      <div className="dr-sep">–</div>
      <div className="dr-field"><label>ถึง</label><input type="date" value={to || ''} onChange={(e) => set('to', e.target.value)} className="input" /></div>
      {(from || to) && <button type="button" className="mini-link dr-clear" onClick={() => { const t = todayLocal(); onChange({ from: t, to: t }); }}>ล้าง</button>}
    </div>
  );
}

export function inDateRange(dateStr, from, to) {
  if (!from && !to) return true;
  const d = (dateStr || '').slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export function fmtDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  if (!m) return '';
  return `${Number(m[3])} ${TH_M[Number(m[2]) - 1]} ${String(Number(m[1]) + 543).slice(2)}`;
}

export function fmtRange(from, to) {
  if (from && to) return from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`;
  if (from) return `ตั้งแต่ ${fmtDay(from)}`;
  if (to) return `ถึง ${fmtDay(to)}`;
  return 'ทั้งหมด';
}

export function Modal({ children, onClose }) {
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* Dialog system — alertDialog() / confirmDialog() return Promises.
   Call from anywhere: await confirmDialog({ title, message, confirmLabel, danger }) */
let dialogSeq = 0;
export function showDialog({ title, message, confirmLabel, danger, cancel }) {
  return new Promise((resolve) => {
    const id = ++dialogSeq;
    window.dispatchEvent(new CustomEvent('ifeew-dialog', { detail: { id, title, message, confirmLabel, danger, cancel, resolve } }));
  });
}

export function alertDialog({ title, message }) {
  return showDialog({ title, message });
}

export function confirmDialog({ title, message, confirmLabel = 'ยืนยัน', danger = false }) {
  return showDialog({ title, message, confirmLabel, danger, cancel: true });
}

export function DialogHost() {
  const [stack, setStack] = useState([]);
  useEffect(() => {
    const onDialog = (e) => setStack((prev) => [...prev, e.detail]);
    window.addEventListener('ifeew-dialog', onDialog);
    return () => window.removeEventListener('ifeew-dialog', onDialog);
  }, []);
  const close = (d, value) => {
    setStack((prev) => prev.filter((x) => x.id !== d.id));
    d.resolve(value);
  };
  if (stack.length === 0) return null;
  // M8: render คิว dialog ครบทุกใบ (ซ้อนกันได้) + ปุ่มยกเลิกชัดเจนสำหรับ confirm
  return (
    <>
      {stack.map((d, i) => (
        <div
          key={d.id}
          className="modal-ov"
          style={{ zIndex: 1000 + i }}
          onClick={() => { if (d.cancel) close(d, false); }}
        >
          <div className="modal dialog-modal" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
            {d.cancel && <button className="modal-x" onClick={() => close(d, false)} aria-label="ปิด"><X size={16} /></button>}
            <div className={`dialog-ic${d.danger ? ' danger' : ''}`}>
              {d.danger ? <TriangleAlert size={26} /> : <CheckCircle2 size={26} />}
            </div>
            <h3>{d.title}</h3>
            {d.message && <p>{d.message}</p>}
            <div className="modal-row">
              {d.cancel && (
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => close(d, false)}>ยกเลิก</button>
              )}
              <button className={`btn ${d.danger ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1 }} onClick={() => close(d, true)}>{d.confirmLabel || 'ตกลง'}</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
