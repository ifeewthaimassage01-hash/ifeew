import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { FileText, Search, ShieldAlert, TriangleAlert, Pencil, Trash2, Calendar, ChevronDown, Check, Filter, Tag, X, ReceiptText, ExternalLink, Maximize2, CalendarCheck, UserRound } from 'lucide-react';
import { Card, CardHead, EmptyState, StatusBadge, Modal, Lightbox, Kpi, alertDialog, confirmDialog, DatePicker, inSingleDay } from '../components/ui';
import { bookingAdminApi } from '../lib/bookingAdminApi';
import { onBookingsChanged } from '../lib/bookingRealtime';
import { bkkNow, fmtBkk, bizToday, bkkToday } from '../utils/bkk';
import { deleteBillFromCloud, syncState } from '../data/cloudSync';
import { freelanceDisplayName, svcLabel, isFreelance, billRows, billTotal, billBizDay } from '../lib/billing';
import { getOwnerPass } from '../lib/auth';
import { resolveImageUrl } from '../lib/images';
import OpenBillsSection from '../components/OpenBills';
import BookingBillsSection from '../booking/BookingBillsSection';

/* Dropdown filter — ใช้ซ้ำได้สำหรับตัวกรองทั้งหมด */
function Dropdown({ icon: Icon, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find((o) => o.v === value);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    // M8-aria: ESC ปิดเมนู
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <div className={`dropdown${open ? ' open' : ''}`} ref={ref}>
      <button className="dropdown-btn" onClick={() => setOpen(!open)} type="button" aria-haspopup="listbox" aria-expanded={open}>
        {Icon && <Icon size={15} className="dd-icon" />}
        <span className="dd-label">{current?.l || label}</span>
        <ChevronDown size={14} className="dd-caret" />
      </button>
      {open && (
        <div className="dropdown-menu" role="listbox">
          {options.map((o) => (
            <button key={o.v} role="option" aria-selected={value === o.v} className={`dropdown-item${value === o.v ? ' on' : ''}`} onClick={() => { onChange(o.v); setOpen(false); }}>
              {o.l}
              {value === o.v && <Check size={14} className="dd-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// (ย้าย helper billRows/rowNet/billTotal ไปใช้ตัวกลางใน billing.js — กันสูตรเพี้ยน)
const payMethods = ['เงินสด', 'QR Code / โอนเงิน'];

// C2: รหัสเจ้าของร้าน — รวมไว้ที่ lib/auth.js ที่เดียว (อ่านจาก env ก่อน + fallback เดิม)
// TODO(security): ย้ายการตรวจรหัส void ไปไว้ฝั่ง server (Supabase Edge Function + RLS)

// ไฟล์แนบอาจเป็น PDF — อย่า render <img> ตรง ๆ ถ้าเป็น PDF
function isPdfUrl(url) {
  const s = String(url || '').split('?')[0].toLowerCase();
  return s.endsWith('.pdf');
}

export default function PageBills({ data, saveData, role }) {
  // ปุ่มยกเลิกโชว์ทุก role — modal ยกเลิกบังคับใส่รหัสเจ้าของร้านอยู่แล้ว
  const canVoid = true;
  const [tab, setTab] = useState('open');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payFilter, setPayFilter] = useState('all');
  const [filterDate, setFilterDate] = useState(bizToday());
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = (filterDate ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (payFilter !== 'all' ? 1 : 0);
  const clearFilters = () => { setFilterDate(''); setStatusFilter('all'); setPayFilter('all'); };
  const [detailBill, setDetailBill] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [authPass, setAuthPass] = useState('');
  const [voidErr, setVoidErr] = useState('');
  // สลิป/รูปที่กำลังเปิดดูแบบเต็มจอ (lightbox) — null = ปิด
  const [viewImg, setViewImg] = useState(null);
  // บิลจอง (ลูกค้าจอง) ก็ "คิดเป็นบิลที่เปิดอยู่" — จำนวนรายงานขึ้นจาก BookingBillsSection
  const [bkOpenCount, setBkOpenCount] = useState(0);
  const [bkDayCounts, setBkDayCounts] = useState({}); // จำนวนจองรายวัน → pill บนชิปเลือกวัน
  // แถบเลือกวันของการ์ด "บิลที่เปิดอยู่" (แบบเว็บจอง) — เริ่มต้นที่วันนี้
  const [openDay, setOpenDay] = useState(bkkToday());

  const bills = useMemo(() => [...(data.bills || [])].reverse(), [data.bills]);
  const openCount = bills.filter((b) => b.status === 'open').length;
  // แท็บประวัติ = เฉพาะบิลที่ปิดแล้ว (ชำระแล้ว / ยกเลิก)
  // รวมบิล: ซ่อนบิลที่ถูกกลืน (status 'merged') ออกจากรายการปกติให้ลื่นตา
  // — ข้อมูลยังเก็บครบ (ไม่ลบไม่แตะ DB) รายงานคิดจาก status 'paid' เท่านั้นจึงไม่กระทบ
  // ดูได้เมื่อเลือกสถานะ "รวมแล้ว" ในตัวกรองด้านล่าง
  const history = bills.filter((b) => {
    if (b.status === 'open') return false;
    if (b.status === 'merged' && statusFilter !== 'merged') return false;
    const q = query.trim().toLowerCase();
    const matchQ = !q || (b.customer || '').toLowerCase().includes(q) || (b.memberNo || '').toLowerCase().includes(q);
    return matchQ && inSingleDay(billBizDay(b), filterDate) && (statusFilter === 'all' || b.status === statusFilter) && (payFilter === 'all' || b.paymentMethod === payFilter);
  });
  const totalSum = history.filter((b) => b.status === 'paid').reduce((s, b) => s + billTotal(b), 0);

  /* ══════════ เดอร์จองที่ "จบบริการ" (completed) — อยู่ในแท็บประวัติบิล ══════════
     คำขอผู้ใช้ (23 ต.ค. 2026): ปุ่ม "รับบริการเสร็จ" บนการ์ดจองในแท็บบิลที่เปิดอยู่
     → เดอร์ย้ายมาแท็บนี้ · ดึงด้วย booking-admin (status=completed) และรีเฟรช
     ตาม realtime ขณะอยู่แท็บนี้ · คงตามตัวกรองวันที่ + คำค้นของประวัติ */
  const ownerKey = getOwnerPass(data?.ownerPass);
  const [bkHistory, setBkHistory] = useState([]);
  const [bkHistLoading, setBkHistLoading] = useState(false);
  const [bkHistErr, setBkHistErr] = useState('');

  const loadBkHistory = useCallback(async (silent = false) => {
    if (!ownerKey) return;
    if (!silent) setBkHistLoading(true);
    try {
      const res = await bookingAdminApi.list(ownerKey, { status: 'completed', limit: 100 });
      setBkHistory(res?.bookings || []);
      setBkHistErr('');
    } catch (e) {
      if (!silent) setBkHistErr(e?.message || 'โหลดเดอร์จองที่จบบริการไม่สำเร็จ');
    } finally {
      setBkHistLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    if (tab !== 'history') return undefined;
    loadBkHistory(false);
    // เดอร์จองเปลี่ยนฝั่ง server (กดรับบริการเสร็จจากแท็บอื่น/เครื่องอื่น) → รีเฟรชเงียบ ๆ
    const bottomOff = onBookingsChanged(() => loadBkHistory(true));
    return () => { bottomOff?.(); };
  }, [tab, loadBkHistory]);

  const bkCompleted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bkHistory
      .filter((b) => {
        const matchQ = !q || (b.customer_name || '').toLowerCase().includes(q) || String(b.customer_phone || '').includes(q.trim());
        return matchQ && inSingleDay(String(b?.slot_date || '').slice(0, 10), filterDate);
      })
      .sort((a, b) => String(b?.slot_start || '').localeCompare(String(a?.slot_start || '')));
  }, [bkHistory, query, filterDate]);

  // ชื่อบริการของแถว: ใช้ชื่อที่เซฟในบิลก่อน ถ้าไม่มีค้นจากรหัสในรายการปัจจุบัน
  // (บิลเก่าบางใบเซฟแค่ serviceId อย่างเดียว) — M5: หาไม่เจอคืน 'บริการที่ลบแล้ว' ไม่โชว์รหัสดิบอย่าง S13
  const serviceDisplay = (it) => {
    if (it.serviceName) return it.serviceName;
    const svc = (data.services || []).find((x) => x.id === it.serviceId);
    return svc ? svcLabel(svc) : 'บริการที่ลบแล้ว';
  };

  // ชื่อหมอของบิล: ใช้ชื่อที่เซฟไว้ก่อน ถ้าไม่มีค่อยค้นจากรหัสในรายชื่อพนักงานปัจจุบัน
  // หมอวิ่งตัด prefix เทคนิค (EXT-VIS-) เหลือแค่ชื่อ — ไม่โชว์รหัสดิบใน UI
  const therapistDisplay = (b) => {
    const rows = billRows(b);
    if (b.therapistName) return freelanceDisplayName(b.therapistName);
    if (rows[0]?.therapistName) return freelanceDisplayName(rows[0].therapistName);
    const tid = b.therapistId || rows[0]?.therapistId;
    const t = (data.therapists || []).find((x) => x.id === tid);
    return t ? t.name : freelanceDisplayName(tid || '—');
  };

  // พนักงานกดยกเลิกได้ แต่จะขึ้นแจ้งว่าต้องให้เจ้าของร้านทำ — เจ้าของร้านกดแล้วเข้า modal รหัสเหมือนเดิม
  const requestVoid = (b) => {    if (role === 'staff') {
      alertDialog({ title: 'จำเป็นต้องให้เจ้าของร้านยกเลิก', message: 'บิลนี้ต้องให้เจ้าของร้านเป็นคนยกเลิก กรุณาเรียกเจ้าของร้านมายืนยัน' });
      return;
    }
    setVoidTarget(b); setAuthPass(''); setVoidErr('');
  };

  const confirmVoid = () => {
    if (authPass !== getOwnerPass(data?.ownerPass)) { setVoidErr('รหัสไม่ถูกต้อง'); return; }
    saveData({
      ...data,
      bills: data.bills.map((b) => (b.id === voidTarget.id ? { ...b, status: 'cancelled' } : b)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: 'เจ้าของร้าน',
        action: 'ยกเลิกบิล', detail: `${voidTarget.customer || 'ลูกค้าหน้าร้าน'}`,
        oldValue: voidTarget.status || 'paid', newValue: 'cancelled', approvedBy: 'เจ้าของร้าน',
      }],
    });
    setVoidTarget(null); setAuthPass(''); setVoidErr('');
    alertDialog({ title: 'ยกเลิกบิลแล้ว', message: 'สถานะเปลี่ยนเป็นยกเลิกแล้ว' });
  };

  // ลบถาวร — เจ้าของร้านเท่านั้น (พนักงานไม่เห็นปุ่ม)
  // C4-delrace: ลบ cloud ก่อน (กัน realtime ทับด้วย syncState.pending) แล้วค่อยลบ local —
  // ถ้าลบ cloud ล้มให้ rollback (ไม่แตะ state เดิม) + คง alert เดิม
  const deleteBill = async (b) => {
    if (role === 'staff') return;
    const ok = await confirmDialog({
      title: `ลบบิล ${b.id} ถาวร?`,
      message: 'บิลและรายการจะหายจากระบบทั้งหมด · ยอดขาย/ค่าแรงจะเปลี่ยน · บิลที่ลบแล้วกู้ไม่ได้',
      confirmLabel: 'ลบถาวร', danger: true,
    });
    if (!ok) return;
    const next = {
      ...data,
      bills: (data.bills || []).filter((x) => x.id !== b.id),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: 'เจ้าของร้าน',
        action: 'ลบบิลถาวร', detail: `${b.id} · ${b.customer || 'ลูกค้าหน้าร้าน'} · ฿ ${billTotal(b).toLocaleString()}`,
        oldValue: b.status || '-', newValue: 'deleted', approvedBy: 'เจ้าของร้าน',
      }],
    };
    syncState.pending += 1;
    try {
      try {
        await deleteBillFromCloud(b.id, [resolveImageUrl(b.slip)]);
      } catch (e) {
        // rollback: ไม่ saveData คง state เดิมไว้ — ยังไม่ได้ลบอะไรเลยทั้งในเครื่องและ cloud
        alertDialog({ title: 'ลบไม่สำเร็จ', message: 'ลบใน cloud ไม่สำเร็จ กรุณาเช็กเน็ตแล้วลองใหม่ (ยังไม่มีอะไรถูกลบ)' });
        return;
      }
      saveData(next);
    } finally {
      syncState.pending -= 1;
      syncState.lastDone = Date.now();
    }
    setDetailBill(null);
    alertDialog({ title: 'ลบบิลแล้ว', message: `ลบ ${b.id} ออกจากระบบแล้ว` });
  };

  return (
    <div>
      <div className="seg">
        <button onClick={() => setTab('open')} className={tab === 'open' ? 'on' : ''}>บิลที่เปิดอยู่{openCount + bkOpenCount > 0 ? ` (${openCount + bkOpenCount})` : ''}</button>
        <button onClick={() => setTab('history')} className={tab === 'history' ? 'on' : ''}>ประวัติบิล</button>
      </div>

      {tab === 'open' && (
        <>
          <OpenBillsSection data={data} saveData={saveData} role={role} bookingsHint={`ลูกค้าจอง ${bkOpenCount}`} dayFilter={openDay} onDayFilter={setOpenDay} dayCounts={bkDayCounts}>
            {/* บิลจอง — ข้อมูลที่จองจากเว็บ แสดงในการ์ดเดียวกับบิลเปิด (แยกป้าย ลูกค้าหน้าร้าน/ลูกค้าจอง)
                · กลุ่มนี้ถูกตัวกรองวันเดียวกัน */}
            <BookingBillsSection data={data} onActiveCount={setBkOpenCount} onDayCounts={setBkDayCounts} dayFilter={openDay} />
          </OpenBillsSection>
        </>
      )}

      {tab === 'history' && (
        <>
          <Card>
            <button className="filter-toggle" onClick={() => setShowFilters(!showFilters)} type="button">
              <Filter size={14} />
              <span>ตัวกรอง{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
              <ChevronDown size={14} className={`filter-caret${showFilters ? ' open' : ''}`} />
            </button>
            {showFilters && (
            <>
            <div className="field" style={{ marginBottom: 10, marginTop: 10 }}>
              <div className="search-wrap">
                <Search size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อลูกค้า / เบอร์สมาชิก…" className="input" />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <DatePicker date={filterDate} onChange={setFilterDate} />
            </div>
            <div className="filter-bar" style={{ marginTop: 10 }}>
              <Dropdown
                icon={Tag}
                label="เลือกสถานะ"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ v: 'all', l: 'ทุกสถานะ' }, { v: 'paid', l: 'ชำระแล้ว' }, { v: 'cancelled', l: 'ยกเลิก' }, { v: 'merged', l: 'รวมแล้ว' }]}
              />
              <Dropdown
                icon={Filter}
                label="ช่องทางชำระ"
                value={payFilter}
                onChange={setPayFilter}
                options={[{ v: 'all', l: 'ทุกช่องทาง' }, ...payMethods.map((m) => ({ v: m, l: m }))]}
              />
            </div>
            {activeFilterCount > 0 && (
              <button className="filter-clear" onClick={clearFilters} type="button">ล้างตัวกรอง</button>
            )}
            </>
            )}
          </Card>

          <div className="kpi-grid">
            <div className="kpi dark span2">
              <div className="kpi-label">ยอดรวม (ชำระแล้ว)</div>
              <div className="kpi-value">฿ {totalSum.toLocaleString()}</div>
              <div className="kpi-sub">{history.filter((b) => b.status === 'paid').length} บิลชำระแล้ว · {history.filter((b) => b.status === 'cancelled').length} ยกเลิก</div>
            </div>
          </div>

          <Card className="table-card show-desktop">
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>วันที่</th><th>หมอนวด</th><th>ช่องทาง</th><th className="r">ยอด</th><th>สถานะ</th><th className="c">จัดการ</th></tr></thead>
                <tbody>
                  {history.map((b) => (
                    <tr key={b.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtBkk(b.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td><b style={{ fontWeight: 600 }}>{therapistDisplay(b)}</b></td>
                      <td className="muted">{b.paymentMethod}</td>
                      <td className="r"><b>฿ {billTotal(b).toLocaleString()}</b></td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className="c">
                        {/* รูปย่อสลิป = ปุ่มเปิด lightbox ทันที (PDF = ไอคอนเปิดแท็บใหม่) — บอกให้เห็นว่าการ์ดนี้มีรูปแนบ */}
                        {(() => {
                          const slipUrl = resolveImageUrl(b.slip);
                          if (!slipUrl) return null;
                          if (isPdfUrl(slipUrl)) {
                            return (
                              <a href={slipUrl} target="_blank" rel="noopener noreferrer" title="เปิดสลิป (PDF)" className="icon-btn" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle' }}>
                                <ExternalLink size={14} />
                              </a>
                            );
                          }
                          return (
                            <button type="button" onClick={() => setViewImg(slipUrl)} title="ดูสลิปใหญ่" aria-label={`ดูสลิปของบิล ${b.id}`} className="icon-btn" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', position: 'relative' }}>
                              <img src={slipUrl} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--line)', display: 'block' }} />
                              <span className="exp-zoom" aria-hidden="true" style={{ width: 13, height: 13 }}><Maximize2 size={8} /></span>
                            </button>
                          );
                        })()}
                        {' '}
                        <button onClick={() => setDetailBill(b)} className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }}>ดู</button>
                        {canVoid && b.status === 'paid' && <> <button onClick={() => requestVoid(b)} className="btn-soft-danger">ยกเลิก</button></>}
                        {role !== 'staff' && <> <button onClick={() => deleteBill(b)} className="btn-soft-danger" title="ลบบิลถาวร (เจ้าของร้าน)">ลบ</button></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.length === 0 && <EmptyState icon={FileText} title="ไม่พบบิล" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" />}
          </Card>

          <div className="mlist show-mobile">
            {history.map((b) => {
              const rows = billRows(b);
              const paid = b.status === 'paid';
              const docName = therapistDisplay(b);
              const docExtra = isFreelance(b.therapistId || rows[0]?.therapistId, data.therapists) ? ' (หมอวิ่ง)' : '';
              return (
                <div key={b.id} className="hcard" onClick={() => setDetailBill(b)} style={{ cursor: 'pointer' }}>
                  <div className="hcard-head">
                    {(() => {
                      // รูปย่อสลิปแทนไอคอนใบเสร็จ — แตะเปิด lightbox ทันที (PDF = ไอคอนเปิดแท็บใหม่)
                      const slipUrl = resolveImageUrl(b.slip);
                      if (slipUrl && !isPdfUrl(slipUrl)) {
                        return (
                          <button
                            type="button"
                            className="hcard-ava exp-ic-btn"
                            style={{ width: 40, height: 40, padding: 0, position: 'relative' }}
                            onClick={(e) => { e.stopPropagation(); setViewImg(slipUrl); }}
                            title="ดูสลิปใหญ่"
                            aria-label={`ดูสลิปของบิล ${b.id}`}
                          >
                            <img src={slipUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                            <span className="exp-zoom" aria-hidden="true"><Maximize2 size={9} /></span>
                          </button>
                        );
                      }
                      if (slipUrl) {
                        return (
                          <a
                            href={slipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hcard-ava"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={(e) => e.stopPropagation()}
                            title="เปิดสลิป (PDF)"
                            aria-label={`เปิดสลิป (PDF) ของบิล ${b.id}`}
                          ><ExternalLink size={16} strokeWidth={1.8} /></a>
                        );
                      }
                      return <div className="hcard-ava"><ReceiptText size={18} strokeWidth={1.8} /></div>;
                    })()}
                    <div className="hcard-title">
                      <b>{docName}{docExtra}</b>
                      <span className="muted"><Calendar size={11} /> {fmtBkk(b.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{b.startTime ? ` · เริ่ม ${b.startTime}` : ''} · {b.paymentMethod}</span>
                    </div>
                    <div className={`hcard-amt${paid ? '' : ' cancelled'}`}>{paid ? '+' : ''} ฿ {billTotal(b).toLocaleString()}</div>
                  </div>
                  <div className="hcard-doc">ลูกค้า: <b>{b.customer || 'ลูกค้าหน้าร้าน'}</b></div>
                  <div className="hcard-svcs">
                    {rows.map((it, i) => (
                      <div key={i} className="hcard-svc"><span>{serviceDisplay(it)}{it.qty > 1 ? ` ×${it.qty}` : ''}</span><b>฿ {(it.net ?? it.price ?? 0).toLocaleString()}</b></div>
                    ))}
                    {b.promotion ? <div className="hcard-svc promo"><span>โปร: {b.promotion}</span><b>−฿ {(b.discount || 0).toLocaleString()}</b></div> : null}
                  </div>
                  <div className="hcard-foot">
                    <StatusBadge status={b.status} />
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button className="bill-action-btn edit" onClick={(e) => { e.stopPropagation(); setDetailBill(b); }} title="ดูรายละเอียด"><Pencil size={14} /></button>
                      {canVoid && paid && (
                        <button className="bill-action-btn delete" onClick={(e) => { e.stopPropagation(); requestVoid(b); }} title="ยกเลิกบิล"><Trash2 size={14} /></button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
            {history.length === 0 && <Card><EmptyState icon={FileText} title="ไม่พบบิล" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" /></Card>}
          </div>

          {/* ══════ ลูกค้าจอง — รับบริการเสร็จ (ย้ายมาจากแท็บ "บิลที่เปิดอยู่") ══════ */}
          {statusFilter === 'all' && ownerKey && (bkHistLoading || bkHistErr || bkHistory.length > 0) && (
            <Card>
              <CardHead
                title="ลูกค้าจอง — รับบริการเสร็จ"
                hint={bkHistErr ? '' : (bkHistLoading && bkHistory.length === 0) ? 'กำลังโหลด…' : `${bkCompleted.length} รายการ`}
              />
              {bkHistErr ? (
                <p className="muted" style={{ fontSize: 13, margin: '0 0 2px' }}><TriangleAlert size={13} /> {bkHistErr}</p>
              ) : bkCompleted.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, margin: '0 0 2px' }}>
                  {bkHistLoading ? 'กำลังโหลด…' : 'ยังไม่มีเดอร์จองที่จบบริการในช่วงนี้'}
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {bkCompleted.map((b) => {
                    const start = String(b?.slot_start || '');
                    const end = String(b?.slot_end || '');
                    // เวลา = แปลงเป็นเวลาไทย (timestamptz เก็บ UTC — slice ตรง ๆ ผิดเวลา)
                    const when = start
                      ? `${fmtBkk(start, { hour: '2-digit', minute: '2-digit' })}${end ? `–${fmtBkk(end, { hour: '2-digit', minute: '2-digit' })}` : ''}`
                      : '';
                    const amt = Number(b?.amount || 0) || 0;
                    return (
                      <div key={b.code || b.id} className="ob-card bkc" style={{ marginBottom: 0 }}>
                        <div className="ob-head">
                          <span className="ob-ava" aria-hidden="true"><CalendarCheck size={19} strokeWidth={2} /></span>
                          <span className="ob-who">
                            <b>{b?.customer_name || 'ไม่ระบุชื่อ'}<span className="bkc-pill">บิลจอง</span></b>
                            <span className="muted num">
                              {b?.customer_phone && <> <span className="num">{b.customer_phone}</span> ·</>}
                              {' '}{b?.code || ''}
                            </span>
                          </span>
                          <span className="bk-adm-badge is-completed">จบบริการ</span>
                        </div>
          <div className="ob-rows">
                          <div className="ob-row">
                            <span className="ob-time muted">{when}</span>
                            <span className="ob-name">
                              {b?.service_name || '—'}
                              {/* หมอผู้บริการ = pill แยกตา (คำขอผู้ใช้) */}
                              {b?.therapist_name && (
                                <>
                                  {' '}
                                  <span className="bkc-doc-pill" title="หมอผู้ให้บริการ">
                                    <UserRound size={10} strokeWidth={2.4} />
                                    {String(b.therapist_name).startsWith('หมอ') ? b.therapist_name : `หมอ ${b.therapist_name}`}
                                  </span>
                                </>
                              )}
                            </span>
                            <b className="ob-price">฿ {amt.toLocaleString()}</b>
                          </div>
                        </div>
                        <div className="ob-total">
                          <span className="ob-sum muted num" style={{ fontSize: 12.5 }}>
                            <Calendar size={12} /> {fmtBkk(start, { day: 'numeric', month: 'short' })}
                          </span>
                          <span className={`bk-adm-badge ${b?.payment_status === 'paid' ? 'is-confirmed' : 'is-pending'}`}>
                            {b?.payment_status === 'paid' ? 'ชำระแล้ว' : 'ไม่ได้ชำระ'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {detailBill && (
        <Modal onClose={() => setDetailBill(null)}>
          <button className="modal-x" onClick={() => setDetailBill(null)} aria-label="ปิด"><X size={16} /></button>
          <div className="mcard-top" style={{ paddingRight: 34 }}>
            <div><div className="modal-eyebrow">BILL DETAIL</div><div style={{ fontSize: 15, fontWeight: 700 }}>{detailBill.customer || 'ลูกค้าหน้าร้าน'}{detailBill.memberNo ? ` · ${detailBill.memberNo}` : ''}</div><div className="muted">{fmtBkk(detailBill.date)}</div></div>
            <StatusBadge status={detailBill.status} />
          </div>
          <div className="summary-box" style={{ marginTop: 12 }}>
            <div className="r"><span>หมอ</span><b>{therapistDisplay(detailBill)}</b></div>
            <div className="r"><span>ชำระโดย</span><b>{detailBill.paymentMethod}</b></div>
            {(detailBill.fuel || 0) > 0 && <div className="r"><span>ค่าน้ำมันหมอวิ่ง</span><b>+฿ {(detailBill.fuel || 0).toLocaleString()}</b></div>}
            {detailBill.promotion && <div className="r"><span>โปรโมชัน</span><b>{detailBill.promotion}</b></div>}
            {detailBill.slip && (
              <div className="r"><span>สลิป</span>
                {resolveImageUrl(detailBill.slip) && !isPdfUrl(resolveImageUrl(detailBill.slip)) ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => setViewImg(resolveImageUrl(detailBill.slip))} title="ดูสลิปใหญ่" aria-label="ดูสลิปใหญ่" style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                      <img src={resolveImageUrl(detailBill.slip)} alt="สลิป" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', display: 'block' }} />
                    </button>
                    <button type="button" className="mini-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }} onClick={() => setViewImg(resolveImageUrl(detailBill.slip))}><ExternalLink size={13} /> เปิดดู</button>
                  </span>
                ) : resolveImageUrl(detailBill.slip) ? (
                  <a href={resolveImageUrl(detailBill.slip)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><ExternalLink size={13} /> เปิดดู (PDF)</a>
                ) : <b>{detailBill.slip}</b>}
              </div>
            )}
          </div>
          <CardHead title="รายการบริการ" hint={`${billRows(detailBill).length} รายการ`} />
          {billRows(detailBill).map((it, i) => (
            <div key={i} className="tline">
              <span className="q">{i + 1}</span>
              <span className="tt"><b>{serviceDisplay(it)}{it.qty > 1 ? ` ×${it.qty}` : ''}</b><small>พนักงาน: {freelanceDisplayName(it.therapistName || it.therapistId || detailBill.therapistName || detailBill.therapistId || '—')}{isFreelance(it.therapistId || detailBill.therapistId, data.therapists) ? ' (หมอวิ่ง)' : ''}</small></span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>฿ {(it.net || 0).toLocaleString()}</b>
            </div>
          ))}
          <div className="perf" />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <span className="muted">ยอดรวม</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 34 }}>฿ {billTotal(detailBill).toLocaleString()}</span>
          </div>
          {canVoid && detailBill.status === 'paid' && (
            <div className="modal-row">
              <button onClick={() => { requestVoid(detailBill); if (role !== 'staff') setDetailBill(null); }} className="btn-soft-danger" style={{ padding: 12, fontSize: 14, flex: 1 }}>ยกเลิกบิลนี้</button>
            </div>
          )}
          {role !== 'staff' && (
            <div className="modal-row">
              <button onClick={() => deleteBill(detailBill)} className="btn-soft-danger" style={{ padding: 12, fontSize: 14, flex: 1 }}>ลบบิลนี้ถาวร</button>
            </div>
          )}
        </Modal>
      )}

      {voidTarget && (
        <Modal onClose={() => { setVoidTarget(null); setAuthPass(''); setVoidErr(''); }}>
          <button className="modal-x" onClick={() => { setVoidTarget(null); setAuthPass(''); setVoidErr(''); }} aria-label="ปิด"><X size={16} /></button>
          <div className="pagehead-main" style={{ marginBottom: 6 }}>
            <div className="pagehead-icon" style={{ background: 'var(--red)' }}><ShieldAlert size={22} /></div>
            <div><h3>ยกเลิกบิล</h3><p className="muted">{voidTarget.customer || 'ลูกค้าหน้าร้าน'} · ยอด ฿ {billTotal(voidTarget).toLocaleString()} · ต้องอนุมัติโดยเจ้าของร้าน</p></div>
          </div>
          {voidErr && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {voidErr}</div>}
          <div className="field"><label>รหัสเจ้าของร้าน</label><input type="password" value={authPass} onChange={(e) => { setAuthPass(e.target.value); setVoidErr(''); }} placeholder="รหัสเจ้าของร้าน" className="input" /></div>
          <div className="modal-row">
            <button onClick={confirmVoid} disabled={!authPass} className="btn btn-danger" style={{ width: '100%' }}>อนุมัติยกเลิก</button>
          </div>
        </Modal>
      )}

      {/* lightbox สลิปเต็มจอ — มาตรฐานเดียวกันทั้งแอป */}
      <Lightbox url={viewImg} title="สลิป" onClose={() => setViewImg(null)} />
    </div>
  );
}
