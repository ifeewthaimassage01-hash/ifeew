import { useState, useEffect } from 'react';

export function PageHeader({ icon: Icon, title, subtitle, actions, eyebrow }) {
  return (
    <header className="pagehead">
      {eyebrow && <div className="eyebrow"><span>{eyebrow}</span></div>}
      <div className="pagehead-row">
        <div className="pagehead-main">
          {Icon && <div className="pagehead-icon"><Icon size={22} strokeWidth={1.8} /></div>}
          <div style={{ minWidth: 0 }}>
            <h1 className="h1">{title}</h1>
            {subtitle && <p className="lede">{subtitle}</p>}
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
      <div><h2>{title}</h2>{hint && <div className="muted">{hint}</div>}</div>
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
  if (status === 'cancelled') return <span className="badge void">✕ ยกเลิกแล้ว</span>;
  return <span className="badge info">◷ {status}</span>;
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

/* Lightweight toast bus — call toast('ข้อความ') from anywhere */
export function toast(message) {
  window.dispatchEvent(new CustomEvent('ifeew-toast', { detail: message }));
}

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let seq = 0;
    const onToast = (e) => {
      const id = ++seq;
      setItems((prev) => [...prev.slice(-2), { id, message: e.detail }]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600);
    };
    window.addEventListener('ifeew-toast', onToast);
    return () => window.removeEventListener('ifeew-toast', onToast);
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">✓ {t.message}</div>
      ))}
    </div>
  );
}
