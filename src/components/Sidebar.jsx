import { useState } from 'react';
import {
  LayoutDashboard, ReceiptText, FileText, LayoutGrid, Calculator,
  LogOut, Store, UserCheck, X,
} from 'lucide-react';
import { fmtBkk, bizToday } from '../utils/bkk';
import { Modal } from './ui';
import AttendanceCard from './AttendanceCard';

export const NAV_ITEMS = [
  { label: 'ภาพรวม', short: 'ภาพรวม', icon: LayoutDashboard, key: 'dashboard', roles: ['owner'] },
  { label: 'POS', short: 'POS', icon: ReceiptText, key: 'pos', roles: ['owner', 'staff'] },
  { label: 'บิล', short: 'บิล', icon: FileText, key: 'bills', roles: ['owner', 'staff'] },
  { label: 'รายจ่าย', short: 'รายจ่าย', icon: LayoutGrid, key: 'expenses', roles: ['owner', 'staff'] },
  { label: 'ค่าแรง', short: 'ค่าแรง', icon: Calculator, key: 'commission', roles: ['owner', 'staff'] },
  // "จัดการร้าน" ไว้ท้ายสุด — เป็นเมนูตั้งค่า ไม่ใช่งานประจำวัน
  { label: 'จัดการร้าน', short: 'จัดการ', icon: Store, key: 'manage', roles: ['owner'] },
];

export function RailDesktop({ active, items, onNavigate, onExit, badges, data, saveData, role }) {
  const [showCheckin, setShowCheckin] = useState(false);
  return (
    <>
    <aside className="rail">
      <div className="rail-in">
        <div className="rail-brand">
          <div className="mark"><img src="./logo.jpg" alt="I'FEEW" /></div>
          <div><b>I'FEEW</b><small>Thai Massage</small></div>
        </div>
        <nav className="rail-nav" aria-label="เมนูหลัก">
          {items.map((item) => {
            const Icon = item.icon;
            const count = badges?.[item.key] || 0;
            return (
              <button key={item.key} onClick={() => onNavigate(item.key)} className={`rail-btn${active === item.key ? ' on' : ''}`}>
                <span className="ri"><Icon size={20} strokeWidth={1.9} /></span>
                <span><b>{item.label}</b></span>
                {count > 0 && <span className="rail-badge">{count > 99 ? '99+' : count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="rail-foot">
          <div className="rail-status">
            <div className="rail-today">วันนี้</div>
            <div className="rail-date">{fmtBkk(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'short' })}</div>
            <button className="btn btn-ghost btn-block rail-ghost" onClick={() => setShowCheckin(true)}>
              <UserCheck size={16} strokeWidth={1.9} /> เช็กชื่อเข้างาน
            </button>
            <button className="btn btn-ghost btn-block rail-ghost" onClick={onExit}>
              <LogOut size={16} strokeWidth={1.9} /> สลับบทบาท / ออก
            </button>
          </div>
        </div>
      </div>
    </aside>
      {showCheckin && (
        <Modal onClose={() => setShowCheckin(false)}>
          <button className="modal-x" onClick={() => setShowCheckin(false)} aria-label="ปิด"><X size={16} /></button>
          <AttendanceCard data={data} saveData={saveData} dateStr={bizToday()} role={role} />
        </Modal>
      )}
    </>
  );
}

export function TopBar({ active, items, role, onExit, data, saveData }) {
  const [showCheckin, setShowCheckin] = useState(false);
  return (
    <>
    <div className="topbar">
      <div className="topbar-in">
        <div className="brand-mark"><img src="./logo.jpg" alt="I'FEEW" /></div>
        <div>
          <div className="brand-name">I'FEEW<small>Thai Massage</small></div>
        </div>
        <div className="topbar-spacer" />
        <span className="role-chip">{role === 'owner' ? 'เจ้าของร้าน' : 'พนักงาน'}</span>
        <button className="icon-btn" title="เช็กชื่อเข้างาน" onClick={() => setShowCheckin(true)} aria-label="เช็กชื่อเข้างาน">
          <UserCheck size={16} strokeWidth={1.9} />
        </button>
        <button className="icon-btn" title="สลับบทบาท / ออก" onClick={onExit} aria-label="ออกจากระบบ">
          <LogOut size={16} strokeWidth={1.9} />
        </button>
      </div>
    </div>
      {showCheckin && (
        <Modal onClose={() => setShowCheckin(false)}>
          <button className="modal-x" onClick={() => setShowCheckin(false)} aria-label="ปิด"><X size={16} /></button>
          <AttendanceCard data={data} saveData={saveData} dateStr={bizToday()} role={role} />
        </Modal>
      )}
    </>
  );
}

export function BottomNav({ active, items, onNavigate, badges }) {
  return (
    <nav className="bottomnav" aria-label="เมนูหลัก">
      <div className="bottomnav-in">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          const count = badges?.[item.key] || 0;
          const badge = count > 0 ? <span className="bnav-badge">{count > 99 ? '99+' : count}</span> : null;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={isActive ? 'on' : ''}
              {...(isActive ? { 'aria-current': 'page' } : {})}
            >
              <span className="bnav-ic"><Icon size={20} strokeWidth={1.9} />{badge}</span>
              <span className="bnav-label">{item.short}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
