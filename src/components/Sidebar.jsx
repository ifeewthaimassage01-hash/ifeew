import {
  ReceiptText, FileText, Wallet, LayoutGrid, Calculator,
  ShieldCheck, Flower2,
} from 'lucide-react';

export const NAV_ITEMS = [
  { label: 'POS ขายหน้าร้าน', short: 'POS', sub: 'เปิดบิล · 3 ขั้นตอน', icon: ReceiptText, key: 'pos' },
  { label: 'ประวัติบิล', short: 'บิล', sub: 'ค้นหา · ตรวจสอบ · Void', icon: FileText, key: 'bills' },
  { label: 'ลิ้นชักเงินสด', short: 'เงินสด', sub: 'นับจริง · กระทบยอด', icon: Wallet, key: 'cash' },
  { label: 'ค่าใช้จ่าย', short: 'ค่าใช้จ่าย', sub: 'บันทึกรายจ่าย', icon: LayoutGrid, key: 'expenses' },
  { label: 'ค่าคอมมิชชัน', short: 'คอมฯ', sub: 'สรุป Flat / Tier', icon: Calculator, key: 'commission' },
  { label: 'สรุปปิดวัน', short: 'ปิดวัน', sub: 'EOD · Audit Trail', icon: ShieldCheck, key: 'eod' },
];

export function RailDesktop({ active, onNavigate }) {
  return (
    <aside className="rail">
      <div className="rail-in">
        <div className="rail-brand">
          <div className="mark"><Flower2 size={24} strokeWidth={1.5} /></div>
          <div><b>I'FEEW</b><small>Thai Massage & Spa</small></div>
        </div>
        <div className="rail-label">เมนูหลัก</div>
        <nav className="rail-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} onClick={() => onNavigate(item.key)} className={`rail-btn${active === item.key ? ' on' : ''}`}>
                <span className="ri"><Icon size={18} strokeWidth={1.9} /></span>
                <span><b>{item.label}</b><small>{item.sub}</small></span>
              </button>
            );
          })}
        </nav>
        <div className="rail-foot">
          <div className="rail-status">
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.6 }}>วันนี้</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
            <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>กะเช้า · พร้อมขาย</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function TopBar({ active }) {
  const current = NAV_ITEMS.find((n) => n.key === active);
  return (
    <div className="topbar">
      <div className="topbar-in">
        <div className="brand-mark"><Flower2 size={21} strokeWidth={1.6} /></div>
        <div>
          <div className="brand-name">I'FEEW<small>Thai Massage & Spa</small></div>
        </div>
        <div className="topbar-spacer" />
        <div className="date-chip show-desktop"> <b>{current?.label}</b> · {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <span className="status-pill"><i className="pulse" /> พร้อมขาย</span>
      </div>
    </div>
  );
}

export function BottomNav({ active, onNavigate }) {
  return (
    <nav className="bottomnav" aria-label="เมนูหลัก">
      <div className="bottomnav-in">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isFab = item.key === 'pos';
          if (isFab) {
            return (
              <button key={item.key} onClick={() => onNavigate(item.key)} className={`fab${active === item.key ? ' on' : ''}`}>
                <span className="fab-dot"><Icon size={22} strokeWidth={2.1} /></span>
                <span>{item.short}</span>
              </button>
            );
          }
          return (
            <button key={item.key} onClick={() => onNavigate(item.key)} className={active === item.key ? 'on' : ''}>
              <Icon size={21} strokeWidth={active === item.key ? 2.2 : 1.7} />
              <span>{item.short}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
