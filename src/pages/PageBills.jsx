import { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, Search, ShieldAlert, TriangleAlert, Plus, Minus, Pencil, Trash2, Calendar, ChevronDown, Check, Banknote, Smartphone, Filter, Tag, X } from 'lucide-react';
import { Card, CardHead, EmptyState, StatusBadge, Modal, Kpi, alertDialog } from '../components/ui';
import OpenBillsSection from '../components/OpenBills';

/* Dropdown filter — ใช้ซ้ำได้สำหรับตัวกรองทั้งหมด */
function Dropdown({ icon: Icon, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find((o) => o.v === value);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`dropdown${open ? ' open' : ''}`} ref={ref}>
      <button className="dropdown-btn" onClick={() => setOpen(!open)} type="button">
        {Icon && <Icon size={15} className="dd-icon" />}
        <span className="dd-label">{current?.l || label}</span>
        <ChevronDown size={14} className="dd-caret" />
      </button>
      {open && (
        <div className="dropdown-menu">
          {options.map((o) => (
            <button key={o.v} className={`dropdown-item${value === o.v ? ' on' : ''}`} onClick={() => { onChange(o.v); setOpen(false); }}>
              {o.l}
              {value === o.v && <Check size={14} className="dd-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const billRows = (b) => b.items || b.customers || [];
const rowNet = (i) => i.net ?? i.price ?? 0;
const billTotal = (b) => Math.max(0, billRows(b).reduce((s, i) => s + rowNet(i), 0) - (b.discount || 0));
const payMethods = ['เงินสด', 'QR Code / โอนเงิน'];

export default function PageBills({ data, saveData, role }) {
  const canVoid = role !== 'staff';
  const [tab, setTab] = useState('open');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payFilter, setPayFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = (dateFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (payFilter !== 'all' ? 1 : 0);
  const clearFilters = () => { setDateFilter('all'); setStatusFilter('all'); setPayFilter('all'); };
  const [detailBill, setDetailBill] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [authPass, setAuthPass] = useState('');
  const [authReason, setAuthReason] = useState('');
  const [voidErr, setVoidErr] = useState('');

  const bills = useMemo(() => [...(data.bills || [])].reverse(), [data.bills]);
  const openCount = bills.filter((b) => b.status === 'open').length;
  const matchDay = (date) => {
    const day = (date || '').slice(0, 10);
    return dateFilter === 'all' || (dateFilter === 'today' && day === localDay(0)) || (dateFilter === 'yesterday' && day === localDay(-1));
  };
  // แท็บประวัติ = เฉพาะบิลที่ปิดแล้ว (ชำระแล้ว / ยกเลิก)
  const history = bills.filter((b) => {
    if (b.status === 'open') return false;
    const q = query.trim().toLowerCase();
    const matchQ = !q || (b.customer || '').toLowerCase().includes(q) || (b.memberNo || '').toLowerCase().includes(q);
    return matchQ && matchDay(b.date) && (statusFilter === 'all' || b.status === statusFilter) && (payFilter === 'all' || b.paymentMethod === payFilter);
  });
  const totalSum = history.filter((b) => b.status === 'paid').reduce((s, b) => s + billTotal(b), 0);

  const confirmVoid = () => {
    if (authPass !== '123123') { setVoidErr('รหัสไม่ถูกต้อง (ตัวอย่าง: 123123)'); return; }
    if (!authReason.trim()) { setVoidErr('กรุณาระบุเหตุผลการยกเลิกสั้น ๆ'); return; }
    saveData({
      ...data,
      bills: data.bills.map((b) => (b.id === voidTarget.id ? { ...b, status: 'cancelled' } : b)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: new Date().toISOString(), user: 'ผู้จัดการ',
        action: 'ยกเลิกบิล', detail: `${voidTarget.customer || 'ลูกค้าหน้าร้าน'} — ${authReason}`,
        oldValue: voidTarget.status || 'paid', newValue: 'cancelled', approvedBy: 'ผู้จัดการ',
      }],
    });
    setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr('');
    alertDialog({ title: 'ยกเลิกบิลแล้ว', message: 'สถานะเปลี่ยนเป็นยกเลิกแล้ว' });
  };

  return (
    <div>
      <div className="seg">
        <button onClick={() => setTab('open')} className={tab === 'open' ? 'on' : ''}>บิลที่เปิดอยู่{openCount > 0 ? ` (${openCount})` : ''}</button>
        <button onClick={() => setTab('history')} className={tab === 'history' ? 'on' : ''}>ประวัติบิล</button>
      </div>

      {tab === 'open' && (
        openCount > 0
          ? <OpenBillsSection data={data} saveData={saveData} role={role} />
          : <Card><EmptyState icon={FileText} title="ไม่มีบิลที่เปิดอยู่" subtitle="เปิดบิลใหม่จากหน้า POS" /></Card>
      )}

      {tab === 'history' && (
        <>
          <Card>
            <div className="field" style={{ marginBottom: 10 }}>
              <div className="search-wrap">
                <Search size={16} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อลูกค้า / เบอร์สมาชิก…" className="input" />
              </div>
            </div>
            <button className="filter-toggle" onClick={() => setShowFilters(!showFilters)} type="button">
              <Filter size={14} />
              <span>ตัวกรอง{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
              <ChevronDown size={14} className={`filter-caret${showFilters ? ' open' : ''}`} />
            </button>
            {showFilters && (
            <div className="filter-bar" style={{ marginTop: 10 }}>
              <Dropdown
                icon={Calendar}
                label="เลือกวันที่"
                value={dateFilter}
                onChange={setDateFilter}
                options={[{ v: 'all', l: 'ทุกวัน' }, { v: 'today', l: 'วันนี้' }, { v: 'yesterday', l: 'เมื่อวาน' }]}
              />
              <Dropdown
                icon={Tag}
                label="เลือกสถานะ"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ v: 'all', l: 'ทุกสถานะ' }, { v: 'paid', l: 'ชำระแล้ว' }, { v: 'cancelled', l: 'ยกเลิก' }]}
              />
              <Dropdown
                icon={Filter}
                label="ช่องทางชำระ"
                value={payFilter}
                onChange={setPayFilter}
                options={[{ v: 'all', l: 'ทุกช่องทาง' }, ...payMethods.map((m) => ({ v: m, l: m }))]}
              />
            </div>
            )}
            {showFilters && activeFilterCount > 0 && (
              <button className="filter-clear" onClick={clearFilters} type="button">ล้างตัวกรอง</button>
            )}
          </Card>

          <div className="kpi-grid">
            <div className="kpi dark span2">
              <div className="kpi-label">ยอดรวมที่กรอง (ชำระแล้ว)</div>
              <div className="kpi-value">฿ {totalSum.toLocaleString()}</div>
              <div className="kpi-sub">{history.length} บิล · ชำระแล้ว {history.filter((b) => b.status === 'paid').length} · ยกเลิก {history.filter((b) => b.status === 'cancelled').length}</div>
            </div>
            <Kpi label="บิลทั้งหมด" value={bills.filter((b) => b.status !== 'open').length} />
            <Kpi label="บิลวันนี้" value={bills.filter((b) => b.status !== 'open' && b.date && b.date.slice(0, 10) === localDay(0)).length} />
          </div>

          <Card className="table-card show-desktop">
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>วันที่</th><th>ลูกค้า</th><th>ช่องทาง</th><th className="r">ยอด</th><th>สถานะ</th><th className="c">จัดการ</th></tr></thead>
                <tbody>
                  {history.map((b) => (
                    <tr key={b.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(b.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td><b style={{ fontWeight: 600 }}>{b.customer || '—'}</b>{b.memberNo && <div className="muted">{b.memberNo}</div>}</td>
                      <td className="muted">{b.paymentMethod}</td>
                      <td className="r"><b>฿ {billTotal(b).toLocaleString()}</b></td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className="c">
                        <button onClick={() => setDetailBill(b)} className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }}>ดู</button>
                        {canVoid && b.status === 'paid' && <> <button onClick={() => setVoidTarget(b)} className="btn-soft-danger">ยกเลิก</button></>}
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
              const isCancelled = b.status === 'cancelled';
              const payIcon = b.paymentMethod === 'เงินสด' ? Banknote : Smartphone;
              const PayIcon = payIcon;
              return (
                <div key={b.id} className="mcard bill-card">
                  <div className="bill-card-main" onClick={() => setDetailBill(b)}>
                    <div className="bill-icon-wrap">
                      <PayIcon size={18} strokeWidth={1.8} />
                    </div>
                    <div className="bill-info">
                      <div className="bill-customer">{b.customer || 'ลูกค้าหน้าร้าน'}</div>
                      <div className="bill-meta">
                        <Calendar size={11} style={{ verticalAlign: -1 }} />
                        {new Date(b.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        <span className="bill-dot">·</span>
                        {b.paymentMethod}
                      </div>
                    </div>
                    <div className={`bill-amount ${isCancelled ? 'cancelled' : 'income'}`}>
                      {isCancelled ? <Minus size={14} /> : <Plus size={14} />}
                      ฿ {billTotal(b).toLocaleString()}
                    </div>
                  </div>
                  <div className="bill-actions">
                    <button className="bill-action-btn edit" onClick={() => setDetailBill(b)} title="ดูรายละเอียด">
                      <Pencil size={14} />
                    </button>
                    {canVoid && b.status === 'paid' && (
                      <button className="bill-action-btn delete" onClick={() => setVoidTarget(b)} title="ยกเลิกบิล">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {history.length === 0 && <Card><EmptyState icon={FileText} title="ไม่พบบิล" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" /></Card>}
          </div>
        </>
      )}

      {detailBill && (
        <Modal onClose={() => setDetailBill(null)}>
          <button className="modal-x" onClick={() => setDetailBill(null)} aria-label="ปิด"><X size={16} /></button>
          <div className="mcard-top" style={{ paddingRight: 34 }}>
            <div><div className="modal-eyebrow">BILL DETAIL</div><div style={{ fontSize: 15, fontWeight: 700 }}>{detailBill.customer || 'ลูกค้าหน้าร้าน'}{detailBill.memberNo ? ` · ${detailBill.memberNo}` : ''}</div><div className="muted">{new Date(detailBill.date).toLocaleString('th-TH')}</div></div>
            <StatusBadge status={detailBill.status} />
          </div>
          <div className="summary-box" style={{ marginTop: 12 }}>
            <div className="r"><span>หมอ</span><b>{detailBill.therapistName || billRows(detailBill)[0]?.therapistName || '—'}</b></div>
            <div className="r"><span>ลูกค้า</span><b>{detailBill.customer || '—'}</b></div>
            <div className="r"><span>สมาชิก</span><b>{detailBill.memberNo || '—'}</b></div>
            <div className="r"><span>ชำระโดย</span><b>{detailBill.paymentMethod}</b></div>
            {detailBill.promotion && <div className="r"><span>โปรโมชัน</span><b>{detailBill.promotion}</b></div>}
            {detailBill.slip && <div className="r"><span>สลิป</span><b>{detailBill.slip}</b></div>}
          </div>
          <CardHead title="รายการบริการ" hint={`${billRows(detailBill).length} รายการ`} />
          {billRows(detailBill).map((it, i) => (
            <div key={i} className="tline">
              <span className="q">{i + 1}</span>
              <span className="tt"><b>{it.serviceName || it.serviceId}{it.qty > 1 ? ` ×${it.qty}` : ''}</b><small>พนักงาน: {it.therapistName || it.therapistId || detailBill.therapistName || detailBill.therapistId}{String(it.therapistId || detailBill.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : ''}</small></span>
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
              <button onClick={() => { setVoidTarget(detailBill); setDetailBill(null); }} className="btn-soft-danger" style={{ padding: 12, fontSize: 14, flex: 1 }}>ยกเลิกบิลนี้</button>
            </div>
          )}
        </Modal>
      )}

      {voidTarget && (
        <Modal onClose={() => { setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr(''); }}>
          <button className="modal-x" onClick={() => { setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr(''); }} aria-label="ปิด"><X size={16} /></button>
          <div className="pagehead-main" style={{ marginBottom: 6 }}>
            <div className="pagehead-icon" style={{ background: 'var(--red)' }}><ShieldAlert size={22} /></div>
            <div><h3>ยกเลิกบิล</h3><p className="muted">{voidTarget.customer || 'ลูกค้าหน้าร้าน'} · ยอด ฿ {billTotal(voidTarget).toLocaleString()} · ต้องอนุมัติโดยผู้จัดการ</p></div>
          </div>
          {voidErr && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {voidErr}</div>}
          <div className="field"><label>รหัสผ่านผู้จัดการ</label><input type="password" value={authPass} onChange={(e) => { setAuthPass(e.target.value); setVoidErr(''); }} placeholder="123123" className="input" /></div>
          <div className="field"><label>เหตุผลการยกเลิก (บังคับ)</label><textarea value={authReason} onChange={(e) => { setAuthReason(e.target.value); setVoidErr(''); }} placeholder="เช่น ลูกค้าขอเปลี่ยนบริการ…" className="input" rows={3} /></div>
          <div className="modal-row">
            <button onClick={confirmVoid} disabled={!authReason.trim() || !authPass} className="btn btn-danger" style={{ width: '100%' }}>อนุมัติยกเลิก</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
