import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { TriangleAlert, WifiOff } from 'lucide-react';
import { RailDesktop, TopBar, BottomNav, NAV_ITEMS } from './components/Sidebar';
import { DialogHost } from './components/ui';
import UpdateBanner from './components/UpdateBanner';
import RoleGate, { saveRole, clearRole, isOwnerSessionExpired } from './components/RoleGate';
import { loadCloudData, scheduleSync, cloudStatus, syncState, subscribeSyncStatus, retrySync, deleteExpenseFromCloud } from './data/cloudSync';
import { isSupabaseConfigured } from './lib/supabase';
import { subscribePosTables } from './lib/realtime';
import { bkkYear, bizToday } from './utils/bkk';
import { ensureGuaranteeEntries, reconcileGuaranteeEntries, guaranteeSigOf } from './lib/billing';
import { checkForUpdate, applyUpdate, CHECK_INTERVAL_MS, markUpdateAttempt, getUpdateAttempt, setAutoReloadGuard } from './lib/updateCheck';
import * as billingMod from './lib/billing';

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

// อัปเดตแอป: นับถอยหลังก่อนรีเฟรชอัตโนมัติ + เวลาที่เลื่อนออกเมื่อมี modal เปิดอยู่
const UPDATE_COUNTDOWN_SEC = 30;
const UPDATE_DEFER_SEC = 5;

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
        <div className="loading-mark"><img src="./logo.jpg" alt="I'FEEW" /></div>
        <h2>I'FEEW</h2>
        <p style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.6, marginTop: 4 }}>Thai Massage </p>
        <div className="loadbar"><i /></div>
      </div>
    </div>
  );
}

