import { useState } from 'react';
import { Plus, Upload, CheckCircle2, Receipt, ExternalLink, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { Card, CardHead, EmptyState, Modal, alertDialog, confirmDialog } from '../components/ui';
import { bkkToday, bkkNow } from '../utils/bkk';
import { uploadReceipt, resolveImageUrl, isCloudinaryConfigured } from '../lib/images';
import { nextExpenseId } from '../lib/ids';
import { deleteExpenseFromCloud, syncState } from '../data/cloudSync';

// M8-ids: รหัสค่าใช้จ่ายมาตรฐานที่เดียว (lib/ids.js) — ลบตัว local ทิ้ง

// ไฟล์แนบอาจเป็น PDF — อย่า render <img> ตรง ๆ ถ้าเป็น PDF
function isPdfUrl(url) {
  const s = String(url || '').split('?')[0].toLowerCase();
  return s.endsWith('.pdf');
}

export default function PageExpenses({ data, saveData, role }) {
  const [form, setForm] = useState({ date: bkkToday(), amount: '', method: 'เงินสด', approvedBy: '', receiptUrl: '', notes: '' });
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localPreview, setLocalPreview] = useState(null); // blob URL โชว์ทันที ไม่รอ cloud
  const [localIsPdf, setLocalIsPdf] = useState(false);
  const [err, setErr] = useState('');
  const receiptPreview = resolveImageUrl(form.receiptUrl) || localPreview;
  const receiptIsPdf = form.receiptUrl ? isPdfUrl(receiptPreview) : localIsPdf;

  // state แก้ไข / ลบ
  const [editing, setEditing] = useState(null); // expense object ที่กำลังแก้ หรือ null
  const [editForm, setEditForm] = useState({ date: '', amount: '', method: 'เงินสด', approvedBy: '', receiptUrl: '', notes: '' });
  const [editUploading, setEditUploading] = useState(false);
  const [editProgress, setEditProgress] = useState(0);
  const [editLocalPreview, setEditLocalPreview] = useState(null);
  const [editLocalIsPdf, setEditLocalIsPdf] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [busyId, setBusyId] = useState(''); // กันกดซ้ำตอนลบ/เซฟ
  const editPreview = resolveImageUrl(editForm.receiptUrl) || editLocalPreview;
  const editIsPdf = editForm.receiptUrl ? isPdfUrl(editPreview) : editLocalIsPdf;

  const handleFile = async (file) => {
    if (!file) return;
    setErr('');
    // โชว์รูปทันที + เริ่ม % (ไม่รอ compress/upload)
    setLocalIsPdf(file.type === 'application/pdf');
    try {
      const blobUrl = URL.createObjectURL(file);
      setLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return blobUrl; });
    } catch { /* preview ไม่ได้ก็ข้าม — อัปโหลดต่อ */ }
    setProgress(0);
    setUploading(true);
    try {
      const url = await uploadReceipt(file, (p) => setProgress(p));
      setForm((f) => ({ ...f, receiptUrl: url }));
      setLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; });
      setProgress(100);
    } catch (e) {
      setErr(e.message === 'ยังไม่ได้ตั้งค่า Cloudinary (.env)'
        ? 'ยังไม่ได้ตั้งค่า Cloudinary — ใส่ VITE_CLOUDINARY_* ใน .env แล้ว restart dev server'
        : `อัปโหลดรูปไม่สำเร็จ: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleEditFile = async (file) => {
    if (!file) return;
    setEditErr('');
    setEditLocalIsPdf(file.type === 'application/pdf');
    try {
      const blobUrl = URL.createObjectURL(file);
      setEditLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return blobUrl; });
    } catch { /* ignore */ }
    setEditProgress(0);
    setEditUploading(true);
    try {
      const url = await uploadReceipt(file, (p) => setEditProgress(p));
      setEditForm((f) => ({ ...f, receiptUrl: url }));
      setEditLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; });
      setEditProgress(100);
    } catch (e) {
      setEditErr(e.message === 'ยังไม่ได้ตั้งค่า Cloudinary (.env)'
        ? 'ยังไม่ได้ตั้งค่า Cloudinary — ใส่ VITE_CLOUDINARY_* ใน .env แล้ว restart dev server'
        : `อัปโหลดรูปไม่สำเร็จ: ${e.message}`);
    } finally {
      setEditUploading(false);
    }
  };
  const expenses = [...(data.expenses || [])].reverse();
  const grandTotal = (data.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    // M2: รับเฉพาะจำนวนเงิน > 0 ที่ finite (กัน 0/ติดลบ/NaN/Infinity)
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) { setErr('กรอกจำนวนเงินให้ถูกต้อง (ต้องมากกว่า 0)'); return; }
    if (!form.notes.trim()) { setErr('กรอกหมายเหตุว่าใช้จ่ายอะไร'); return; }
    setErr('');
    const label = form.notes.trim();
    const newExpense = { id: nextExpenseId(data.expenses), ...form, item: label, category: 'ทั่วไป', amount: amt };
    saveData({
      ...data,
      expenses: [...(data.expenses || []), newExpense],
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: form.approvedBy || (role === 'staff' ? 'พนักงาน' : 'ระบบ'),
        action: 'บันทึกค่าใช้จ่าย', detail: `${newExpense.id} · ${newExpense.item}`, oldValue: '-', newValue: `฿ ${newExpense.amount}`, approvedBy: form.approvedBy || '-',
      }],
    });
    setForm({ date: bkkToday(), amount: '', method: 'เงินสด', approvedBy: '', receiptUrl: '', notes: '' });
    setLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; });
    setLocalIsPdf(false);
    setProgress(0);
    setSaved(true);
    alertDialog({ title: 'บันทึกค่าใช้จ่ายแล้ว', message: `${label} · ฿ ${newExpense.amount.toLocaleString()}` });
    setTimeout(() => setSaved(false), 2500);
  };

  const openEdit = (exp) => {
    setEditErr('');
    setEditing(exp);
    setEditLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; });
    setEditLocalIsPdf(false);
    setEditProgress(0);
    setEditForm({
      date: exp.date || bkkToday(),
      amount: String(exp.amount ?? ''),
      method: exp.method || 'เงินสด',
      approvedBy: exp.approvedBy || '',
      receiptUrl: exp.receiptUrl || '',
      notes: exp.notes || exp.item || '',
    });
  };

  const closeEdit = () => {
    if (busyId || editUploading) return;
    setEditing(null);
    setEditErr('');
  };

  const saveEdit = async () => {
    if (!editing || busyId) return;
    const amt = Number(editForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) { setEditErr('กรอกจำนวนเงินให้ถูกต้อง (ต้องมากกว่า 0)'); return; }
    if (!editForm.notes.trim()) { setEditErr('กรอกหมายเหตุว่าใช้จ่ายอะไร'); return; }
    setEditErr('');
    const label = editForm.notes.trim();
    const updated = {
      ...editing,
      date: editForm.date || editing.date,
      amount: amt,
      method: editForm.method,
      approvedBy: editForm.approvedBy,
      receiptUrl: editForm.receiptUrl,
      notes: label,
      item: label,
    };
    setBusyId(editing.id);
    try {
      saveData({
        ...data,
        expenses: (data.expenses || []).map((x) => (x.id === editing.id ? updated : x)),
        auditLog: [...(data.auditLog || []), {
          id: `A-${Date.now()}`, timestamp: bkkNow(), user: editForm.approvedBy || (role === 'staff' ? 'พนักงาน' : 'เจ้าของร้าน'),
          action: 'แก้ไขค่าใช้จ่าย', detail: `${editing.id} · ${label}`, oldValue: `฿ ${editing.amount}`, newValue: `฿ ${amt}`, approvedBy: editForm.approvedBy || '-',
        }],
      });
      setEditing(null);
      alertDialog({ title: 'แก้ไขแล้ว', message: `${label} · ฿ ${amt.toLocaleString()}` });
    } finally {
      setBusyId('');
    }
  };

  const deleteExp = async (exp) => {
    if (busyId) return;
    const ok = await confirmDialog({
      title: `ลบรายจ่ายนี้?`,
      message: `${exp.item || exp.notes || exp.id} · ฿ ${Number(exp.amount || 0).toLocaleString()} — ลบแล้วกู้ไม่ได้ ยอดรวมจะเปลี่ยน`,
      confirmLabel: 'ลบเลย', danger: true,
    });
    if (!ok) return;
    setBusyId(exp.id);
    // ลบ cloud ก่อน กันของโผล่กลับตอน reload/realtime (pattern เดียวกับลบบิล)
    syncState.pending += 1;
    try {
      try {
        await deleteExpenseFromCloud(exp.id);
      } catch {
        alertDialog({ title: 'ลบใน cloud ไม่สำเร็จ', message: 'เช็กเน็ตแล้วลองลบอีกครั้ง — รายการอาจโผล่กลับมา' });
        return;
      }
      saveData({
        ...data,
        expenses: (data.expenses || []).filter((x) => x.id !== exp.id),
        auditLog: [...(data.auditLog || []), {
          id: `A-${Date.now()}`, timestamp: bkkNow(), user: role === 'staff' ? 'พนักงาน' : 'เจ้าของร้าน',
          action: 'ลบค่าใช้จ่าย', detail: `${exp.id} · ${exp.item || exp.notes || ''}`, oldValue: `฿ ${exp.amount}`, newValue: 'deleted', approvedBy: exp.approvedBy || '-',
        }],
      });
      if (editing?.id === exp.id) setEditing(null);
      alertDialog({ title: 'ลบรายจ่ายแล้ว', message: `${exp.item || ''}` });
    } finally {
      setBusyId('');
      syncState.pending = Math.max(0, syncState.pending - 1);
      syncState.lastDone = Date.now();
    }
  };

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi dark span2">
          <div className="kpi-label">รายจ่ายสะสมทั้งหมด</div>
          <div className="kpi-value">฿ {grandTotal.toLocaleString()}</div>
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
              <div className="field"><label>ลงชื่อ</label><input value={form.approvedBy} onChange={(e) => setForm({ ...form, approvedBy: e.target.value })} placeholder="ชื่อผู้จ่าย" className="input" /></div>
            </div>
            <div className="field"><label>ใบเสร็จ / หลักฐาน {!isCloudinaryConfigured && <span className="muted">(ยังไม่ตั้งค่า Cloudinary)</span>}</label>
              <label className="filebtn">
                {uploading ? <Loader2 size={19} className="spin" /> : <Upload size={19} />}
                <span>{uploading ? (progress <= 1 ? 'กำลังเตรียมรูป…' : `กำลังอัปโหลด… ${progress}%`) : form.receiptUrl || localPreview ? (receiptPreview ? 'เปลี่ยนรูปใบเสร็จ' : `แนบแล้ว: ${form.receiptUrl}`) : 'แตะเพื่อถ่ายรูป / แนบใบเสร็จ'}</span>
                <input type="file" accept="image/*,application/pdf" hidden disabled={uploading} onChange={(e) => handleFile(e.target.files[0])} />
              </label>
              {uploading && (
                <div className="bar-track" style={{ margin: '8px 0 0' }}><span className="bar-fill" style={{ width: `${Math.max(2, progress)}%` }} /></div>
              )}
              {receiptPreview && !receiptIsPdf && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={receiptPreview} alt="ใบเสร็จ" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  {form.receiptUrl && (
                  <a href={receiptPreview} target="_blank" rel="noopener noreferrer" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <ExternalLink size={13} /> เปิดดูรูปเต็ม
                  </a>
                  )}
                  {uploading && <span className="muted" style={{ fontSize: 12 }}>กำลังอัปโหลด… {progress}%</span>}
                </div>
              )}
              {receiptPreview && receiptIsPdf && (
                <div style={{ marginTop: 8 }}>
                  {form.receiptUrl ? (
                  <a href={receiptPreview} target="_blank" rel="noopener noreferrer" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <ExternalLink size={13} /> เปิดดูใบเสร็จ (PDF)
                  </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>แนบ PDF แล้ว กำลังอัปโหลด… {progress}%</span>
                  )}
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
              const busy = busyId === exp.id;
              return (
              <div key={exp.id} className="exp-row">
                <span className="exp-ic">{url && !isPdfUrl(url) ? <img src={url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 6 }} /> : <Receipt size={16} />}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5, fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{exp.item}</b>
                  <span className="muted">{exp.date} · {exp.method}{exp.approvedBy ? ` · ${exp.approvedBy}` : ''}{url ? <> · <a href={url} target="_blank" rel="noopener noreferrer">ดูใบเสร็จ{isPdfUrl(url) ? ' (PDF)' : ''}</a></> : exp.receiptUrl ? ` · มีไฟล์: ${exp.receiptUrl}` : ''}</span>
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}><b>฿ {Number(exp.amount || 0).toLocaleString()}</b></span>
                <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" className="icon-btn" title="แก้ไข" aria-label={`แก้ไข ${exp.item}`} disabled={!!busyId} onClick={() => openEdit(exp)} style={{ width: 32, height: 32 }}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="icon-btn" title="ลบ" aria-label={`ลบ ${exp.item}`} disabled={!!busyId} onClick={() => deleteExp(exp)} style={{ width: 32, height: 32, color: busy ? undefined : 'var(--red)' }}>
                    {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                  </button>
                </span>
              </div>
              );
            })}
            {expenses.length === 0 && <EmptyState icon={Receipt} title="ยังไม่มีรายจ่าย" subtitle="บันทึกผ่านฟอร์มด้านข้าง" />}
          </div>
        </Card>
      </div>

      {editing && (
        <Modal onClose={closeEdit}>
          <button className="modal-x" onClick={closeEdit} aria-label="ปิด"><X size={16} /></button>
          <h3>แก้ไขรายจ่าย</h3>
          <p className="muted" style={{ marginTop: 4 }}>{editing.id}</p>
          {editErr && <div className="err-banner" style={{ marginTop: 10 }}>⚠ {editErr}</div>}
          <div style={{ marginTop: 12 }}>
            <div className="f2">
              <div className="field"><label>วันที่ *</label><input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="input" /></div>
              <div className="field"><label>จำนวนเงิน (฿) *</label><input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} placeholder="0" className="input" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} /></div>
            </div>
            <div className="field"><label>หมายเหตุ *</label><textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="input" rows={2} /></div>
            <div className="f2">
              <div className="field"><label>วิธีจ่าย</label>
                <select value={editForm.method} onChange={(e) => setEditForm({ ...editForm, method: e.target.value })} className="input">
                  <option>เงินสด</option><option>QR Code / โอนเงิน</option>
                </select>
              </div>
              <div className="field"><label>ลงชื่อ</label><input value={editForm.approvedBy} onChange={(e) => setEditForm({ ...editForm, approvedBy: e.target.value })} placeholder="ชื่อผู้จ่าย" className="input" /></div>
            </div>
            <div className="field"><label>ใบเสร็จ / หลักฐาน</label>
              <label className="filebtn">
                {editUploading ? <Loader2 size={19} className="spin" /> : <Upload size={19} />}
                <span>{editUploading ? (editProgress <= 1 ? 'กำลังเตรียมรูป…' : `กำลังอัปโหลด… ${editProgress}%`) : editForm.receiptUrl || editLocalPreview ? (editPreview ? 'เปลี่ยนรูปใบเสร็จ' : `แนบแล้ว: ${editForm.receiptUrl}`) : 'แตะเพื่อถ่ายรูป / แนบใบเสร็จ'}</span>
                <input type="file" accept="image/*,application/pdf" hidden disabled={editUploading} onChange={(e) => handleEditFile(e.target.files[0])} />
              </label>
              {editUploading && (
                <div className="bar-track" style={{ margin: '8px 0 0' }}><span className="bar-fill" style={{ width: `${Math.max(2, editProgress)}%` }} /></div>
              )}
              {editPreview && !editIsPdf && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={editPreview} alt="ใบเสร็จ" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  {editForm.receiptUrl && (
                  <a href={editPreview} target="_blank" rel="noopener noreferrer" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <ExternalLink size={13} /> เปิดดูรูปเต็ม
                  </a>
                  )}
                  {editUploading && <span className="muted" style={{ fontSize: 12 }}>กำลังอัปโหลด… {editProgress}%</span>}
                </div>
              )}
              {editPreview && editIsPdf && (
                <div style={{ marginTop: 8 }}>
                  {editForm.receiptUrl ? (
                  <a href={editPreview} target="_blank" rel="noopener noreferrer" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <ExternalLink size={13} /> เปิดดูใบเสร็จ (PDF)
                  </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>แนบ PDF แล้ว กำลังอัปโหลด… {editProgress}%</span>
                  )}
                </div>
              )}
            </div>
            <div className="modal-row">
              <button type="button" className="btn btn-ghost" onClick={closeEdit} disabled={!!busyId || editUploading}>ยกเลิก</button>
              <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={!!busyId || editUploading}>
                {busyId ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />} บันทึก
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
