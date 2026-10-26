import { useState } from 'react';
import { Plus, Upload, CheckCircle2, Receipt, ExternalLink, Loader2, Pencil, Trash2, X, Maximize2 } from 'lucide-react';
import { Card, CardHead, EmptyState, Modal, Lightbox, alertDialog, confirmDialog, fmtDay } from '../components/ui';
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
  const [form, setForm] = useState({ date: bkkToday(), amount: '', method: 'เงินสด', approvedBy: '', receiptUrl: '', receiptFile: null, notes: '' });
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [localPreview, setLocalPreview] = useState(null); // blob URL โชว์ทันที ไม่รอ cloud
  const [localIsPdf, setLocalIsPdf] = useState(false);
  const [err, setErr] = useState('');
  // รูปใบเสร็จที่กำลังเปิดดูแบบเต็มจอ (lightbox) — null = ปิด
  const [viewImg, setViewImg] = useState(null);
  // แท็บ: บันทึกรายจ่าย | ประวัติการจ่าย (ประวัติแยกมุมมองรายวัน/รายเดือน)
  const [tab, setTab] = useState('entry');
  const [histView, setHistView] = useState('day');
  const [dayDate, setDayDate] = useState(bkkToday());
  const [monthSel, setMonthSel] = useState(bkkToday().slice(0, 7));
  const receiptPreview = localPreview || resolveImageUrl(form.receiptUrl);
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
  const editPreview = editLocalPreview || resolveImageUrl(editForm.receiptUrl);
  const editIsPdf = editForm.receiptUrl ? isPdfUrl(editPreview) : editLocalIsPdf;

  const handleFile = async (file) => {
    if (!file) return;
    setErr('');
    // เลือกไฟล์ก่อน โชว์ตัวอย่างทันที ค่อยอัปโหลดเป็น payload ตอนกดบันทึก
    setLocalIsPdf(file.type === 'application/pdf');
    try {
      const blobUrl = URL.createObjectURL(file);
      setLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return blobUrl; });
    } catch { /* preview ไม่ได้ก็ข้าม — เลือกไฟล์ต่อได้ */ }
    setForm((f) => ({ ...f, receiptFile: file, receiptUrl: '' }));
    // ไม่เรียก uploadReceipt ที่นี่ — จะส่งเป็น payload พร้อมบันทึกรายจ่าย
  };

  const handleEditFile = async (file) => {
    if (!file) return;
    setEditErr('');
    setEditLocalIsPdf(file.type === 'application/pdf');
    try {
      const blobUrl = URL.createObjectURL(file);
      setEditLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return blobUrl; });
    } catch { /* ignore */ }
    setEditForm((f) => ({ ...f, receiptFile: file, receiptUrl: '' }));
    // ไม่เรียก uploadReceipt ที่นี่ — จะส่งเป็น payload พร้อมบันทึกการแก้ไข
  };
  const allExpenses = data.expenses || [];
  const grandTotal = allExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  // ประวัติ: เรียงวันที่ใหม่ → เก่า (วันเดียวกัน: รายการที่เพิ่มล่าสุดอยู่บน — เหมือนพฤติกรรม reverse() เดิม)
  const historySorted = allExpenses
    .map((e, i) => ({ e, i }))
    .sort((a, b) => String(b.e.date || '').localeCompare(String(a.e.date || '')) || (b.i - a.i))
    .map((x) => x.e);
  const dayList = historySorted.filter((e) => String(e.date || '').slice(0, 10) === dayDate);
  const dayTotal = dayList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthList = historySorted.filter((e) => String(e.date || '').slice(0, 7) === monthSel);
  const monthTotal = monthList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthByDay = monthList.reduce((acc, e) => {
    const d = String(e.date || '').slice(0, 10);
    (acc[d] || (acc[d] = [])).push(e);
    return acc;
  }, {});
  const monthDayKeys = Object.keys(monthByDay).sort((a, b) => b.localeCompare(a));
  // P0-4/P1-9: แถวระบบประกันมือ (notes ขึ้นต้น 'guarantee:') — สร้างอัตโนมัติ ห้ามแก้ notes/amount/date
  const isSysRow = (exp) => typeof (exp && exp.notes) === 'string' && String(exp.notes).startsWith('guarantee:');
  const isOwner = role === 'owner';

  const handleSubmit = async (e) => {
    e.preventDefault();
    // M2: รับเฉพาะจำนวนเงิน > 0 ที่ finite (กัน 0/ติดลบ/NaN/Infinity)
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) { setErr('กรอกจำนวนเงินให้ถูกต้อง (ต้องมากกว่า 0)'); return; }
    if (!form.notes.trim()) { setErr('กรอกหมายเหตุว่าใช้จ่ายอะไร'); return; }
    setErr('');
    const label = form.notes.trim();
    // อัปโหลดไฟล์แนบก่อน ถ้ายังมีไฟล์ที่เลือกไว้แต่ยังไม่อัปโหลด (payload ก่อนอัปโหลด)
    let finalReceiptUrl = form.receiptUrl;
    if (form.receiptFile) {
      setUploading(true);
      try {
        finalReceiptUrl = await uploadReceipt(form.receiptFile, (p) => setProgress(p));
      } catch (e) {
        setUploading(false);
        setProgress(0);
        setErr(e.message === 'ยังไม่ได้ตั้งค่า Cloudinary (.env)'
          ? 'ยังไม่ได้ตั้งค่า Cloudinary — ใส่ VITE_CLOUDINARY_* ใน .env แล้ว restart dev server'
          : `อัปโหลดรูปไม่สำเร็จ: ${e.message}`);
        return;
      }
      setUploading(false);
      setProgress(0);
      // ไม่ต้องใช้ blob URL ตัวอย่างแล้ว
      setLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch {} return null; });
      setLocalIsPdf(false);
    }
    const { receiptFile, ...restForm } = form;
    const newExpense = { id: nextExpenseId(data.expenses), ...restForm, item: label, category: 'ทั่วไป', amount: amt, receiptUrl: finalReceiptUrl };
    saveData({
      ...data,
      expenses: [...(data.expenses || []), newExpense],
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: form.approvedBy || (role === 'staff' ? 'พนักงาน' : 'ระบบ'),
        action: 'บันทึกค่าใช้จ่าย', detail: `${newExpense.id} · ${newExpense.item}`, oldValue: '-', newValue: `฿ ${newExpense.amount}`, approvedBy: form.approvedBy || '-',
      }],
    });
    setForm({ date: bkkToday(), amount: '', method: 'เงินสด', approvedBy: '', receiptUrl: '', receiptFile: null, notes: '' });
    setProgress(0);
    setSaved(true);
    alertDialog({ title: 'บันทึกค่าใช้จ่ายแล้ว', message: `${label} · ฿ ${newExpense.amount.toLocaleString()}` });
    setTimeout(() => setSaved(false), 2500);
  };

  const openEdit = (exp) => {
    // P0-4: แถวระบบล็อกห้ามแก้ (กันแก้ notes แล้วจ่ายเบิ้ล)
    if (isSysRow(exp)) return;
    if (!isOwner) return; // P1-9: role gate — เฉพาะ owner
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
      receiptFile: null,
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
    // P0-4: กันทะลุ — แถวระบบห้ามเซฟแก้เด็ดขาด (notes/amount/date ล็อก)
    if (isSysRow(editing)) { setEditErr('แถวระบบประกันมือ — แก้ไขไม่ได้ (ลบได้อย่างเดียว)'); return; }
    if (!isOwner) { setEditErr('เฉพาะเจ้าของร้านเท่านั้น'); return; }
    const amt = Number(editForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) { setEditErr('กรอกจำนวนเงินให้ถูกต้อง (ต้องมากกว่า 0)'); return; }
    if (!editForm.notes.trim()) { setEditErr('กรอกหมายเหตุว่าใช้จ่ายอะไร'); return; }
    setEditErr('');
    const label = editForm.notes.trim();
    // อัปโหลดไฟล์แนบใหม่ก่อน ถ้ามีไฟล์ที่เลือกไว้แต่ยังไม่อัปโหลด (payload ก่อนอัปโหลด)
    let finalReceiptUrl = editForm.receiptUrl;
    if (editForm.receiptFile) {
      setEditUploading(true);
      try {
        finalReceiptUrl = await uploadReceipt(editForm.receiptFile, (p) => setEditProgress(p));
      } catch (e) {
        setEditUploading(false);
        setEditProgress(0);
        setEditErr(e.message === 'ยังไม่ได้ตั้งค่า Cloudinary (.env)'
          ? 'ยังไม่ได้ตั้งค่า Cloudinary — ใส่ VITE_CLOUDINARY_* ใน .env แล้ว restart dev server'
          : `อัปโหลดรูปไม่สำเร็จ: ${e.message}`);
        return;
      }
      setEditUploading(false);
      setEditProgress(0);
      setEditLocalPreview((prev) => { try { prev && URL.revokeObjectURL(prev); } catch {} return null; });
      setEditLocalIsPdf(false);
    }
    const { receiptFile, ...restEditForm } = editForm;
    const updated = {
      ...editing,
      ...restEditForm,
      date: editForm.date || editing.date,
      amount: amt,
      method: editForm.method,
      approvedBy: editForm.approvedBy,
      receiptUrl: finalReceiptUrl,
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
    if (!isOwner) return; // P1-9: role gate — ซ่อนปุ่มแล้ว + กันเรียกตรง
    // P0-4: แถวระบบเตือนก่อนลบว่าเงื่อนไขยังเข้าจะสร้างกลับมาใหม่ (ไม่ทำ blocklist แค่เตือน)
    const sys = isSysRow(exp);
    const ok = await confirmDialog({
      title: `ลบรายจ่ายนี้?`,
      message: sys
        ? `${exp.item || exp.notes || exp.id} · ฿ ${Number(exp.amount || 0).toLocaleString()} — แถวระบบประกันมือ: ลบแล้วระบบจะสร้างกลับมาใหม่ถ้าเงื่อนไขยังเข้า`
        : `${exp.item || exp.notes || exp.id} · ฿ ${Number(exp.amount || 0).toLocaleString()} — ลบแล้วกู้ไม่ได้ ยอดรวมจะเปลี่ยน`,
      confirmLabel: 'ลบเลย', danger: true,
    });
    if (!ok) return;
    setBusyId(exp.id);
    // ลบ cloud ก่อน กันของโผล่กลับตอน reload/realtime (pattern เดียวกับลบบิล)
    syncState.pending += 1;
    try {
      try {
        await deleteExpenseFromCloud(exp.id, [resolveImageUrl(exp.receiptUrl)]);
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

  // แถวรายการ — ใช้ร่วมกันทั้งมุมมองรายวันและรายเดือน
  // โครง: [ไอคอนใบเสร็จ] [ชื่อรายการ + เมตา] [ยอด + ปุ่มแก้/ลบ]
  // ไม่แสดงวันที่ซ้ำ (รายวันเลือกวันอยู่แล้ว / รายเดือนมีหัวกลุ่มวัน)
  // รูปย่อซ้าย = ปุ่มดูรูปใหญ่ (lightbox) — เฉพาะกรณีเป็น "รูป" เท่านั้น
  // ส่วน PDF คงพฤติกรรมเดิม (ลิงก์ในบรรทัดเมตา เปิดแท็บใหม่) ตามที่ตกลง
  const renderExpense = (exp) => {
    const url = resolveImageUrl(exp.receiptUrl);
    const busy = busyId === exp.id;
    const sys = isSysRow(exp);
    const title = exp.item || exp.notes || exp.id;
    const isImg = !!url && !isPdfUrl(url);
    return (
      <div key={exp.id} className="exp-row">
        {isImg ? (
          <button
            type="button"
            className="exp-ic exp-ic-btn"
            onClick={() => setViewImg(url)}
            title="ดูรูปใหญ่"
            aria-label={`ดูรูปใบเสร็จของ ${title}`}
          >
            <img src={url} alt="" />
            <span className="exp-zoom" aria-hidden="true"><Maximize2 size={9} /></span>
          </button>
        ) : (
          <span className="exp-ic"><Receipt size={16} /></span>
        )}
        <div className="exp-main">
          <div className="exp-title">
            <b title={title}>{title}</b>
            {sys && <span className="exp-tag">ระบบ</span>}
          </div>
          <div className="exp-meta">
            <span>{exp.method || 'เงินสด'}</span>
            {exp.approvedBy ? (<><i className="exp-dot" /><span>{exp.approvedBy}</span></>) : null}
            {/* รูป: ดูได้จากรูปย่อซ้าย ไม่ต้องซ้ำในเมตา — PDF/ไฟล์ที่แสดงเป็นรูปไม่ได้ คงลิงก์เดิม */}
            {!isImg && url ? (
              <><i className="exp-dot" /><a href={url} target="_blank" rel="noopener noreferrer" className="exp-link" title="เปิดใบเสร็จ (PDF)"><ExternalLink size={11} /> ดูใบเสร็จ (PDF)</a></>
            ) : !isImg && exp.receiptUrl ? (
              <><i className="exp-dot" /><span title={exp.receiptUrl}>มีไฟล์: {exp.receiptUrl}</span></>
            ) : null}
          </div>
        </div>
        <div className="exp-side">
          <b className="exp-amt">฿ {Number(exp.amount || 0).toLocaleString()}</b>
          {isOwner && (
            <div className="exp-acts">
              {!sys && (
                <button type="button" className="exp-act" title="แก้ไข" aria-label={`แก้ไข ${title}`} disabled={!!busyId} onClick={() => openEdit(exp)}>
                  <Pencil size={14} />
                </button>
              )}
              <button type="button" className="exp-act danger" title={sys ? 'ลบ (ระบบจะสร้างกลับมาใหม่ถ้าเงื่อนไขยังเข้า)' : 'ลบ'} aria-label={`ลบ ${title}`} disabled={!!busyId} onClick={() => deleteExp(exp)}>
                {busy ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* แท็บหลัก */}
      <div className="seg" style={{ marginBottom: 16 }}>
        <button type="button" onClick={() => setTab('entry')} className={tab === 'entry' ? 'on' : ''}>บันทึกรายจ่าย</button>
        <button type="button" onClick={() => setTab('history')} className={tab === 'history' ? 'on' : ''}>ประวัติการจ่าย</button>
      </div>

      {tab === 'entry' && (
        <>
          {/* KPI แสดงเมื่อมีข้อมูลจริงเท่านั้น — ไม่มีรายจ่ายเลยก็ไม่ต้องมีการ์ด 0 บาทบังฟอร์ม */}
          {allExpenses.length > 0 && (
            <div className="kpi-grid">
              <div className="kpi dark span2">
                <div className="kpi-label">รายจ่ายสะสมทั้งหมด</div>
                <div className="kpi-value">฿ {grandTotal.toLocaleString()}</div>
                <div className="kpi-sub">{allExpenses.length} รายการ</div>
              </div>
            </div>
          )}

          <div style={{ maxWidth: 720 }}>
            <Card>
              <CardHead title="บันทึกค่าใช้จ่าย" />
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
                  <div className="field"><label>ใบเสร็จ</label>
                    <label className="filebtn">
                      {uploading ? <Loader2 size={19} className="spin" /> : <Upload size={19} />}
                      <span>{uploading ? (progress <= 1 ? 'กำลังอัปโหลดไฟล์…' : `กำลังอัปโหลดไฟล์… ${progress}%`) : form.receiptFile ? `เลือกไฟล์: ${form.receiptFile.name}` : form.receiptUrl || localPreview ? (receiptPreview ? 'เปลี่ยนรูปใบเสร็จ' : `แนบแล้ว: ${form.receiptUrl}`) : 'แตะเพื่อถ่ายรูป / แนบใบเสร็จ'}</span>
                    <input type="file" accept="image/*,application/pdf" hidden disabled={uploading} onChange={(e) => handleFile(e.target.files[0])} />
                  </label>
                  {uploading && (
                    <div className="bar-track" style={{ margin: '8px 0 0' }}><span className="bar-fill" style={{ width: `${Math.max(2, progress)}%` }} /></div>
                  )}
                  {receiptPreview && !receiptIsPdf && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <img src={receiptPreview} alt="ใบเสร็จ" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                      {form.receiptUrl && (
                      <button type="button" className="mini-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }} onClick={() => setViewImg(receiptPreview)}>
                        <ExternalLink size={13} /> เปิดดูรูปเต็ม
                      </button>
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
          </div>
        </>
      )}

      {tab === 'history' && (
        <>
          {/* ตัวกรองย่อย (chip) แยกจากแท็บหลัก เพื่อไม่ให้ดูเป็นแท็บซ้อนแท็บ */}
          <div className="chip-row" style={{ marginBottom: 12 }}>
            <button type="button" className={`chip${histView === 'day' ? ' on' : ''}`} onClick={() => setHistView('day')}>รายวัน</button>
            <button type="button" className={`chip${histView === 'month' ? ' on' : ''}`} onClick={() => setHistView('month')}>รายเดือน</button>
          </div>

          <Card>
            {histView === 'day' ? (
              <>
                <CardHead title="ประวัติรายวัน" hint={`${dayList.length} รายการ · ฿ ${dayTotal.toLocaleString()}`} />
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>เลือกวันที่</label>
                  <input type="date" value={dayDate} onChange={(e) => e.target.value && setDayDate(e.target.value)} className="input" />
                </div>
                {dayList.length > 0
                  ? dayList.map(renderExpense)
                  : <EmptyState compact icon={Receipt} title="ไม่มีรายจ่ายวันนี้" subtitle="เลือกวันอื่น หรือบันทึกผ่านแท็บ 'บันทึกรายจ่าย'" />}
              </>
            ) : (
              <>
                <CardHead title="ประวัติรายเดือน" hint={`${monthList.length} รายการ · ฿ ${monthTotal.toLocaleString()}`} />
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>เลือกเดือน</label>
                  <input type="month" value={monthSel} onChange={(e) => e.target.value && setMonthSel(e.target.value)} className="input" />
                </div>
                {monthDayKeys.length > 0 ? monthDayKeys.map((d) => {
                  const list = monthByDay[d];
                  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
                  return (
                    <div key={d}>
                      <div className="exp-day-head">
                        <b>{fmtDay(d)}</b>
                        <b className="num">฿ {total.toLocaleString()}</b>
                      </div>
                      {list.map(renderExpense)}
                    </div>
                  );
                }) : <EmptyState compact icon={Receipt} title="ไม่มีรายจ่ายเดือนนี้" subtitle="เลือกเดือนอื่น หรือบันทึกผ่านแท็บ 'บันทึกรายจ่าย'" />}
              </>
            )}
          </Card>
        </>
      )}

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
                <span>{editUploading ? (editProgress <= 1 ? 'กำลังอัปโหลดไฟล์…' : `กำลังอัปโหลดไฟล์… ${editProgress}%`) : editForm.receiptFile ? `เลือกไฟล์: ${editForm.receiptFile.name}` : editForm.receiptUrl || editLocalPreview ? (editPreview ? 'เปลี่ยนรูปใบเสร็จ' : `แนบแล้ว: ${editForm.receiptUrl}`) : 'แตะเพื่อถ่ายรูป / แนบใบเสร็จ'}</span>
                <input type="file" accept="image/*,application/pdf" hidden disabled={editUploading} onChange={(e) => handleEditFile(e.target.files[0])} />
              </label>
              {editUploading && (
                <div className="bar-track" style={{ margin: '8px 0 0' }}><span className="bar-fill" style={{ width: `${Math.max(2, editProgress)}%` }} /></div>
              )}
              {editPreview && !editIsPdf && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={editPreview} alt="ใบเสร็จ" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  {editForm.receiptUrl && (
                  <button type="button" className="mini-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }} onClick={() => setViewImg(editPreview)}>
                    <ExternalLink size={13} /> เปิดดูรูปเต็ม
                  </button>
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

      {/* lightbox: ดูรูปใบเสร็จเต็มจอ — มาตรฐานเดียวกันทั้งแอป (แตะพื้นหลัง/Esc/ปุ่ม X ปิด) */}
      <Lightbox url={viewImg} title="ใบเสร็จ" onClose={() => setViewImg(null)} />
    </div>
  );
}