// P1-7: วันที่ก่อนหน้าแบบปฏิทิน (YYYY-MM-DD) — ใช้คู่ bizToday กันบิลข้ามเที่ยงคืน
function prevDayStr(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function AppShell() {
  // URL (hash) คือ source ของหน้าปัจจุบัน — path เช่น /bills ↔ key 'bills'
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [role, setRole] = useState(loadRole);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [cloudMode, setCloudMode] = useState('cloud');
  const [cloudError, setCloudError] = useState('');
  const [live, setLive] = useState(false);
  // เตือนเน็ตหลุด / อัปโหลดล้ม — cloud-only จึงต้องบอก user ทันที ไม่เงียบ
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [syncErr, setSyncErr] = useState('');
  // แจ้งเตือน deployment ใหม่: เวอร์ชันที่เจอ + นับถอยหลังก่อนรีเฟรชอัตโนมัติ
  const [latestVersion, setLatestVersion] = useState('');
  const [updateSeconds, setUpdateSeconds] = useState(UPDATE_COUNTDOWN_SEC);
  const [updateBusy, setUpdateBusy] = useState(false);
  const dataRef = useRef(null);
  // minor: อัปเดต ref ใน effect (ไม่ assign ระหว่าง render)
  useEffect(() => { dataRef.current = data; }, [data]);
  // C5: นับ modal ที่เปิดอยู่ — realtime reload ข้ามตอนมี modal กันทับ wizard/dialog
  const modalOpenRef = useRef(0);
  // P1-7: trigger ประกันมือรอบเปิดแอป — รันครั้งเดียวต่อรอบโหลด (guard กัน StrictMode
  // double-invoke + กัน loop กับ realtime: realtime ใช้ quiet reload คนละ effect ไม่ผ่านตรงนี้)
  const guaranteeBootRef = useRef(false);
  useEffect(() => {
    const onModal = (e) => { modalOpenRef.current = e.detail?.open || 0; };
    window.addEventListener('ifeew-modal', onModal);
    return () => window.removeEventListener('ifeew-modal', onModal);
  }, []);

  // มี modal เปิดอยู่ไหม — modalOpenRef นับเฉพาะ dialog กลางของแอป (DialogHost)
  // แต่ modal ฟอร์มทั่วไป (เช่น wizard เปิดบิล) ก็ต้องกันรีเฟรชเหมือนกัน → เช็ค .modal-ov ด้วย
  const hasOpenModal = () => modalOpenRef.current > 0 || !!document.querySelector('.modal-ov');

  // ตอน SW อัปเดตเองแล้วจะรีเฟรช (กู้หน้าค้างเป็นของเก่า) — ถ้ามี modal เปิดอยู่ให้รอก่อน กันทับงาน
  useEffect(() => {
    setAutoReloadGuard(() => !hasOpenModal());
    return () => setAutoReloadGuard(() => true);
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

  /* ---------- ตรวจ deployment ใหม่ + อัปเดตแอปตัวเอง ---------- */
  // เวอร์ชันที่ผู้ใช้กดปิดแบนเนอร์ ("ไว้ก่อน") — ไม่โผล่ซ้ำจนกว่าจะมีเวอร์ชันใหม่กว่านี้
  const dismissedVersionRef = useRef('');
  // กันกด/รีเฟรชซ้ำ (applyUpdate จะ reload หน้าเลย)
  const updateBusyRef = useRef(false);
  // เวอร์ชันที่เคยพยายามอัปเดตแล้วแต่ไม่สำเร็จ — กันรีเฟรชวนไม่รู้จบ
  const attemptedRef = useRef(getUpdateAttempt());

  // poll version.json ที่ปล่อยตอน build (ไม่ถูก precache → ได้ของล่าสุดจาก server เสมอ)
  // — dev ไม่ต้องเช็ค (build ใหม่ทุกครั้งที่ save + กันรีเฟรชตอนพัฒนา)
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    let alive = true;
    const check = async () => {
      try {
        const v = await checkForUpdate();
        if (!alive || !v) return;
        if (v === dismissedVersionRef.current) return; // ผู้ใช้สั่ง "ไว้ก่อน" เวอร์ชันนี้
        if (v === attemptedRef.current) {
          // เคยพยายามอัปเดตเวอร์ชันนี้แล้วแต่แอปยังเป็นเวอร์ชันเก่า → ห้ามรีเฟรชวนซ้ำ
          // (แก้ได้ด้วยปุ่ม "ตรวจสอบอัปเดต" ในหน้าจัดการร้าน)
          console.warn('[update] อัปเดตเวอร์ชัน', v, 'มาแล้วแต่ยังไม่สำเร็จ — งดรีเฟรชอัตโนมัติ');
          return;
        }
        setLatestVersion((prev) => (prev === v ? prev : v));
        setUpdateSeconds(UPDATE_COUNTDOWN_SEC);
      } catch (e) {
        console.warn('[update] ตรวจเวอร์ชันไม่สำเร็จ:', e);
      }
    };
    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    // กลับมาแท็บที่มองเห็น / เน็ตกลับมา → เช็คทันที ไม่รอรอบถัดไป
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, []);

  // นับถอยหลังขึ้นลง (วินาที) ตอนมีเวอร์ชันใหม่รออยู่
  useEffect(() => {
    if (!latestVersion) return undefined;
    const t = setInterval(() => {
      setUpdateSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [latestVersion]);

  // อัปเดตจริง: จำเวอร์ชันไว้กันลูป + อัปเดต SW → รอคว้าควบคุม → ล้าง cache → รีเฟรช
  const runUpdate = useCallback((v) => {
    if (updateBusyRef.current) return;
    updateBusyRef.current = true;
    setUpdateBusy(true);
    markUpdateAttempt(v);
    applyUpdate();
  }, []);

  // ครบเวลาแล้วรีเฟรชอัตโนมัติ — แต่ถ้ามี modal เปิดอยู่ (wizard/checkout) ให้เลื่อนออกไปก่อน
  useEffect(() => {
    if (!latestVersion || updateSeconds > 0) return;
    if (updateBusyRef.current) return;
    if (hasOpenModal()) { setUpdateSeconds(UPDATE_DEFER_SEC); return; } // มี modal เปิดอยู่ — เลื่อนออกไปก่อน อย่ารีเฟรชทับงาน
    runUpdate(latestVersion);
  }, [latestVersion, updateSeconds, runUpdate]);

  // ผู้ใช้โต้ตอบอยู่ (คลิก/พิมพ์) → ยืดเวลารอ กันรีเฟรชกลางออเดอร์
  useEffect(() => {
    if (!latestVersion) return undefined;
    const reset = () => { if (!updateBusyRef.current) setUpdateSeconds(UPDATE_COUNTDOWN_SEC); };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    return () => {
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [latestVersion]);

  // กด "อัปเดตเลย" ในแบนเนอร์ → อัปเดต SW + ล้าง cache + รีเฟรชทันที
  const applyUpdateNow = useCallback(() => {
    runUpdate(latestVersion);
  }, [latestVersion, runUpdate]);

  // กด X ที่แบนเนอร์ → เลือก "ไว้ก่อน" (ยกเลิก auto-reload) แต่ watcher ยังเช็คอยู่
  const dismissUpdate = useCallback(() => {
    dismissedVersionRef.current = latestVersion;
    setLatestVersion('');
    setUpdateSeconds(UPDATE_COUNTDOWN_SEC);
  }, [latestVersion]);

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
          // P1-7: trigger ประกันมือนอกเหนือเปิดหน้า — หลังโหลดรอบเปิดแอปสำเร็จ (ไม่ใช่ quiet
          // realtime reload: effect นี้รันแค่ mount) ensure ให้ bizToday + เมื่อวาน (กันบิลข้าม
          // เที่ยงคืน) ครั้งเดียวต่อรอบโหลด แล้ว saveData เฉพาะเมื่อมีสร้าง/เปลี่ยนจริง
          // (created > 0 + เทียบ guaranteeSigOf ก่อน/หลัง) — ไม่รื้อ logic load เดิม
          let next = cloud;
          const removedIds = [];
          if (!guaranteeBootRef.current) {
            guaranteeBootRef.current = true;
            try {
              const t0 = bizToday();
              for (const day of [prevDayStr(t0), t0]) {
                const before = guaranteeSigOf(next, day);
                const res = ensureGuaranteeEntries(next, day);
                if (res && res.created > 0 && res.data && guaranteeSigOf(res.data, day) !== before) {
                  next = res.data;
                }
                // reconcile ปรับลดยอดที่เกิน (จ่ายบิลทีหลัง/ถอนชื่อ) — มี export นี้อยู่แล้วเรียกตรงได้เลย
                const r = reconcileGuaranteeEntries(next, day);
                if (r && r.data && (r.changed || (r.removedIds && r.removedIds.length > 0))) {
                  next = r.data;
                  if (r.removedIds) removedIds.push(...r.removedIds);
                }
              }
            } catch (e) { console.error('[guarantee] boot ensure failed:', e); }
            // แถวที่ reconcile ตัดออกต้องลบใน cloud ด้วย (upsert ลบให้ไม่ได้) — พลาดรอบนี้รอบหน้าเจอแล้วลบใหม่
            for (const id of removedIds) {
              try { await deleteExpenseFromCloud(id); } catch (e) { console.error('[guarantee] boot delete failed:', e); }
            }
          }
          if (next !== cloud) {
            setCloudMode(cloudStatus.mode);
            setCloudError('');
            saveData(next); // setData + scheduleSync (pending guard เดิมกัน realtime ทับ)
          } else {
            setData(cloud);
            setCloudMode(cloudStatus.mode);
            setCloudError('');
          }
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

  // ยังรับ key เดิม (dashboard/pos/…) — Sidebar และ PagePOS เรียกเหมือนเดิม
  // กัน history ซ้ำ: กดเมนูหน้าเดิมซ้ำไม่ push entry ใหม่
  const navigate = useCallback((key) => {
    if (location.pathname !== `/${key}`) routerNavigate(`/${key}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [routerNavigate, location.pathname]);

  // เลือกบทบาทแล้ว: คง path ที่ขอไว้ (deep link) ถ้าอยู่ในสิทธิ์ ไม่งั้นไปหน้า default
  const selectRole = useCallback((r) => {
    if (!VALID_ROLES.includes(r)) return;
    saveRole(r);
    setRole(r);
    const allowed = NAV_ITEMS.filter((i) => i.roles.includes(r)).map((i) => i.key);
    const requested = location.pathname.replace(/^\/+/, '');
    routerNavigate(allowed.includes(requested) ? `/${requested}` : `/${DEFAULT_PAGE[r]}`, { replace: true });
    window.scrollTo({ top: 0 });
  }, [routerNavigate, location.pathname]);

  const exitRole = useCallback(() => {
    clearRole();
    setRole(null);
  }, []);

  // เปลี่ยน path (รวมกด back) → กลับบนสุด
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  const navItems = useMemo(() => NAV_ITEMS.filter((i) => i.roles.includes(role)), [role]);
  // หน้าปัจจุบันมาจาก URL — path ที่ไม่มีสิทธิ์/ไม่รู้จัก → ใช้หน้าแรกของ role
  const requestedKey = location.pathname.replace(/^\/+/, '');
  const activePage = navItems.some((i) => i.key === requestedKey)
    ? requestedKey
    : (navItems[0]?.key || DEFAULT_PAGE[role]);
  const badges = useMemo(() => {
    const openCount = (data?.bills || []).filter((b) => b.status === 'open').length;
    return openCount > 0 ? { bills: openCount } : null;
  }, [data]);

  // แบนเนอร์แจ้งเวอร์ชันใหม่ (ลอยบนสุดจอ) — ใช้ทั้งหน้าเลือกบทบาท/หน้า error/หน้าหลัก
  const updateBanner = (
    <UpdateBanner
      latest={latestVersion}
      seconds={updateSeconds}
      busy={updateBusy}
      onApply={applyUpdateNow}
      onClose={dismissUpdate}
    />
  );

  if (!role) {
    return (
      <div className="app">
        {updateBanner}
        <RoleGate onSelect={selectRole} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="loading-screen">
        {updateBanner}
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
      {updateBanner}
      <div className="shell">
        <RailDesktop active={activePage} items={navItems} onNavigate={navigate} onExit={exitRole} badges={badges} data={data} saveData={saveData} role={role} />
        <div className="main-col">
          <TopBar active={activePage} items={navItems} role={role} onExit={exitRole} data={data} saveData={saveData} />
          <main className="page">
            <div className="container">
              {/* M2: banner รวมอันเดียว (offline ชนะ) + sticky ไม่ดัน wizard */}
              {(!online || syncErr) && (
                <div className="err-banner net-banner" role="alert">
                  {!online ? (
                    <>
                      <WifiOff size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>ไม่มีเน็ต — ระบบจะ sync ขึ้น cloud ให้เองเมื่อเน็ตกลับ</span>
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
                  <Routes>
                    {/* deep link/refresh เข้า / → เด้งไปหน้า default ของ role */}
                    <Route path="/" element={<Navigate to={`/${DEFAULT_PAGE[role]}`} replace />} />
                    {NAV_ITEMS.map((item) => {
                      const Page = PAGES[item.key];
                      return (
                        <Route
                          key={item.key}
                          path={`/${item.key}`}
                          element={item.roles.includes(role)
                            ? <Page data={data} saveData={saveData} onNavigate={navigate} role={role} />
                            : <Navigate to={`/${DEFAULT_PAGE[role]}`} replace />}
                        />
                      );
                    })}
                    {/* path ที่ไม่รู้จัก → หน้า default ของ role */}
                    <Route path="*" element={<Navigate to={`/${DEFAULT_PAGE[role]}`} replace />} />
                  </Routes>
                </Suspense>
              </div>
            </div>
          </main>
          <footer className="foot">
            <div className="container">
              <span>I'FEEW Thai Massage — POS</span>
              <span title={cloudError || ''}>
                {cloudMode === 'cloud' ? '● Cloud เชื่อมแล้ว' : `○ เกิดข้อผิดพลาด${cloudError ? ` — ${cloudError}` : ''}`}{live ? ' · ● Live' : ''} · {bkkYear()}
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

export default AppShell;
