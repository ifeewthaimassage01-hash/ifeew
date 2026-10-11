import {
  LayoutDashboard, ReceiptText, FileText, LayoutGrid, Calculator,
  Flower2, LogOut, Store,
} from 'lucide-react';
import { fmtBkk } from '../utils/bkk';

export const NAV_ITEMS = [
  { label: 'ภาพรวม', short: 'ภาพรวม', sub: 'ยอดขาย · กำไร · ท็อป', icon: LayoutDashboard, key: 'dashboard', roles: ['owner'] },
  { label: 'POS', short: 'POS', sub: 'เปิดบิล · จอเดียว', icon: ReceiptText, key: 'pos', roles: ['owner', 'staff'] },
  { label: 'บิล', short: 'บิล', sub: 'เปิดอยู่ · ประวัติ', icon: FileText, key: 'bills', roles: ['owner', 'staff'] },
  { label: 'รายจ่าย', short: 'รายจ่าย', sub: 'บันทึกรายจ่าย', icon: LayoutGrid, key: 'expenses', roles: ['owner', 'staff'] },
  { label: 'จัดการร้าน', short: 'จัดการร้าน', sub: 'พนักงาน · บริการ', icon: Store, key: 'manage', roles: ['owner'] },
  { label: 'ค่าแรง', short: 'ค่าแรง', sub: 'หมอประจำ · หมอวิ่ง', icon: Calculator, key: 'commission', roles: ['owner', 'staff'] },
];

export function RailDesktop({ active, items, onNavigate, onExit, badges }) {
  return (
    <aside className="rail">
      <div className="rail-in">
        <div className="rail-brand">
          <div className="mark"><Flower2 size={24} strokeWidth={1.5} /></div>
          <div><b>I'FEEW</b><small>Thai Massage</small></div>
        </div>
        <div className="rail-label">เมนูหลัก</div>
        <nav className="rail-nav">
          {items.map((item) => {
            const Icon = item.icon;
            const count = badges?.[item.key] || 0;
            return (
              <button key={item.key} onClick={() => onNavigate(item.key)} className={`rail-btn${active === item.key ? ' on' : ''}`}>
                <span className="ri"><Icon size={18} strokeWidth={1.9} /></span>
                <span><b>{item.label}</b></span>
                {count > 0 && <span className="rail-badge">{count > 99 ? '99+' : count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="rail-foot">
          <div className="rail-status">
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.6 }}>วันนี้</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{fmtBkk(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'short' })}</div>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10, padding: '9px 10px', fontSize: 12.5 }} onClick={onExit}>
              <LogOut size={15} /> สลับบทบาท / ออก
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function TopBar({ active, items, role, onExit }) {
  const current = items.find((n) => n.key === active) || items[0];
  return (
    <div className="topbar">
      <div className="topbar-in">
        <div className="brand-mark"><Flower2 size={21} strokeWidth={1.6} /></div>
        <div>
          <div className="brand-name">I'FEEW<small>Thai Massage</small></div>
        </div>
        <div className="topbar-spacer" />
        <div className="date-chip show-desktop"> <b>{current?.label}</b> · {fmtBkk(new Date().toISOString(), { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <span className="role-chip">{role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}</span>
        <button className="icon-btn" title="สลับบทบาท / ออก" onClick={onExit} aria-label="ออกจากระบบ">
          <LogOut size={17} />
        </button>
      </div>
    </div>
  );
}

export function BottomNav({ active, items, onNavigate, badges }) {
  return (
    <nav className="bottomnav" aria-label="เมนูหลัก">
      <div className="bottomnav-in" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const count = badges?.[item.key] || 0;
          const badge = count > 0 ? <span className="bnav-badge">{count > 99 ? '99+' : count}</span> : null;
          if (isActive) {
            return (
              <button key={item.key} onClick={() => onNavigate(item.key)} className="fab on" aria-current="page">
                <span className="fab-dot"><Icon size={22} strokeWidth={2.1} />{badge}</span>
                <span>{item.short}</span>
              </button>
            );
          }
          return (
            <button key={item.key} onClick={() => onNavigate(item.key)}>
              <span className="bnav-ic"><Icon size={21} strokeWidth={1.7} />{badge}</span>
              <span>{item.short}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
