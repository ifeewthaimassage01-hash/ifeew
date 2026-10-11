import { useState } from 'react';
import { Plus, Upload, CheckCircle2, Receipt, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardHead, EmptyState, alertDialog } from '../components/ui';
import { bkkToday, bkkNow } from '../utils/bkk';
import { uploadReceipt, resolveImageUrl, isCloudinaryConfigured } from '../lib/images';

export default function PageExpenses({ data, saveData, role }) {
  const [form, setForm] = useState({ date: bkkToday(), amount: '', method: 'เงินสด', approvedBy: '', receiptUrl: '', notes: '' });
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const receiptPreview = resolveImageUrl(form.receiptUrl);

  const handleFile = async (file) => {
    if (!file) return;
    setErr('');
    setUploading(true);
    try {
      const url = await uploadReceipt(file);
      setForm((f) => ({ ...f, receiptUrl: url }));
    } catch (e) {
      console.error(e);
      setErr(e.message === 'ยังไม่ได้ตั้งค่า Cloudinary (.env)'
        ? 'ยังไม่ได้ตั้งค่า Cloudinary — ใส่ VITE_CLOUDINARY_* ใน .env แล้ว restart dev server'
        : `อัปโหลดรูปไม่สำเร็จ: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };
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
    setForm({ date: bkkToday(), amount: '', method: 'เงินสด', approvedBy: '', receiptUrl: '', notes: '' });
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
            <div className="field"><label>ใบเสร็จ / หลักฐาน {!isCloudinaryConfigured && <span className="muted">(ยังไม่ตั้งค่า Cloudinary)</span>}</label>
              <label className="filebtn">
                {uploading ? <Loader2 size={19} className="spin" /> : <Upload size={19} />}
                <span>{uploading ? 'กำลังอัปโหลด…' : form.receiptUrl ? (receiptPreview ? 'เปลี่ยนรูปใบเสร็จ' : `แนบแล้ว: ${form.receiptUrl}`) : 'แตะเพื่อถ่ายรูป / แนบใบเสร็จ'}</span>
                <input type="file" accept="image/*,application/pdf" hidden disabled={uploading} key={form.receiptUrl || 'empty'} onChange={(e) => handleFile(e.target.files[0])} />
              </label>
              {receiptPreview && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={receiptPreview} alt="ใบเสร็จ" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  <a href={receiptPreview} target="_blank" rel="noreferrer" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <ExternalLink size={13} /> เปิดดูรูปเต็ม
                  </a>
                </div>
              )}
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={uploading}><Plus size={18} /> บันทึกค่าใช้จ่าย {form.amount ? `· ฿ ${Number(form.amount).toLocaleString()}` : ''}</button>
            {saved && <p className="okmsg"><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> บันทึกเรียบร้อย</p>}
          </form>
        </Card>

        <Card>
          <CardHead title="ประวัติล่าสุด" hint={`${expenses.length} รายการ`} />
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {expenses.map((exp) => {
              const url = resolveImageUrl(exp.receiptUrl);
              return (
              <div key={exp.id} className="exp-row">
                <span className="exp-ic">{url ? <img src={url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 6 }} /> : <Receipt size={16} />}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5, fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{exp.item}</b>
                  <span className="muted">{exp.date} · {exp.method}{exp.approvedBy ? ` · ${exp.approvedBy}` : ''}{url ? <> · <a href={url} target="_blank" rel="noreferrer">ดูใบเสร็จ</a></> : exp.receiptUrl ? ` · มีไฟล์: ${exp.receiptUrl}` : ''}</span>
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}><b>฿ {exp.amount.toLocaleString()}</b><div className="muted">{exp.id}</div></span>
              </div>
              );
            })}
            {expenses.length === 0 && <EmptyState icon={Receipt} title="ยังไม่มีรายจ่าย" subtitle="บันทึกผ่านฟอร์มด้านข้าง" />}
          </div>
        </Card>
      </div>
    </div>
  );
}
