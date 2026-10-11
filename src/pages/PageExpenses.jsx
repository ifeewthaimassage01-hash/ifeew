import { useState } from 'react';
import { Plus, Upload, CheckCircle2, Receipt } from 'lucide-react';
import { Card, CardHead, EmptyState, alertDialog } from '../components/ui';
import { bkkToday, bkkNow } from '../utils/bkk';

export default function PageExpenses({ data, saveData, role }) {
  const [form, setForm] = useState({ date: bkkToday(), amount: '', method: 'เงินสด', approvedBy: '', receiptUrl: '', notes: '' });
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const expenses = [...(data.expenses || [])].reverse();
  const monthTotal = (data.expenses || []).reduce((s, e) => s + e.amount, 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.amount) { setErr('กรอกจำนวนเงินก่อนบันทึก'); return; }
    if (!form.notes.trim()) { setErr('กรอกหมายเหตุว่าใช้จ่ายอะไร'); return; }
    setErr('');
    const label = form.notes.trim();
    const newExpense = { id: `E${String((data.expenses || []).length + 1).padStart(3, '0')}`, ...form, item: label, category: 'ทั่วไป', amount: Number(form.amount) };
    saveData({
      ...data,
      expenses: [...(data.expenses || []), newExpense],
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: form.approvedBy || (role === 'staff' ? 'พนักงาน' : 'ระบบ'),
        action: 'บันทึกค่าใช้จ่าย', detail: `${newExpense.id} · ${newExpense.item}`, oldValue: '-', newValue: `฿ ${newExpense.amount}`, approvedBy: form.approvedBy || '-',
      }],
    });
    setForm({ ...form, amount: '', notes: '' });
    setSaved(true);
    alertDialog({ title: 'บันทึกค่าใช้จ่ายแล้ว', message: `${label} · ฿ ${newExpense.amount.toLocaleString()}` });
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi dark span2">
          <div className="kpi-label">รายจ่ายสะสมทั้งหมด</div>
          <div className="kpi-value">฿ {monthTotal.toLocaleString()}</div>
          <div className="kpi-sub">{(data.expenses || []).length} รายการ</div>
        </div>
      </div>

      <div className="cols-32">
        <Card>
          <CardHead title="ฟอร์มบันทึกค่าใช้จ่าย" hint="* ช่องจำเป็น" />
          {err && <div className="err-banner">⚠ {err}</div>}
          <form onSubmit={handleSubmit}>
            <div className="f2">
              <div className="field"><label>วันที่ *</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" /></div>
              <div className="field"><label>จำนวนเงิน (฿) *</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" className="input" style={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums' }} /></div>
            </div>
            <div className="field"><label>หมายเหตุ *</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ใช้จ่ายอะไร… เช่น ซื้อน้ำมันนวดร้านสมุนไพร" className="input" rows={2} /></div>
            <div className="f2">
              <div className="field"><label>วิธีจ่าย</label>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="input">
                  <option>เงินสด</option><option>QR Code / โอนเงิน</option>
                </select>
              </div>
              <div className="field"><label>ผู้อนุมัติ</label><input value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} placeholder="ชื่อผู้อนุมัติ" className="input" /></div>
            </div>
            <div className="field"><label>ใบเสร็จ / หลักฐาน</label>
              <label className="filebtn"><Upload size={19} /><span>{form.receiptUrl ? `แนบแล้ว: ${form.receiptUrl}` : 'แตะเพื่อแนบรูปใบเสร็จ (จำลอง)'}</span>
                <input type="file" hidden onChange={(e) => setForm({ ...form, receiptUrl: e.target.files[0]?.name || '' })} />
              </label>
            </div>
            <button type="submit" className="btn btn-primary btn-block"><Plus size={18} /> บันทึกค่าใช้จ่าย {form.amount ? `· ฿ ${Number(form.amount).toLocaleString()}` : ''}</button>
            {saved && <p className="okmsg"><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> บันทึกเรียบร้อย</p>}
          </form>
        </Card>

        <Card>
          <CardHead title="ประวัติล่าสุด" hint={`${expenses.length} รายการ`} />
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {expenses.map((exp) => (
              <div key={exp.id} className="exp-row">
                <span className="exp-ic"><Receipt size={16} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5, fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{exp.item}</b>
                  <span className="muted">{exp.date} · {exp.method}{exp.approvedBy ? ` · ${exp.approvedBy}` : ''}</span>
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}><b>฿ {exp.amount.toLocaleString()}</b><div className="muted">{exp.id}</div></span>
              </div>
            ))}
            {expenses.length === 0 && <EmptyState icon={Receipt} title="ยังไม่มีรายจ่าย" subtitle="บันทึกผ่านฟอร์มด้านข้าง" />}
          </div>
        </Card>
      </div>
    </div>
  );
}
