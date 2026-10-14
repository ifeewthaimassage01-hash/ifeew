import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Flower2, TriangleAlert, WifiOff } from 'lucide-react';
import { RailDesktop, TopBar, BottomNav, NAV_ITEMS } from './components/Sidebar';
import { DialogHost } from './components/ui';
import RoleGate, { saveRole, clearRole, isOwnerSessionExpired } from './components/RoleGate';
import { loadCloudData, scheduleSync, cloudStatus, syncState, subscribeSyncStatus, retrySync } from './data/cloudSync';
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
// owner หมดอายุ 12 ชม. (isOwnerSessionExpired) → เด้งกลับหน้าเลือกบทบาท
function loadRole() {
  try {
    const r = sessionStorage.getItem(ROLE_KEY);
    if (!VALID_ROLES.includes(r)) return null;
    if (r === 'owner' && isOwnerSessionExpired()) {
      sessionStorage.removeItem(ROLE_KEY);
      return null;
    }
    return r;
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
  const [cloudMode, setCloudMode] = useState('cloud');
  const [cloudError, setCloudError] = useState('');
  const [live, setLive] = useState(false);
  // เตือนเน็ตหลุด / อัปโหลดล้ม — cloud-only จึงต้องบอก user ทันที ไม่เงียบ
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [syncErr, setSyncErr] = useState('');
  const dataRef = useRef(null);
  // minor: อัปเดต ref ใน effect (ไม่ assign ระหว่าง render)
  useEffect(() => { dataRef.current = data; }, [data]);
  // C5: นับ modal ที่เปิดอยู่ — realtime reload ข้ามตอนมี modal กันทับ wizard/dialog
  const modalOpenRef = useRef(0);
  useEffect(() => {
    const onModal = (e) => { modalOpenRef.current = e.detail?.open || 0; };
    window.addEventListener('ifeew-modal', onModal);
    return () => window.removeEventListener('ifeew-modal', onModal);
  }, []);

  // ฟังสถานะเน็ต + สถานะ sync (เน็ตกลับเมื่อไร sync ทันที)
  useEffect(() => {
    const on = () => { setOnline(true); if (dataRef.current) scheduleSync(dataRef.current); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => subscribeSyncStatus((s) => {
    setCloudMode(s.mode);
    setCloudError(s.mode === 'error' ? s.error : '');
    setSyncErr(s.mode === 'error' ? (s.error || 'อัปโหลดไม่สำเร็จ') : '');
  }), []);

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
        if (!isSupabaseConfigured) {
          if (!cancelled) setLoadError('ต้องตั้งค่า Supabase (.env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) แล้ว restart');
          return;
        }
        // Cloud-only: โหลดจาก Supabase อย่างเดียว ไม่มีการแสดงข้อมูลก่อน
        const cloud = await loadCloudData();
        if (!cancelled && cloud) {
          setData(cloud);
          setCloudMode(cloudStatus.mode);
          setCloudError('');
        } else if (!cancelled) {
          // โหลดล้มเหลว: แสดง error screen พร้อมปุ่มรีเฟรช ห้าม fallback เงียบ
          setLoadError(cloudStatus.lastError || 'ต่อ cloud ไม่ได้ — กดรีเฟรชเพื่อลองใหม่');
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError(err?.message || cloudStatus.lastError || 'โหลดข้อมูลจาก cloud ไม่สำเร็จ — กดรีเฟรชเพื่อลองใหม่');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime: reload on other devices' changes (read-only, never writes back).
  // Skips while our own sync is pending/recent so fresh edits aren't
  // overwritten by stale cloud snapshots.
  // dep เป็น boolean ล้วน (dataReady) — ไม่ผูกกับ identity ของ object data
  const dataReady = !!data;
  useEffect(() => {
    if (!isSupabaseConfigured || !dataReady) return undefined;
    let cancelled = false;
    let timer = null;
    const reload = async () => {
      if (cancelled) return;
      if (modalOpenRef.current > 0) return;
      if (syncState.pending > 0 || Date.now() - syncState.lastDone < 2000) return;
      try {
        // quiet: reload เบื้องหลังล้มไม่ขึ้น banner แดง (ข้อมูลปัจจุบันยังดีอยู่)
        const cloud = await loadCloudData({ quiet: true });
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
  // cloud-only: บันทึกทุกครั้ง scheduleSync ลง Supabase เสมอ
  const saveData = useCallback((newData) => {
    setData(newData);
    scheduleSync(newData);
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
              {/* M2: banner รวมอันเดียว (offline ชนะ) + sticky ไม่ดัน wizard */}
              {(!online || syncErr) && (
                <div className="err-banner net-banner" role="alert">
                  {!online ? (
                    <>
                      <WifiOff size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>ไม่มีเน็ต — ข้อมูลที่บันทึกจะยังไม่ขึ้น cloud จนกว่าเน็ตจะกลับ (กลับมาแล้วระบบจะ sync ให้เอง)</span>
                    </>
                  ) : (
                    <>
                      <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span style={{ flex: 1 }}>อัปโหลดขึ้น cloud ไม่สำเร็จ — {syncErr}</span>
                      <button type="button" className="btn btn-ghost btn-sm net-retry" style={{ flexShrink: 0 }} onClick={() => { if (data) retrySync(data).catch(() => {}); }}>ลองอีกครั้ง</button>
                    </>
                  )}
                </div>
              )}
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
                {cloudMode === 'cloud' ? '● Cloud เชื่อมแล้ว' : `○ เกิดข้อผิดพลาด${cloudError ? ` — ${cloudError}` : ''}`}{live ? ' · ● Live' : ''} · Clean & Warm Spa · {bkkYear()}
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
