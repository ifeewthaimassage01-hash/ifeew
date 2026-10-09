import { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, Search, ShieldAlert, ReceiptText, TriangleAlert, ClipboardList, Plus, Minus, Pencil, Trash2, Calendar, ChevronDown, Check, Banknote, Smartphone, Filter, Tag } from 'lucide-react';
import { PageHeader, Card, CardHead, EmptyState, StatusBadge, Modal, Kpi, alertDialog } from '../components/ui';

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

export default function PageBills({ data, saveData, onNavigate, role }) {
  const canVoid = role !== 'staff';
  const [view, setView] = useState('bills');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payFilter, setPayFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [detailBill, setDetailBill] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [authPass, setAuthPass] = useState('');
  const [authReason, setAuthReason] = useState('');
  const [voidErr, setVoidErr] = useState('');

  const bills = useMemo(() => [...(data.bills || [])].reverse(), [data.bills]);
  const matchDay = (date) => {
    const day = (date || '').slice(0, 10);
    return dateFilter === 'all' || (dateFilter === 'today' && day === localDay(0)) || (dateFilter === 'yesterday' && day === localDay(-1));
  };
  const filtered = bills.filter((b) => {
    const q = query.trim().toLowerCase();
    const matchQ = !q || b.id.toLowerCase().includes(q) || (b.customer || '').toLowerCase().includes(q) || (b.memberNo || '').toLowerCase().includes(q);
    return matchQ && matchDay(b.date) && (statusFilter === 'all' || b.status === statusFilter) && (payFilter === 'all' || b.paymentMethod === payFilter);
  });
  const billTotal = (b) => Math.max(0, (b.items || []).reduce((s, i) => s + (i.net || 0), 0) - (b.discount || 0));
  const totalSum = filtered.filter((b) => b.status === 'paid').reduce((s, b) => s + billTotal(b), 0);
  const payMethods = ['เงินสด', 'QR Code / โอนเงิน'];

  const serviceRows = [];
  filtered.forEach((b) => {
    (b.items || []).forEach((it) => {
      const q = query.trim().toLowerCase();
      if (q && !((it.serviceName || '').toLowerCase().includes(q) || (it.therapistName || '').toLowerCase().includes(q) || (b.customer || '').toLowerCase().includes(q) || b.id.toLowerCase().includes(q))) return;
      serviceRows.push({ bill: b, item: it });
    });
  });
  const svcRevenue = serviceRows.filter((r) => r.bill.status === 'paid').reduce((s, r) => s + (r.item.net || 0), 0);
  const svcQty = serviceRows.reduce((s, r) => s + (r.item.qty || 1), 0);

  const confirmVoid = () => {
    if (authPass !== '123123') { setVoidErr('รหัสไม่ถูกต้อง (ตัวอย่าง: 123123)'); return; }
    if (!authReason.trim()) { setVoidErr('กรุณาระบุเหตุผลการยกเลิกสั้น ๆ'); return; }
    saveData({
      ...data,
      bills: data.bills.map((b) => (b.id === voidTarget.id ? { ...b, status: 'cancelled' } : b)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: new Date().toISOString(), user: 'ผู้จัดการ',
        action: 'ยกเลิกบิล (Void)', detail: `${voidTarget.id} — ${authReason}`,
        oldValue: 'paid', newValue: 'cancelled', approvedBy: 'ผู้จัดการ',
      }],
    });
    const voidId = voidTarget.id;
    setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr('');
    alertDialog({ title: `Void บิล ${voidId} แล้ว`, message: 'สถานะเปลี่ยนเป็นยกเลิกแล้ว' });
  };

  return (
    <div>
      <PageHeader
        icon={FileText} eyebrow="Bill History" title="ประวัติบิล"
        actions={<button onClick={() => onNavigate && onNavigate('pos')} className="btn btn-primary auto"><ReceiptText size={17} /> เปิดบิลใหม่</button>}
      />

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <Dropdown
          icon={FileText}
          label="ประเภทประวัติ"
          value={view}
          onChange={setView}
          options={[{ v: 'bills', l: 'ประวัติบิล' }, { v: 'services', l: 'ประวัติการบริการ' }]}
        />
      </div>

      <Card>
        <div className="field" style={{ marginBottom: 10 }}>
          <div className="search-wrap">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={view === 'services' ? 'ค้นหาบริการ / หมอ / ลูกค้า / เลขบิล…' : 'ค้นหาเลขบิล / ชื่อลูกค้า / เบอร์สมาชิก…'} className="input" />
          </div>
        </div>
        <div className="filter-bar">
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
          {view === 'bills' && (
            <Dropdown
              icon={Filter}
              label="ช่องทางชำระ"
              value={payFilter}
              onChange={setPayFilter}
              options={[{ v: 'all', l: 'ทุกช่องทาง' }, ...payMethods.map((m) => ({ v: m, l: m }))]}
            />
          )}
        </div>
      </Card>

      {view === 'bills' && (
        <>
          <div className="kpi-grid">
            <div className="kpi dark span2">
              <div className="kpi-label">ยอดรวมที่กรอง (ชำระแล้ว)</div>
              <div className="kpi-value">฿{totalSum.toLocaleString()}</div>
              <div className="kpi-sub">{filtered.length} บิล · ชำระแล้ว {filtered.filter((b) => b.status === 'paid').length} · ยกเลิก {filtered.filter((b) => b.status === 'cancelled').length}</div>
            </div>
            <Kpi label="บิลทั้งหมด" value={bills.length} />
            <Kpi label="บิลวันนี้" value={bills.filter((b) => b.date && b.date.slice(0, 10) === localDay(0)).length} />
          </div>

          <Card className="table-card show-desktop">
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>เลขบิล</th><th>วันที่</th><th>ลูกค้า</th><th>ช่องทาง</th><th className="r">ยอด</th><th>สถานะ</th><th className="c">จัดการ</th></tr></thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.id}>
                      <td className="mono">{b.id}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(b.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td><b style={{ fontWeight: 600 }}>{b.customer || '—'}</b>{b.memberNo && <div className="muted">{b.memberNo}</div>}</td>
                      <td className="muted">{b.paymentMethod}</td>
                      <td className="r"><b>฿{billTotal(b).toLocaleString()}</b></td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className="c">
                        <button onClick={() => setDetailBill(b)} className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }}>ดู</button>
                        {canVoid && b.status === 'paid' && <> <button onClick={() => setVoidTarget(b)} className="btn-soft-danger">Void</button></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && <EmptyState icon={FileText} title="ไม่พบบิล" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" />}
          </Card>

          <div className="mlist show-mobile">
            {filtered.map((b) => {
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
                      <div className="bill-customer">{b.customer || 'ลูกค้าทั่วไป'}</div>
                      <div className="bill-meta">
                        <Calendar size={11} style={{ verticalAlign: -1 }} />
                        {new Date(b.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        <span className="bill-dot">·</span>
                        {b.paymentMethod}
                      </div>
                    </div>
                    <div className={`bill-amount ${isCancelled ? 'cancelled' : 'income'}`}>
                      {isCancelled ? <Minus size={14} /> : <Plus size={14} />}
                      ฿{billTotal(b).toLocaleString()}
                    </div>
                  </div>
                  <div className="bill-actions">
                    <button className="bill-action-btn edit" onClick={() => setDetailBill(b)} title="ดูรายละเอียด">
                      <Pencil size={14} />
                    </button>
                    {canVoid && b.status === 'paid' && (
                      <button className="bill-action-btn delete" onClick={() => setVoidTarget(b)} title="Void บิล">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <Card><EmptyState icon={FileText} title="ไม่พบบิล" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" /></Card>}
          </div>
        </>
      )}

      {view === 'services' && (
        <>
          <div className="kpi-grid">
            <div className="kpi dark span2">
              <div className="kpi-label">ยอดบริการที่กรอง (ชำระแล้ว)</div>
              <div className="kpi-value">฿{svcRevenue.toLocaleString()}</div>
              <div className="kpi-sub">{serviceRows.length} ครั้งบริการ · รวม {svcQty} หน่วย</div>
            </div>
          </div>

          <Card className="table-card show-desktop">
            <div className="table-scroll">
              <table className="tbl">
                <thead><tr><th>วันที่</th><th>บิล</th><th>ลูกค้า</th><th>บริการ</th><th>พนักงาน</th><th className="r">จำนวน</th><th className="r">ยอด</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {serviceRows.map((r, i) => (
                    <tr key={`${r.bill.id}-${i}`}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.bill.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="mono">{r.bill.id}</td>
                      <td><b style={{ fontWeight: 600 }}>{r.bill.customer || '—'}</b></td>
                      <td>{r.item.serviceName || r.item.serviceId}</td>
                      <td className="muted">{r.item.therapistName || r.item.therapistId}{String(r.item.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : ''}</td>
                      <td className="r">×{r.item.qty || 1}</td>
                      <td className="r"><b>฿{(r.item.net || 0).toLocaleString()}</b></td>
                      <td><StatusBadge status={r.bill.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {serviceRows.length === 0 && <EmptyState icon={ClipboardList} title="ไม่พบประวัติบริการ" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" />}
          </Card>

          <div className="mlist show-mobile">
            {serviceRows.map((r, i) => (
              <div key={`${r.bill.id}-${i}`} className="mcard">
                <div className="mcard-top">
                  <div><b style={{ fontSize: 14 }}>{r.item.serviceName || r.item.serviceId}</b><div className="muted">{new Date(r.bill.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {r.bill.id}</div></div>
                  <StatusBadge status={r.bill.status} />
                </div>
                <div className="mcard-bot">
                  <span className="muted">{r.item.therapistName}{String(r.item.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : ''} · {r.bill.customer || 'ลูกค้าทั่วไป'} · ×{r.item.qty || 1}</span>
                  <span className="big-price">฿{(r.item.net || 0).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {serviceRows.length === 0 && <Card><EmptyState icon={ClipboardList} title="ไม่พบประวัติบริการ" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" /></Card>}
          </div>
        </>
      )}

      {detailBill && (
        <Modal onClose={() => setDetailBill(null)}>
          <div className="mcard-top">
            <div><div className="muted" style={{ letterSpacing: 2, fontSize: 10 }}>BILL DETAIL</div><div className="mono" style={{ fontSize: 15 }}>{detailBill.id}</div><div className="muted">{new Date(detailBill.date).toLocaleString('th-TH')}</div></div>
            <StatusBadge status={detailBill.status} />
          </div>
          <div className="summary-box" style={{ marginTop: 12 }}>
            <div className="r"><span>ลูกค้า</span><b>{detailBill.customer || '—'}</b></div>
            <div className="r"><span>สมาชิก</span><b>{detailBill.memberNo || '—'}</b></div>
            <div className="r"><span>ชำระโดย</span><b>{detailBill.paymentMethod}</b></div>
          </div>
          <CardHead title="รายการบริการ" hint={`${(detailBill.items || []).length} รายการ`} />
          {(detailBill.items || []).map((it, i) => (
            <div key={i} className="tline">
              <span className="q">{i + 1}</span>
              <span className="tt"><b>{it.serviceName || it.serviceId}{it.qty > 1 ? ` ×${it.qty}` : ''}</b><small>พนักงาน: {it.therapistName || it.therapistId}{String(it.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : ''}</small></span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>฿{(it.net || 0).toLocaleString()}</b>
            </div>
          ))}
          <div className="perf" />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <span className="muted">ยอดรวม</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 34 }}>฿{billTotal(detailBill).toLocaleString()}</span>
          </div>
          <div className="modal-row">
            <button onClick={() => setDetailBill(null)} className="btn btn-ghost" style={{ width: '100%' }}>ปิด</button>
            {canVoid && detailBill.status === 'paid' && <button onClick={() => { setVoidTarget(detailBill); setDetailBill(null); }} className="btn-soft-danger" style={{ padding: 12, fontSize: 14, flex: 1 }}>Void บิลนี้</button>}
          </div>
        </Modal>
      )}

      {voidTarget && (
        <Modal onClose={() => { setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr(''); }}>
          <div className="pagehead-main" style={{ marginBottom: 6 }}>
            <div className="pagehead-icon" style={{ background: 'var(--red)' }}><ShieldAlert size={22} /></div>
            <div><h3>Void บิล {voidTarget.id}</h3><p className="muted">ยอด ฿{billTotal(voidTarget).toLocaleString()} · ต้องอนุมัติโดยผู้จัดการ</p></div>
          </div>
          {voidErr && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {voidErr}</div>}
          <div className="field"><label>รหัสผ่านผู้จัดการ</label><input type="password" value={authPass} onChange={(e) => { setAuthPass(e.target.value); setVoidErr(''); }} placeholder="123123" className="input" /></div>
          <div className="field"><label>เหตุผลการยกเลิก (บังคับ)</label><textarea value={authReason} onChange={(e) => { setAuthReason(e.target.value); setVoidErr(''); }} placeholder="เช่น ลูกค้าขอเปลี่ยนบริการ…" className="input" rows={3} /></div>
          <div className="modal-row">
            <button onClick={() => { setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr(''); }} className="btn btn-ghost" style={{ width: '100%' }}>ยกเลิก</button>
            <button onClick={confirmVoid} disabled={!authReason.trim() || !authPass} className="btn btn-danger" style={{ width: '100%' }}>อนุมัติ Void</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
