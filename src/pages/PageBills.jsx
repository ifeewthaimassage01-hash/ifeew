import { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, Search, ShieldAlert, TriangleAlert, Pencil, Trash2, Calendar, ChevronDown, Check, Filter, Tag, X, ReceiptText, ExternalLink } from 'lucide-react';
import { Card, CardHead, EmptyState, StatusBadge, Modal, Kpi, alertDialog, confirmDialog, DateRange, inDateRange } from '../components/ui';
import { bkkToday, bkkNow, fmtBkk } from '../utils/bkk';
import { deleteBillFromCloud } from '../data/cloudSync';
import { commBaht } from '../data/demoData';
import { resolveImageUrl } from '../lib/images';
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
  return bkkToday(offset);
}

const billRows = (b) => b.items || b.customers || [];
const rowNet = (i) => i.net ?? i.price ?? 0;
const billTotal = (b) => Math.max(0, billRows(b).reduce((s, i) => s + rowNet(i), 0) - (b.discount || 0));
const payMethods = ['เงินสด', 'QR Code / โอนเงิน'];

export default function PageBills({ data, saveData, role }) {
  // ปุ่มยกเลิกโชว์ทุก role — modal ยกเลิกบังคับใส่รหัสผู้จัดการอยู่แล้ว
  const canVoid = true;
  const [tab, setTab] = useState('open');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payFilter, setPayFilter] = useState('all');
  const [dr, setDr] = useState({ from: localDay(0), to: localDay(0) });
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = ((dr.from || dr.to) ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (payFilter !== 'all' ? 1 : 0);
  const clearFilters = () => { setDr({ from: '', to: '' }); setStatusFilter('all'); setPayFilter('all'); };
  const [detailBill, setDetailBill] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [authPass, setAuthPass] = useState('');
  const [authReason, setAuthReason] = useState('');
  const [voidErr, setVoidErr] = useState('');

  const bills = useMemo(() => [...(data.bills || [])].reverse(), [data.bills]);
  const openCount = bills.filter((b) => b.status === 'open').length;
  // แท็บประวัติ = เฉพาะบิลที่ปิดแล้ว (ชำระแล้ว / ยกเลิก)
  const history = bills.filter((b) => {
    if (b.status === 'open') return false;
    const q = query.trim().toLowerCase();
    const matchQ = !q || (b.customer || '').toLowerCase().includes(q) || (b.memberNo || '').toLowerCase().includes(q);
    return matchQ && inDateRange(b.date, dr.from, dr.to) && (statusFilter === 'all' || b.status === statusFilter) && (payFilter === 'all' || b.paymentMethod === payFilter);
  });
  const totalSum = history.filter((b) => b.status === 'paid').reduce((s, b) => s + billTotal(b), 0);

  // ชื่อหมอของบิล: ใช้ชื่อที่เซฟไว้ก่อน ถ้าไม่มีค่อยค้นจากรหัสในรายชื่อพนักงานปัจจุบัน
  const therapistDisplay = (b) => {
    const rows = billRows(b);
    if (b.therapistName) return b.therapistName;
    if (rows[0]?.therapistName) return rows[0].therapistName;
    const tid = b.therapistId || rows[0]?.therapistId;
    const t = (data.therapists || []).find((x) => x.id === tid);
    return t ? t.name : (tid || '—');
  };

  // พนักงานกดยกเลิกได้ แต่จะขึ้นแจ้งว่าต้องให้เจ้าของร้านทำ — เจ้าของร้านกดแล้วเข้า modal รหัสเหมือนเดิม
  const requestVoid = (b) => {    if (role === 'staff') {
      alertDialog({ title: 'จำเป็นต้องให้เจ้าของร้านยกเลิก', message: 'บิลนี้ต้องให้เจ้าของร้านเป็นคนยกเลิก กรุณาเรียกเจ้าของร้านมายืนยัน' });
      return;
    }
    setVoidTarget(b); setAuthPass(''); setAuthReason(''); setVoidErr('');
  };

  const confirmVoid = () => {
    if (authPass !== '123123') { setVoidErr('รหัสไม่ถูกต้อง (ตัวอย่าง: 123123)'); return; }
    if (!authReason.trim()) { setVoidErr('กรุณาระบุเหตุผลการยกเลิกสั้น ๆ'); return; }
    saveData({
      ...data,
      bills: data.bills.map((b) => (b.id === voidTarget.id ? { ...b, status: 'cancelled' } : b)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: 'ผู้จัดการ',
        action: 'ยกเลิกบิล', detail: `${voidTarget.customer || 'ลูกค้าหน้าร้าน'} — ${authReason}`,
        oldValue: voidTarget.status || 'paid', newValue: 'cancelled', approvedBy: 'ผู้จัดการ',
      }],
    });
    setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr('');
    alertDialog({ title: 'ยกเลิกบิลแล้ว', message: 'สถานะเปลี่ยนเป็นยกเลิกแล้ว' });
  };

  // ลบถาวร — เจ้าของร้านเท่านั้น (พนักงานไม่เห็นปุ่ม)
  const deleteBill = async (b) => {
    if (role === 'staff') return;
    const ok = await confirmDialog({
      title: `ลบบิล ${b.id} ถาวร?`,
      message: 'บิลและรายการจะหายจากระบบทั้งหมด · ยอดขาย/ค่าแรงจะเปลี่ยน · บิลที่ลบแล้วกู้ไม่ได้',
      confirmLabel: 'ลบถาวร', danger: true,
    });
    if (!ok) return;
    saveData({
      ...data,
      bills: (data.bills || []).filter((x) => x.id !== b.id),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: 'เจ้าของร้าน',
        action: 'ลบบิลถาวร', detail: `${b.id} · ${b.customer || 'ลูกค้าหน้าร้าน'} · ฿ ${billTotal(b).toLocaleString()}`,
        oldValue: b.status || '-', newValue: 'deleted', approvedBy: 'เจ้าของร้าน',
      }],
    });
    try {
      await deleteBillFromCloud(b.id);
    } catch (e) {
      console.error(e);
      alertDialog({ title: 'ลบในเครื่องแล้ว', message: 'แต่ลบใน cloud ไม่สำเร็จ กรุณาเช็กเน็ตแล้วลองใหม่' });
      return;
    }
    setDetailBill(null);
    alertDialog({ title: 'ลบบิลแล้ว', message: `ลบ ${b.id} ออกจากระบบแล้ว` });
  };

  return (
    <div>
      <div className="seg">
        <button onClick={() => setTab('open')} className={tab === 'open' ? 'on' : ''}>บิลที่เปิดอยู่{openCount > 0 ? ` (${openCount})` : ''}</button>
        <button onClick={() => setTab('history')} className={tab === 'history' ? 'on' : ''}>ประวัติบิล</button>
      </div>

      {tab === 'open' && (
        <OpenBillsSection data={data} saveData={saveData} role={role} />
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
              <DateRange from={dr.from} to={dr.to} onChange={setDr} />
            </div>
            <div className="filter-bar" style={{ marginTop: 10 }}>
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
            {activeFilterCount > 0 && (
              <button className="filter-clear" onClick={clearFilters} type="button">ล้างตัวกรอง</button>
            )}
            </>
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
                <thead><tr><th>วันที่</th><th>หมอนวด</th><th>ช่องทาง</th><th className="r">ยอด</th><th className="r">ค่าแรงหมอ</th><th>สถานะ</th><th className="c">จัดการ</th></tr></thead>
                <tbody>
                  {history.map((b) => (
                    <tr key={b.id}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtBkk(b.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td><b style={{ fontWeight: 600 }}>{therapistDisplay(b)}</b></td>
                      <td className="muted">{b.paymentMethod}</td>
                      <td className="r"><b>฿ {billTotal(b).toLocaleString()}</b></td>
                      <td className="r muted">฿ {billRows(b).reduce((s, it) => {
                        const svc = (data.services || []).find((x) => x.id === it.serviceId);
                        return s + (svc ? commBaht(svc) * (it.qty || 1) : 0);
                      }, 0).toLocaleString()}</td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className="c">
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
              const docExtra = String(b.therapistId || rows[0]?.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : '';
              const commTotal = rows.reduce((s, it) => {
                const svc = (data.services || []).find((x) => x.id === it.serviceId);
                return s + (svc ? commBaht(svc) * (it.qty || 1) : 0);
              }, 0);
              return (
                <div key={b.id} className="hcard" onClick={() => setDetailBill(b)} style={{ cursor: 'pointer' }}>
                  <div className="hcard-head">
                    <div className="hcard-ava"><ReceiptText size={18} strokeWidth={1.8} /></div>
                    <div className="hcard-title">
                      <b>{docName}{docExtra}</b>
                      <span className="muted"><Calendar size={11} /> {fmtBkk(b.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{b.startTime ? ` · เริ่ม ${b.startTime}` : ''} · {b.paymentMethod}</span>
                    </div>
                    <div className={`hcard-amt${paid ? '' : ' cancelled'}`}>{paid ? '+' : ''} ฿ {billTotal(b).toLocaleString()}</div>
                  </div>
                  <div className="hcard-doc">ลูกค้า: <b>{b.customer || 'ลูกค้าหน้าร้าน'}</b></div>
                  <div className="hcard-svcs">
                    {rows.map((it, i) => (
                      <div key={i} className="hcard-svc"><span>{it.serviceName || it.serviceId}{it.qty > 1 ? ` ×${it.qty}` : ''}</span><b>฿ {(it.net ?? it.price ?? 0).toLocaleString()}</b></div>
                    ))}
                    {b.promotion ? <div className="hcard-svc promo"><span>โปร: {b.promotion}</span><b>−฿ {(b.discount || 0).toLocaleString()}</b></div> : null}
                    <div className="hcard-svc"><span className="muted">ค่าแรงหมอ{docExtra ? 'วิ่ง' : ''}</span><b>฿ {commTotal.toLocaleString()}</b></div>
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
            <div className="r"><span>ลูกค้า</span><b>{detailBill.customer || '—'}</b></div>
            <div className="r"><span>สมาชิก</span><b>{detailBill.memberNo || '—'}</b></div>
            <div className="r"><span>ชำระโดย</span><b>{detailBill.paymentMethod}</b></div>
            {detailBill.promotion && <div className="r"><span>โปรโมชัน</span><b>{detailBill.promotion}</b></div>}
            {detailBill.slip && (
              <div className="r"><span>สลิป</span>
                {resolveImageUrl(detailBill.slip) ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <img src={resolveImageUrl(detailBill.slip)} alt="สลิป" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                    <a href={resolveImageUrl(detailBill.slip)} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><ExternalLink size={13} /> เปิดดู</a>
                  </span>
                ) : <b>{detailBill.slip}</b>}
              </div>
            )}
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
