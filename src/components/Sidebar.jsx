import { useState } from 'react';
import {
  LayoutDashboard, ReceiptText, FileText, LayoutGrid, Calculator,
  LogOut, Store, UserCheck, X, CalendarCheck, Menu, ChevronRight,
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
  // "จองออนไลน์" — งานประจำวันของเจ้าของร้าน (ยืนยัน/ปฏิเสธการจองจากเว็บไซต์)
  { label: 'จองออนไลน์', short: 'จองออนไลน์', icon: CalendarCheck, key: 'bookings', roles: ['owner'] },
  // "จัดการร้าน" ไว้ท้ายสุด — เป็นเมนูตั้งค่า ไม่ใช่งานประจำวัน
  { label: 'จัดการร้าน', short: 'จัดการ', icon: Store, key: 'manage', roles: ['owner'] },
];

/* เมนูล่าง (มือถือ/แท็บเล็ต) แสดงได้สูงสุด 5 ทาง — ที่เหลือ (จองออนไลน์/จัดการร้าน)
   อยู่ในเมนูแนวนอนของแถบด้านบน เพื่อให้แต่ละช่องกดง่ายและตัวอักษรไม่ต้องหด */
export const PRIMARY_KEYS = ['dashboard', 'pos', 'bills', 'expenses', 'commission'];


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

export function TopBar({ active, items, role, onNavigate, onExit, data, saveData }) {
  const [showCheckin, setShowCheckin] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const secondary = items.filter((i) => !PRIMARY_KEYS.includes(i.key));
  const onSecondary = secondary.some((i) => i.key === active);
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
        <button
          className={`icon-btn${onSecondary ? ' on' : ''}`}
          title="เมนูเพิ่มเติม"
          onClick={() => setShowMenu(true)}
          aria-label="เมนูเพิ่มเติม"
          aria-haspopup="dialog"
        >
          <Menu size={20} strokeWidth={1.9} />
          {onSecondary && <span className="icon-btn-dot" aria-hidden="true" />}
        </button>
      </div>
    </div>
      {showMenu && (
        <Modal onClose={() => setShowMenu(false)}>
          <button className="modal-x" onClick={() => setShowMenu(false)} aria-label="ปิด"><X size={16} /></button>
          <div className="navsheet-title">เมนูร้าน</div>
          <nav className="navsheet" aria-label="เมนูเพิ่มเติม">
            {secondary.map((item) => {
              const Icon = item.icon;
              const isOn = active === item.key;
              return (
                <button
                  key={item.key}
                  className={`navsheet-row${isOn ? ' on' : ''}`}
                  onClick={() => { setShowMenu(false); onNavigate(item.key); }}
                  {...(isOn ? { 'aria-current': 'page' } : {})}
                >
                  <span className="ni"><Icon size={19} strokeWidth={1.9} /></span>
                  <span>{item.label}</span>
                  <ChevronRight size={17} className="chev" aria-hidden="true" />
                </button>
              );
            })}
            <button className="navsheet-row" onClick={() => { setShowMenu(false); setShowCheckin(true); }}>
              <span className="ni"><UserCheck size={19} strokeWidth={1.9} /></span>
              <span>เช็กชื่อเข้างาน</span>
              <ChevronRight size={17} className="chev" aria-hidden="true" />
            </button>
            <button className="navsheet-row danger" onClick={() => { setShowMenu(false); onExit(); }}>
              <span className="ni"><LogOut size={19} strokeWidth={1.9} /></span>
              <span>สลับบทบาท / ออก</span>
              <ChevronRight size={17} className="chev" aria-hidden="true" />
            </button>
          </nav>
        </Modal>
      )}
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
  const shown = items.slice(0, 5);
  return (
    <nav className="bottomnav" aria-label="เมนูหลัก">
      <div className="bottomnav-in">
        {shown.map((item) => {
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
              <span className="bnav-ic"><Icon size={21} strokeWidth={1.9} />{badge}</span>
              <span className="bnav-label">{item.short}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
