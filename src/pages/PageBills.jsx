import { useState, useMemo } from 'react';
import { FileText, Search, ShieldAlert, ReceiptText, TriangleAlert } from 'lucide-react';
import { PageHeader, Card, CardHead, EmptyState, StatusBadge, Modal, Kpi, toast } from '../components/ui';

function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageBills({ data, saveData, onNavigate }) {
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
  const filtered = bills.filter((b) => {
    const q = query.trim().toLowerCase();
    const matchQ = !q || b.id.toLowerCase().includes(q) || (b.customer || '').toLowerCase().includes(q) || (b.memberNo || '').toLowerCase().includes(q);
    const day = (b.date || '').slice(0, 10);
    const matchD = dateFilter === 'all' || (dateFilter === 'today' && day === localDay(0)) || (dateFilter === 'yesterday' && day === localDay(-1));
    return matchQ && matchD && (statusFilter === 'all' || b.status === statusFilter) && (payFilter === 'all' || b.paymentMethod === payFilter);
  });
  const billTotal = (b) => Math.max(0, (b.items || []).reduce((s, i) => s + (i.net || 0), 0) - (b.discount || 0));
  const totalSum = filtered.filter((b) => b.status === 'paid').reduce((s, b) => s + billTotal(b), 0);
  const payMethods = ['เงินสด', 'QR Code / โอนเงิน', 'บัตรเครดิต', 'E-Wallet'];

  const confirmVoid = () => {
    if (authPass !== 'manager123') { setVoidErr('รหัสไม่ถูกต้อง (ตัวอย่าง: manager123)'); return; }
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
    setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr('');
    toast(`Void บิล ${voidTarget.id} แล้ว`);
  };

  return (
    <div>
      <PageHeader
        icon={FileText} eyebrow="Bill History" title="ประวัติบิล"
        subtitle="ค้นหา ตรวจรายละเอียด และ Void บิลที่ต้องอนุมัติผู้จัดการ"
        actions={<button onClick={() => onNavigate && onNavigate('pos')} className="btn btn-primary auto"><ReceiptText size={17} /> เปิดบิลใหม่</button>}
      />

      <div className="kpi-grid">
        <div className="kpi dark span2">
          <div className="kpi-label">ยอดรวมที่กรอง (ชำระแล้ว)</div>
          <div className="kpi-value">฿{totalSum.toLocaleString()}</div>
          <div className="kpi-sub">{filtered.length} บิล · ชำระแล้ว {filtered.filter((b) => b.status === 'paid').length} · ยกเลิก {filtered.filter((b) => b.status === 'cancelled').length}</div>
        </div>
        <Kpi label="บิลทั้งหมด" value={bills.length} />
        <Kpi label="บิลวันนี้" value={bills.filter((b) => b.date && b.date.slice(0, 10) === localDay(0)).length} />
      </div>

      <Card>
        <div className="field" style={{ marginBottom: 10 }}>
          <div className="search-wrap">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเลขบิล / ชื่อลูกค้า / เบอร์สมาชิก…" className="input" />
          </div>
        </div>
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {[{ v: 'all', l: 'ทุกวัน' }, { v: 'today', l: 'วันนี้' }, { v: 'yesterday', l: 'เมื่อวาน' }].map((o) => (
            <button key={o.v} onClick={() => setDateFilter(o.v)} className={`chip sage${dateFilter === o.v ? ' on' : ''}`}>{o.l}</button>
          ))}
        </div>
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {[{ v: 'all', l: 'ทุกสถานะ' }, { v: 'paid', l: 'ชำระแล้ว' }, { v: 'cancelled', l: 'ยกเลิก' }].map((o) => (
            <button key={o.v} onClick={() => setStatusFilter(o.v)} className={`chip${statusFilter === o.v ? ' on' : ''}`}>{o.l}</button>
          ))}
        </div>
        <div className="chip-row">
          {['all', ...payMethods].map((m) => (
            <button key={m} onClick={() => setPayFilter(m)} className={`chip sage${payFilter === m ? ' on' : ''}`}>{m === 'all' ? 'ทุกช่องทาง' : m}</button>
          ))}
        </div>
      </Card>

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
                    {b.status === 'paid' && <> <button onClick={() => setVoidTarget(b)} className="btn-soft-danger">Void</button></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <EmptyState icon={FileText} title="ไม่พบบิล" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" />}
      </Card>

      <div className="mlist show-mobile">
        {filtered.map((b) => (
          <button key={b.id} onClick={() => setDetailBill(b)} className="mcard">
            <div className="mcard-top">
              <div><div className="mono">{b.id}</div><div className="muted">{new Date(b.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {b.paymentMethod}</div></div>
              <StatusBadge status={b.status} />
            </div>
            <div className="mcard-bot">
              <b style={{ fontWeight: 600, fontSize: 14 }}>{b.customer || 'ลูกค้าทั่วไป'}</b>
              <span className="big-price">฿{billTotal(b).toLocaleString()}</span>
            </div>
            <div className="muted" style={{ marginTop: 4 }}>{(b.items || []).length} รายการ</div>
          </button>
        ))}
        {filtered.length === 0 && <Card><EmptyState icon={FileText} title="ไม่พบบิล" subtitle="ลองเปลี่ยนคำค้นหรือตัวกรอง" /></Card>}
      </div>

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
              <span className="tt"><b>{it.serviceName || it.serviceId}{it.qty > 1 ? ` ×${it.qty}` : ''}</b><small>พนักงาน: {it.therapistName || it.therapistId}</small></span>
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
            {detailBill.status === 'paid' && <button onClick={() => { setVoidTarget(detailBill); setDetailBill(null); }} className="btn-soft-danger" style={{ padding: 12, fontSize: 14, flex: 1 }}>Void บิลนี้</button>}
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
          <div className="field"><label>รหัสผ่านผู้จัดการ</label><input type="password" value={authPass} onChange={(e) => { setAuthPass(e.target.value); setVoidErr(''); }} placeholder="manager123" className="input" /></div>
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
