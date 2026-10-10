import { useState, useEffect } from 'react';
import { Flower2 } from 'lucide-react';
import { RailDesktop, TopBar, BottomNav, NAV_ITEMS } from './components/Sidebar';
import { DialogHost } from './components/ui';
import RoleGate, { saveRole, clearRole } from './components/RoleGate';
import PageDashboard from './pages/PageDashboard';
import PagePOS from './pages/PagePOS';
import PageBills from './pages/PageBills';
import PageExpenses from './pages/PageExpenses';
import PageCommission from './pages/PageCommission';
import PageManage from './pages/PageManage';
import { loadData, persistData } from './data/demoData';

const ROLE_KEY = 'ifeew_role';
const DEFAULT_PAGE = { owner: 'dashboard', staff: 'pos' };

const PAGES = {
  dashboard: PageDashboard,
  pos: PagePOS,
  bills: PageBills,
  expenses: PageExpenses,
  commission: PageCommission,
  manage: PageManage,
};

function loadRole() {
  try { return sessionStorage.getItem(ROLE_KEY); } catch { return null; }
}

export default function App() {
  const [role, setRole] = useState(loadRole);
  const [activePage, setActivePage] = useState(() => DEFAULT_PAGE[loadRole()] || 'pos');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    try {
      const d = loadData();
      if (!d) throw new Error('empty');
      setData(d);
    } catch (err) {
      console.error(err);
      setLoadError('โหลดข้อมูลเริ่มต้นไม่สำเร็จ');
    }
  }, []);

  const saveData = (newData) => {
    try { persistData(newData); } catch (err) { console.error(err); }
    setData({ ...newData });
  };

  const navigate = (key) => {
    setActivePage(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectRole = (r) => {
    saveRole(r);
    setRole(r);
    setActivePage(DEFAULT_PAGE[r]);
    window.scrollTo({ top: 0 });
  };

  const exitRole = () => {
    clearRole();
    setRole(null);
  };

  if (!role) {
    return (
      <div className="app">
        <RoleGate onSelect={selectRole} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="loading-screen">
        <div className="card" style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <h2>เกิดข้อผิดพลาด</h2>
          <p className="muted">{loadError}</p>
          <br />
          <button className="btn btn-primary btn-block" onClick={() => window.location.reload()}>รีเฟรช</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <div className="loading-mark"><Flower2 size={30} strokeWidth={1.4} /></div>
          <h2>I'FEEW</h2>
          <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.6, marginTop: 4 }}>Thai Massage </p>
          <div className="loadbar"><i /></div>
        </div>
      </div>
    );
  }

  const navItems = NAV_ITEMS.filter((i) => i.roles.includes(role));
  const PageComponent = PAGES[navItems.some((i) => i.key === activePage) ? activePage : navItems[0].key] || PagePOS;

  return (
    <div className="app">
      <div className="shell">
        <RailDesktop active={activePage} items={navItems} onNavigate={navigate} onExit={exitRole} />
        <div className="main-col">
          <TopBar active={activePage} items={navItems} role={role} onExit={exitRole} />
          <main className="page">
            <div className="container">
              <div className="rise" key={activePage}>
                <PageComponent data={data} saveData={saveData} onNavigate={navigate} role={role} />
              </div>
            </div>
          </main>
          <footer className="foot">
            <div className="container">
              <span>I'FEEW Thai Massage — POS & Back-Office</span>
              <span>Clean & Warm Spa · {new Date().getFullYear()}</span>
            </div>
          </footer>
        </div>
      </div>
      <BottomNav active={activePage} items={navItems} onNavigate={navigate} />
      <DialogHost />
    </div>
  );
}
