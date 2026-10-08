import { useState, useEffect } from 'react';
import { Flower2 } from 'lucide-react';
import { RailDesktop, TopBar, BottomNav } from './components/Sidebar';
import { Toaster } from './components/ui';
import PagePOS from './pages/PagePOS';
import PageBills from './pages/PageBills';
import PageCashDrawer from './pages/PageCashDrawer';
import PageExpenses from './pages/PageExpenses';
import PageCommission from './pages/PageCommission';
import PageEOD from './pages/PageEOD';
import { loadData, persistData } from './data/demoData';

const PAGES = {
  pos: PagePOS,
  bills: PageBills,
  cash: PageCashDrawer,
  expenses: PageExpenses,
  commission: PageCommission,
  eod: PageEOD,
};

export default function App() {
  const [activePage, setActivePage] = useState('pos');
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
          <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.6, marginTop: 4 }}>Thai Massage & Spa</p>
          <div className="loadbar"><i /></div>
        </div>
      </div>
    );
  }

  const PageComponent = PAGES[activePage] || PagePOS;

  return (
    <div className="app">
      <div className="shell">
        <RailDesktop active={activePage} onNavigate={navigate} />
        <div className="main-col">
          <TopBar active={activePage} />
          <main className="page">
            <div className="container">
              <div className="rise" key={activePage}>
                <PageComponent data={data} saveData={saveData} onNavigate={navigate} />
              </div>
            </div>
          </main>
          <footer className="foot">
            <div className="container">
              <span>I'FEEW Thai Massage & Spa — POS & Back-Office</span>
              <span>Clean & Warm Spa · {new Date().getFullYear()}</span>
            </div>
          </footer>
        </div>
      </div>
      <BottomNav active={activePage} onNavigate={navigate} />
      <Toaster />
    </div>
  );
}
