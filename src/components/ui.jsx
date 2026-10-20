import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, TriangleAlert, X, ExternalLink } from 'lucide-react';

export function PageHeader({ icon: Icon, title, subtitle, actions, eyebrow }) {
  return (
    <header className="pagehead">
      {eyebrow && <div className="eyebrow"><span>{eyebrow}</span></div>}
      <div className="pagehead-row">
        <div className="pagehead-main">
          {Icon && <div className="pagehead-icon"><Icon size={22} strokeWidth={1.8} /></div>}
          <div style={{ minWidth: 0 }}>
            <h1 className="h1">{title}</h1>
            {subtitle && <p className="muted" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
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
    <div className="empty" role="status">
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
  if (status === 'merged') return <span className="badge neutral">⇉ รวมเข้าบิลอื่นแล้ว</span>;
  return <span className="badge info">◷ {status}</span>;
}

/* Lightbox ดูรูปเต็มจอ (มาตรฐานเดียวทั้งแอป เหมือนแท็บ "ประวัติการจ่าย")
   — url null/ว่าง = ไม่ render · สำหรับ "รูป" เท่านั้น (PDF ให้ caller คงลิงก์เปิดแท็บใหม่) */
export function Lightbox({ url, title = 'รูป', onClose }) {
  if (!url) return null;
  return (
    <Modal onClose={onClose}>
      <button className="modal-x" onClick={onClose} aria-label="ปิด"><X size={16} /></button>
      <h3>{title}</h3>
      <img src={url} alt={title} className="lb-img" />
      <a href={url} target="_blank" rel="noopener noreferrer" className="lb-bar">
        <ExternalLink size={13} /> เปิดในแท็บใหม่
      </a>
    </Modal>
  );
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

/* ตัวกรองวันที่เดียว — date picker เลือกวันเดียว (ว่าง = แสดงทั้งหมด, ปุ่มล้าง = ล้างตัวกรอง) */
export function DatePicker({ date, onChange }) {
  return (
    <div className="daterange">
      <div className="dr-field"><label>วันที่</label><input type="date" value={date || ''} onChange={(e) => onChange(e.target.value)} className="input" /></div>
      {date && <button type="button" className="mini-link dr-clear" onClick={() => onChange('')} title="ล้างตัวกรองวันที่">ล้าง</button>}
    </div>
  );
}

export function inSingleDay(dateStr, selected) {
  if (!selected) return true;
  return (dateStr || '').slice(0, 10) === selected;
}

const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export function fmtDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
  if (!m) return '';
  return `${Number(m[3])} ${TH_M[Number(m[2]) - 1]} ${String(Number(m[1]) + 543).slice(2)}`;
}

// modal stack — Esc ปิดเฉพาะ modal บนสุด (กัน modal ซ้อน modal เช่น lightbox บน checkout
// ถูก Esc ปิดพร้อมกันทั้งคู่ เพราะทุก modal ฟัง keydown ที่ document)
const modalStack = [];
export function Modal({ children, onClose }) {
  const boxRef = useRef(null);
  const prevRef = useRef(null);
  const stackRef = useRef({});
  // เก็บ onClose ล่าสุดใน ref — effect ต้องรันครั้งเดียวตอน mount เท่านั้น
  // (ทุกที่ส่ง onClose เป็น inline arrow = reference ใหม่ทุก render ถ้าใส่ใน deps
  // effect จะรันซ้ำทุกครั้งที่พิมพ์ → โฟกัสโดนดึงกลับไปปุ่ม X พิมพ์ต่อไม่ได้)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    prevRef.current = document.activeElement;
    const box = boxRef.current;
    const id = stackRef.current;
    modalStack.push(id);
    // โฟกัสช่องกรอกก่อน (ถ้ามี) ไม่ใช่ปุ่ม X — กันคีย์บอร์ดมือถือหลุดตอนพิมพ์
    (box?.querySelector('input, select, textarea') || box?.querySelector('button'))?.focus?.();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (modalStack[modalStack.length - 1] !== id) return; // ไม่ใช่ modal บนสุด — ข้าม
        e.preventDefault(); closeRef.current?.();
      }
      else if (e.key === 'Tab' && box) {
        const f = [...box.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.disabled);
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      const i = modalStack.indexOf(id);
      if (i >= 0) modalStack.splice(i, 1);
      document.removeEventListener('keydown', onKey);
      if (prevRef.current?.focus) prevRef.current.focus();
    };
  }, []);
  return (
    <div className="modal-ov" onClick={onClose}>
      <div ref={boxRef} className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
  const prevFocus = useRef(null);
  const topRef = useRef(null);
  useEffect(() => {
    const onDialog = (e) => {
      setStack((prev) => {
        if (prev.length === 0) prevFocus.current = document.activeElement;
        return [...prev, e.detail];
      });
    };
    window.addEventListener('ifeew-dialog', onDialog);
    return () => window.removeEventListener('ifeew-dialog', onDialog);
  }, []);
  const close = (d, value) => {
    setStack((prev) => prev.filter((x) => x.id !== d.id));
    d.resolve(value);
  };
  // C5: บอก App ว่ามี modal เปิดอยู่กี่ใบ — App ข้าม realtime reload กันทับ wizard
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ifeew-modal', { detail: { open: stack.length } }));
    if (stack.length === 0) {
      if (prevFocus.current?.focus) prevFocus.current.focus();
      prevFocus.current = null;
    }
  }, [stack.length]);
  // C2: ESC ปิดใบบนสุด + โฟกัสปุ่มแรก + trap Tab ในใบบนสุด
  useEffect(() => {
    if (stack.length === 0) return undefined;
    const top = stack[stack.length - 1];
    const t = setTimeout(() => {
      topRef.current?.querySelector('.modal-row .btn, .modal-x')?.focus?.();
    }, 0);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(top, top.cancel ? false : true);
      } else if (e.key === 'Tab' && topRef.current) {
        const f = [...topRef.current.querySelectorAll('button')]
          .filter((el) => !el.disabled);
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey, true); };
  }, [stack.length]);
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
          <div className="modal dialog-modal" ref={i === stack.length - 1 ? topRef : undefined} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label={d.title}>
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
