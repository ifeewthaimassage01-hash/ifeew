import { useState } from 'react';
import { ShieldCheck, Lock, FileSearch, ScrollText, Check, Circle, TriangleAlert } from 'lucide-react';
import { PageHeader, Card, CardHead, EmptyState, Kpi, toast } from '../components/ui';

function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageEOD({ data, saveData }) {
  const [managerPass, setManagerPass] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [auditQuery, setAuditQuery] = useState('');
  const [passErr, setPassErr] = useState('');

  const bills = data.bills || [];
  const eodStatus = data.eodStatus || { lastClosed: '', locked: false, approvedBy: '' };
  const auditLog = [...(data.auditLog || [])].reverse();

  const today = localDay(0);
  const todayBills = bills.filter((b) => b.date && b.date.startsWith(today) && b.status !== 'cancelled');
  const sum = (pred) => todayBills.filter(pred).reduce((s, b) => s + Math.max(0, b.items.reduce((t, i) => t + (i.net || 0), 0) - (b.discount || 0)), 0);
  const summary = {
    cash: sum((b) => b.paymentMethod === 'เงินสด'),
    qr: sum((b) => b.paymentMethod === 'QR Code / โอนเงิน'),
    card: sum((b) => b.paymentMethod === 'บัตรเครดิต'),
    ewallet: sum((b) => b.paymentMethod === 'E-Wallet'),
  };
  const dayTotal = summary.cash + summary.qr + summary.card + summary.ewallet;
  const expenseToday = (data.expenses || []).filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);

  const filteredAudit = auditLog.filter((l) => {
    const q = auditQuery.toLowerCase();
    return !q || l.action.toLowerCase().includes(q) || l.user.toLowerCase().includes(q) || l.detail.toLowerCase().includes(q);
  });

  const pushAudit = (action, detail, oldV, newV) => ({
    id: `A-${Date.now()}`, timestamp: new Date().toISOString(), user: 'ผู้จัดการ',
    action, detail, oldValue: oldV, newValue: newV, approvedBy: 'ผู้จัดการ',
  });

  const needPass = () => {
    if (managerPass !== 'manager123') { setPassErr('รหัสผู้จัดการไม่ถูกต้อง (ตัวอย่าง: manager123)'); return false; }
    setPassErr('');
    return true;
  };
  const handleClose = () => {
    if (!needPass()) return;
    saveData({ ...data, eodStatus: { lastClosed: today, locked: true, approvedBy: 'ผู้จัดการ' }, auditLog: [...(data.auditLog || []), pushAudit('ปิดวัน (EOD)', `${today} · ยอด ฿${dayTotal.toLocaleString()} · ${todayBills.length} บิล`, 'open', 'locked')] });
    toast('ปิดวันสำเร็จ — ข้อมูลถูกล็อกแล้ว');
    setManagerPass('');
  };
  const handleUnlock = () => {
    if (!needPass()) return;
    saveData({ ...data, eodStatus: { ...eodStatus, locked: false }, auditLog: [...(data.auditLog || []), pushAudit('ปลดล็อกข้อมูล', 'ปรับปรุงย้อนหลัง', 'locked', 'unlocked')] });
    toast('ปลดล็อกแล้ว — การแก้ไขจะถูกบันทึกใน Audit');
    setManagerPass('');
  };

  return (
    <div>
      <PageHeader icon={ShieldCheck} eyebrow="End of Day" title="สรุปปิดวัน & Audit" subtitle="กระทบยอดรายวัน ล็อกข้อมูล และตรวจสอบทุกการเปลี่ยนแปลง" />

      <div className="hero-dark">
        <div className="mcard-top">
          <h2><Lock size={18} style={{ verticalAlign: -3 }} /> ปิดวัน — {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
          <span className="badge" style={{ background: eodStatus.locked ? '#fde68a' : 'rgba(255,255,255,0.15)', color: eodStatus.locked ? '#713f12' : '#fff', border: '1px solid rgba(255,255,255,0.25)' }}>{eodStatus.locked ? '🔒 ล็อกแล้ว' : '● ยังเปิดอยู่'}</span>
        </div>
        <div className="hero-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {[{ l: 'เงินสด', v: summary.cash }, { l: 'QR / โอน', v: summary.qr }, { l: 'บัตรเครดิต', v: summary.card }, { l: 'E-Wallet', v: summary.ewallet }].map((r) => (
            <div key={r.l} className="hero-box"><div className="hl">{r.l}</div><div className="hv">฿{r.v.toLocaleString()}</div></div>
          ))}
        </div>
        <div className="hero-box solid" style={{ marginBottom: 12 }}>
          <div className="hl" style={{ color: 'var(--brass)', fontWeight: 700 }}>รวมวันนี้ · {todayBills.length} บิล</div>
          <div className="hv" style={{ fontSize: 34 }}>฿{dayTotal.toLocaleString()}</div>
        </div>
        <div className="hero-grid" style={{ marginBottom: 12 }}>
          <div className="hero-box"><div className="hl">บิลวันนี้</div><div className="hv">{todayBills.length} บิล</div></div>
          <div className="hero-box"><div className="hl">จ่ายวันนี้</div><div className="hv">฿{expenseToday.toLocaleString()}</div></div>
        </div>
        <Card style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 4 }}>เช็กลิสต์ก่อนปิดวัน</div>
          {[
            { done: todayBills.length > 0, t: 'มีบิลวันนี้', s: todayBills.length > 0 ? `${todayBills.length} บิล · ฿${dayTotal.toLocaleString()}` : 'ยังไม่มีบิล' },
            { done: data.cashDrawer?.lastCountDate === today, t: 'นับเงินสดแล้ว', s: data.cashDrawer?.lastCountDate === today ? `นับจริง ฿${(data.cashDrawer?.lastCountReal || 0).toLocaleString()}` : 'ยังไม่ได้นับวันนี้' },
            { done: true, t: 'Audit พร้อม', s: `${auditLog.length} รายการในระบบ` },
          ].map((c, i) => (
            <div key={i} className={`check-row${c.done ? ' done' : ''}`} style={{ color: '#fff' }}>
              <span className="check-ic">{c.done ? <Check size={16} /> : <Circle size={15} />}</span>
              <span><b>{c.t}</b><small style={{ color: 'rgba(255,255,255,0.6)' }}>{c.s}</small></span>
            </div>
          ))}
        </Card>
        {passErr && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {passErr}</div>}
        <div className="field" style={{ marginBottom: 8 }}><label style={{ color: 'rgba(255,255,255,0.65)' }}>รหัสผ่านผู้จัดการ</label>
          <input type="password" value={managerPass} onChange={(e) => { setManagerPass(e.target.value); setPassErr(''); }} placeholder="manager123" className="input" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }} />
        </div>
        {eodStatus.locked
          ? <button onClick={handleUnlock} className="btn btn-brass btn-block">ปลดล็อกเพื่อปรับปรุง</button>
          : <button onClick={handleClose} className="btn-white">อนุมัติปิดวัน (Lock)</button>}
        {eodStatus.lastClosed && <p style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>ปิดล่าสุด: {eodStatus.lastClosed} · โดย {eodStatus.approvedBy || '—'}</p>}
      </div>

      <div className="kpi-grid">
        <Kpi label="บิลวันนี้" value={todayBills.length} sub="ไม่รวมบิลยกเลิก" />
        <Kpi label="ยอดขายวันนี้" value={`฿${dayTotal.toLocaleString()}`} small sub="ทุกช่องทาง" />
        <Kpi label="เงินสดนับจริง" value={`฿${(data.cashDrawer?.lastCountReal || 0).toLocaleString()}`} small sub={data.cashDrawer?.lastCountDate || 'ยังไม่นับ'} />
        <Kpi label="กำไรเบื้องต้น" value={`฿${(dayTotal - expenseToday).toLocaleString()}`} small sub="ขาย − จ่ายวันนี้" />
      </div>

      <Card>
        <CardHead title="Audit Trail" hint={`${filteredAudit.length} รายการ`} right={<FileSearch size={18} color="var(--muted)" />} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 12 }}>
          <input value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} placeholder="ค้นหา action / ผู้ใช้ / รายละเอียด…" className="input" />
          <button onClick={() => setShowAll(!showAll)} className="btn btn-ghost">{showAll ? 'ย่อ' : 'ทั้งหมด'}</button>
        </div>
        <div className="show-desktop">
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>วันเวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>รายละเอียด</th><th>ค่าเดิม → ใหม่</th><th>อนุมัติโดย</th></tr></thead>
              <tbody>
                {(showAll ? filteredAudit : filteredAudit.slice(0, 5)).map((l) => (
                  <tr key={l.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(l.timestamp).toLocaleString('th-TH')}</td>
                    <td><b style={{ fontWeight: 600 }}>{l.user}</b></td>
                    <td><span className="badge paid">{l.action}</span></td>
                    <td className="muted">{l.detail}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}><span style={{ color: 'var(--red)' }}>{l.oldValue}</span> → <span style={{ color: 'var(--pine-700)', fontWeight: 700 }}>{l.newValue}</span></td>
                    <td className="muted">{l.approvedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="show-mobile">
          {(showAll ? filteredAudit : filteredAudit.slice(0, 5)).map((l) => (
            <div key={l.id} className="audit-row">
              <div className="a1"><span className="badge paid" style={{ fontSize: 10 }}>{l.action}</span><time>{new Date(l.timestamp).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div>
              <b style={{ fontSize: 13 }}>{l.detail}</b>
              <div className="muted"><ScrollText size={11} style={{ verticalAlign: -1 }} /> {l.user} · อนุมัติ: {l.approvedBy} · <span style={{ color: 'var(--red)' }}>{l.oldValue}</span> → <span style={{ color: 'var(--pine-700)', fontWeight: 700 }}>{l.newValue}</span></div>
            </div>
          ))}
        </div>
        {filteredAudit.length === 0 && <EmptyState icon={ScrollText} title="ไม่มีประวัติ" subtitle="ลองเปลี่ยนคำค้น" />}
      </Card>
    </div>
  );
}
