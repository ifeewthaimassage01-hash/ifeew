import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Flower2 } from 'lucide-react';
import { RailDesktop, TopBar, BottomNav, NAV_ITEMS } from './components/Sidebar';
import { DialogHost } from './components/ui';
import RoleGate, { saveRole, clearRole } from './components/RoleGate';
import { loadData } from './data/store';
import { loadCloudData, scheduleSync, cloudStatus, syncState } from './data/cloudSync';
import { isSupabaseConfigured } from './lib/supabase';
import { subscribePosTables } from './lib/realtime';
import { bkkYear } from './utils/bkk';

// แยก chunk รายหน้า — โหลดเฉพาะหน้าที่เปิด (React.lazy + Suspense)
const PageDashboard = lazy(() => import('./pages/PageDashboard'));
const PagePOS = lazy(() => import('./pages/PagePOS'));
const PageBills = lazy(() => import('./pages/PageBills'));
const PageExpenses = lazy(() => import('./pages/PageExpenses'));
const PageCommission = lazy(() => import('./pages/PageCommission'));
const PageManage = lazy(() => import('./pages/PageManage'));

const ROLE_KEY = 'ifeew_role';
const VALID_ROLES = ['owner', 'staff'];
const DEFAULT_PAGE = { owner: 'dashboard', staff: 'pos' };

const PAGES = {
  dashboard: PageDashboard,
  pos: PagePOS,
  bills: PageBills,
  expenses: PageExpenses,
  commission: PageCommission,
  manage: PageManage,
};

// อ่าน role ที่เก็บไว้ — คืนค่าเฉพาะที่ถูกต้อง กันค่าแปลกปลอมใน storage
function loadRole() {
  try {
    const r = sessionStorage.getItem(ROLE_KEY);
    return VALID_ROLES.includes(r) ? r : null;
  } catch { return null; }
}

function LoadingScreen() {
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

export default function App() {
  const [role, setRole] = useState(loadRole);
  const [activePage, setActivePage] = useState(() => DEFAULT_PAGE[loadRole()] || 'pos');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [cloudMode, setCloudMode] = useState('local');
  const [cloudError, setCloudError] = useState('');
  const [live, setLive] = useState(false);

  // กัน role แปลกปลอม (เช่น storage ถูกแก้เอง) — ล้างแล้วเด้งกลับหน้าเลือกบทบาท
  useEffect(() => {
    if (role && !VALID_ROLES.includes(role)) {
      clearRole();
      setRole(null);
    }
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const local = loadData();
        if (!local) throw new Error('empty');
        if (!isSupabaseConfigured) {
          if (!cancelled) { setData(local); setCloudMode('local'); setCloudError('ไม่เจอ VITE_SUPABASE_URL/KEY — ต้อง restart dev server หลังสร้าง .env'); }
          return;
        }
        // Show local instantly, then try cloud
        if (!cancelled) { setData(local); setCloudMode('local'); }
        const cloud = await loadCloudData(local);
        if (!cancelled && cloud) {
          setData(cloud);
          setCloudMode(cloudStatus.mode);
          setCloudError('');
        } else if (!cancelled) {
          setCloudMode(cloudStatus.mode);
          setCloudError(cloudStatus.lastError || 'ต่อ cloud ไม่ได้ — ใช้ local สำรอง');
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError('โหลดข้อมูลเริ่มต้นไม่สำเร็จ');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime: reload on other devices' changes (read-only, never writes back).
  // Skips while our own sync is pending/recent so fresh local edits aren't
  // overwritten by stale cloud snapshots.
  // dep เป็น boolean ล้วน (dataReady) — ไม่ผูกกับ identity ของ object data
  const dataReady = !!data;
  useEffect(() => {
    if (!isSupabaseConfigured || !dataReady) return undefined;
    let cancelled = false;
    let timer = null;
    const reload = async () => {
      if (cancelled) return;
      if (syncState.pending > 0 || Date.now() - syncState.lastDone < 2000) return;
      try {
        const cloud = await loadCloudData(null);
        if (!cancelled && cloud) {
          setData(cloud);
          setCloudMode(cloudStatus.mode);
          setCloudError('');
        }
      } catch (err) {
        console.error('[realtime] reload failed:', err);
      }
    };
    const unsub = subscribePosTables(
      () => { clearTimeout(timer); timer = setTimeout(reload, 1000); },
      (status) => { if (!cancelled) setLive(status === 'SUBSCRIBED'); },
    );
    return () => { cancelled = true; clearTimeout(timer); unsub(); };
  }, [dataReady]);

  // stable ref — ผู้เรียกส่ง object ก้อนใหม่มาเองอยู่แล้ว ไม่ต้อง spread ซ้ำให้ re-render ฟรี
  const saveData = useCallback((newData) => {
    setData(newData);
    if (isSupabaseConfigured) scheduleSync(newData);
  }, []);

  // เปลี่ยนหน้าทีไร scroll กลับบนสุดเสมอ (รวม BottomNav มือถือ)
  const navigate = useCallback((key) => {
    setActivePage(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const selectRole = useCallback((r) => {
    if (!VALID_ROLES.includes(r)) return;
    saveRole(r);
    setRole(r);
    setActivePage(DEFAULT_PAGE[r]);
    window.scrollTo({ top: 0 });
  }, []);

  const exitRole = useCallback(() => {
    clearRole();
    setRole(null);
  }, []);

  const navItems = useMemo(() => NAV_ITEMS.filter((i) => i.roles.includes(role)), [role]);
  const safeKey = navItems.some((i) => i.key === activePage) ? activePage : navItems[0]?.key;
  const PageComponent = PAGES[safeKey] || PagePOS;
  const badges = useMemo(() => {
    const openCount = (data?.bills || []).filter((b) => b.status === 'open').length;
    return openCount > 0 ? { bills: openCount } : null;
  }, [data]);

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
    return <LoadingScreen />;
  }

  return (
    <div className="app">
      <div className="shell">
        <RailDesktop active={activePage} items={navItems} onNavigate={navigate} onExit={exitRole} badges={badges} />
        <div className="main-col">
          <TopBar active={activePage} items={navItems} role={role} onExit={exitRole} />
          <main className="page">
            <div className="container">
              <div className="rise" key={activePage}>
                <Suspense fallback={<div className="loadbar" role="status" aria-label="กำลังโหลดหน้า"><i /></div>}>
                  <PageComponent data={data} saveData={saveData} onNavigate={navigate} role={role} />
                </Suspense>
              </div>
            </div>
          </main>
          <footer className="foot">
            <div className="container">
              <span>I'FEEW Thai Massage — POS</span>
              <span title={cloudError || ''}>
                {cloudMode === 'cloud' ? '● Cloud เชื่อมแล้ว' : cloudMode === 'cloud-seeding' ? '● กำลังย้ายข้อมูลขึ้น Cloud…' : `○ Local mode${cloudError ? ` — ${cloudError}` : ''}`}{live ? ' · ● Live' : ''} · Clean & Warm Spa · {bkkYear()}
              </span>
            </div>
          </footer>
        </div>
      </div>
      <BottomNav active={activePage} items={navItems} onNavigate={navigate} badges={badges} />
      <DialogHost />
    </div>
  );
}
