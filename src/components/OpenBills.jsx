import { useState } from 'react';
import { ShieldAlert, TriangleAlert, Plus, Trash2, Upload, X, FileText, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { Card, CardHead, EmptyState, StatusBadge, Modal, alertDialog, confirmDialog, formatDuration } from './ui';
import { bkkNow, fmtBkk } from '../utils/bkk';
import { commBaht, freelanceDisplayName, isFreelance } from '../lib/billing';
import { getOwnerPass } from '../lib/auth';
import { uploadSlip, resolveImageUrl } from '../lib/images';

const billRows = (b) => b.items || b.customers || [];
const rowNet = (i) => i.net ?? i.price ?? 0;
// สูตรยอดบิลมาตรฐานทั้งแอป: ผลรวม net รายแถว − ส่วนลดท้ายบิล (ต้องตรงกับ total ที่เซฟ)
// สูตรเดียวกับ PageBills.jsx / PageDashboard.jsx / MonthStatement.jsx
const billTotal = (b) => Math.max(0, billRows(b).reduce((s, i) => s + rowNet(i), 0) - (b.discount || 0));
const payMethods = ['เงินสด', 'QR Code / โอนเงิน'];
const BREAK_MINUTES = 15;

// C2: รหัสเจ้าของร้าน — รวมไว้ที่ lib/auth.js ที่เดียว (อ่านจาก env ก่อน + fallback เดิม)
// TODO(security): ย้ายการตรวจรหัส void ไปไว้ฝั่ง server (Supabase Edge Function + RLS)
// ห้าม hardcode รหัสซ้ำหลายไฟล์ — ใช้ค่าจาก lib/auth.js ที่เดียว

// id แถวบริการ: ใช้ UUID (string) เพื่อไม่ชนกันหลังลบ/เพิ่ม; fallback เป็น int จาก Date.now()
function newRowId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fallback ด้านล่าง */ }
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

// สลิปอาจเป็น PDF (accept="image/*,application/pdf") — อย่า render <img> ตรง ๆ ถ้าเป็น PDF
function isPdfUrl(url) {
  const s = String(url || '').split('?')[0].toLowerCase();
  return s.endsWith('.pdf');
}

function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function timeToMinutes(t) {
  if (!t || !String(t).includes(':')) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/* ข้อความเวลาของรายการ: "12:15 – 14:15 · รวม 2 ชม" */
function itemTimeText(it) {
  const mins = it.totalMinutes || it.duration || 0;
  const startMin = timeToMinutes(it.startTime);
  const end = it.endTime || (startMin != null && mins > 0 ? minutesToTime(startMin + mins) : '');
  if (!it.startTime && !end) return '—';
  return `${it.startTime || '?'} – ${end || '?'}${mins > 0 ? ` · รวม ${formatDuration(mins)}` : ''}`;
}

/* ใบเสร็จ: รายการ (แตะขยายได้) + โปร + ยอดรวม */
function ReceiptCard({ items, services, therapists, subtotal, disc, discLabel, total, expandedKey, onToggle, onRemove }) {
  const [deletingKey, setDeletingKey] = useState(null);
  const nameOf = (it) => {
    if (it.serviceName) return it.serviceName;
    const svc = (services || []).find((s) => s.id === it.serviceId);
    if (svc) return `${svc.category}${svc.duration != null ? ` ${formatDuration(svc.duration)}` : ''}`;
    return 'บริการที่ลบแล้ว';
  };
  const commOf = (it) => {
    const svc = (services || []).find((s) => s.id === it.serviceId);
    return commBaht(svc) * (it.qty || 1);
  };
  const commTotal = items.reduce((s, it) => s + commOf(it), 0);
  return (
    <div className="rcpt">
      {items.map((it, idx) => {
        const key = it._key ?? idx;
        const open = expandedKey === key;
        const isRun = isFreelance(it.therapistId, therapists);
        return (
          <div key={key} className="rcpt-card">
            <div className="rcpt-top">
              <button type="button" className="rcpt-line1" onClick={() => onToggle && onToggle(open ? null : key)} aria-expanded={open}>
                <b>{nameOf(it)}</b>
                <span className="amt">฿ {(it.net ?? it.price ?? 0).toLocaleString()}</span>
              </button>
              {onRemove && (
                <button
                  onClick={async () => {
                    if (deletingKey != null) return;
                    setDeletingKey(key);
                    try {
                      const ok = await confirmDialog({ title: 'ลบรายการนี้?', message: nameOf(it), confirmLabel: 'ลบ', danger: true });
                      if (ok) onRemove(it);
                    } finally {
                      setDeletingKey(null);
                    }
                  }}
                  disabled={deletingKey === key}
                  aria-label={`ลบรายการ ${nameOf(it)}`}
                  className="icon-btn danger rcpt-del"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
            <div className="rcpt-chips">
              <span className="rcpt-doc-chip">{freelanceDisplayName(it.therapistName || it.therapistId || '—')}{isRun ? ' · หมอวิ่ง' : ''}</span>
              <span className="rcpt-comm-chip">ค่าแรง ฿ {commOf(it).toLocaleString()}</span>
            </div>
            <div className="rcpt-time"><Clock size={12} />{itemTimeText(it)}</div>
            {open && (it.addons || []).length > 0 && (
              <div className="rcpt-sub">
                +{(it.addons || []).map((a) => a.name).join(', ')}
              </div>
            )}
          </div>
        );
      })}
      <div className="perf" />
      {disc > 0 && (
        <div className="rcpt-sumrow"><span>รวมย่อย</span><b>฿ {subtotal.toLocaleString()}</b></div>
      )}
      {disc > 0 && (
        <div className="rcpt-sumrow disc"><span>{discLabel || 'ส่วนลด'}</span><b>−฿ {disc.toLocaleString()}</b></div>
      )}
      <div className="rcpt-total">
        <span className="muted">ยอดสุทธิ</span>
        <span className="grand">฿ {total.toLocaleString()}</span>
      </div>
    </div>
  );
}

/* บิลที่เปิดค้างไว้ (ยังไม่เช็คบิล) — แสดงในหน้า POS พร้อมปุ่มแก้ไข / เช็คบิล / ยกเลิก */
export default function OpenBillsSection({ data, saveData, role }) {
  // ปุ่มยกเลิกโชว์ทุก role — modal ยกเลิกบังคับใส่รหัสเจ้าของร้านอยู่แล้ว
  const canVoid = true;
  const openBills = [...(data.bills || [])].filter((b) => b.status === 'open').reverse();

  const [editTarget, setEditTarget] = useState(null);
  const [editDiscount, setEditDiscount] = useState('');
  const [editPromoId, setEditPromoId] = useState('');
  const [editPay, setEditPay] = useState('เงินสด');
  const [expandedKey, setExpandedKey] = useState(null);
  const [showAddSvc, setShowAddSvc] = useState(false);
  const promosActive = (data.promotions || []).filter((p) => p.active !== false);
  const [editItems, setEditItems] = useState([]);
  const [addSvcId, setAddSvcId] = useState('');
  const [editErr, setEditErr] = useState('');
  const [checkoutTarget, setCheckoutTarget] = useState(null);
  const [checkoutPay, setCheckoutPay] = useState('เงินสด');
  const [slipName, setSlipName] = useState('');
  const [slipUploading, setSlipUploading] = useState(false);
  const [slipProgress, setSlipProgress] = useState(0);
  const [slipLocal, setSlipLocal] = useState(null); // blob URL โชว์ทันที
  const [slipLocalIsPdf, setSlipLocalIsPdf] = useState(false);
  const [slipErr, setSlipErr] = useState('');
  const slipPreview = slipLocal || resolveImageUrl(slipName);
  const slipIsPdf = slipName ? isPdfUrl(resolveImageUrl(slipName)) : slipLocalIsPdf;
  const [voidTarget, setVoidTarget] = useState(null);
  const [authPass, setAuthPass] = useState('');
  const [voidErr, setVoidErr] = useState('');

  // โชว์ชื่อแทนรหัส: ใช้ชื่อที่เซฟในบิลก่อน ถ้าไม่มีค้นจากทะเบียนปัจจุบัน
  // หมอวิ่งตัด prefix เทคนิค (EXT-VIS-) เหลือแค่ชื่อ — ไม่โชว์รหัสดิบใน UI
  const therapistNameOf = (b, rows) => {
    if (b.therapistName) return freelanceDisplayName(b.therapistName);
    if (rows[0]?.therapistName) return freelanceDisplayName(rows[0].therapistName);
    const tid = b.therapistId || rows[0]?.therapistId;
    const t = (data.therapists || []).find((x) => x.id === tid);
    return t ? t.name : freelanceDisplayName(tid || '—');
  };
  // M5: หาไม่เจอคืน 'บริการที่ลบแล้ว' ไม่โชว์รหัสดิบ
  const serviceNameOf = (it) => {
    if (it.serviceName) return it.serviceName;
    const svc = (data.services || []).find((x) => x.id === it.serviceId);
    if (svc) return `${svc.category}${svc.duration != null ? ` ${formatDuration(svc.duration)}` : ''}`;
    return 'บริการที่ลบแล้ว';
  };
  if (openBills.length === 0 && !editTarget && !checkoutTarget && !voidTarget) {
    return (
      <div id="open-bills" style={{ scrollMarginTop: 16 }}>
        <Card><EmptyState icon={FileText} title="ไม่มีบิลที่เปิดอยู่" subtitle="เปิดบิลใหม่จากหน้า POS" /></Card>
      </div>
    );
  }

  const startEdit = (b) => {
    setEditTarget(b);
    setEditDiscount(b.discount ? String(b.discount) : '');
    setEditPromoId(promosActive.find((p) => b.promotion && p.name === b.promotion)?.id || '');
    setEditPay(b.paymentMethod || 'เงินสด');
    setEditItems(billRows(b).map((it) => ({ ...it, _key: newRowId() })));
    setAddSvcId(''); setEditErr('');
    setExpandedKey(null); setShowAddSvc(false);
  };
  const selectEditPromo = (p) => {
    if (editPromoId === p.id) { setEditPromoId(''); setEditDiscount(''); }
    else { setEditPromoId(p.id); setEditDiscount(String(p.amount)); }
    setEditErr('');
  };

  const editSubtotal = editItems.reduce((s, i) => s + (i.net ?? i.price ?? 0), 0);
  const editDisc = Math.max(0, Math.min(editSubtotal, Number(editDiscount) || 0));
  const editTotal = editSubtotal - editDisc;

  const handleRemoveEditItem = (key) => {
    if (editItems.length <= 1) { setEditErr('บิลต้องเหลืออย่างน้อย 1 รายการ (ถ้าไม่เอาแล้วให้ยกเลิกบิล)'); return; }
    setEditItems(editItems.filter((i) => i._key !== key));
  };

  const handleAddEditItem = () => {
    if (!addSvcId) { setEditErr('เลือกบริการที่จะเพิ่มก่อน'); return; }
    const svc = (data.services || []).find((s) => s.id === addSvcId);
    if (!svc) { setEditErr('ไม่พบบริการนี้'); return; }
    // โมเดลใหม่: หมอระดับบิล + ต่อท้ายคิวเดิม (จบล่าสุด + พักห้อง)
    const therapistId = editTarget?.therapistId || editItems[0]?.therapistId;
    const therapistName = editTarget?.therapistName || editItems[0]?.therapistName || '';
    if (!therapistId) { setEditErr('ไม่พบหมอเดิมของบิลนี้'); return; }
    const lastEnd = editItems.reduce((m, it) => {
      const s = timeToMinutes(it.startTime);
      const e = it.endTime ? timeToMinutes(it.endTime) : (s != null ? s + (it.totalMinutes || it.duration || 0) : null);
      return e != null ? Math.max(m, e) : m;
    }, null);
    const startMin = lastEnd != null ? lastEnd + BREAK_MINUTES : null;
    const mins = svc.duration || 0;
    const label = svc.duration != null
      ? `${svc.category} ${svc.duration < 60 ? `${svc.duration} นาที` : svc.duration % 60 === 0 ? `${svc.duration / 60} ชม` : `${Math.floor(svc.duration / 60)} ชม ${svc.duration % 60} นาที`}`
      : svc.category;
    setEditItems([...editItems, {
      _key: newRowId(), serviceId: svc.id, serviceName: label, category: svc.category,
      therapistId, therapistName, qty: 1, price: svc.price, discount: 0, net: svc.price,
      duration: mins, totalMinutes: mins,
      startTime: startMin != null ? minutesToTime(startMin) : '',
      endTime: startMin != null ? minutesToTime(startMin + mins) : '',
    }]);
    setAddSvcId(''); setEditErr('');
  };

  // C5: schema เดียว — เขียน items อย่างเดียว (อ่านรองรับ customers เก่าผ่าน billRows)
  // คง field ครบทุกรายการ: id/price/discount/net/startTime/endTime/qty/addons
  // total ที่เซฟ (= subtotal − disc) ต้องตรงกับ billTotal() เสมอ
  const buildUpdatedBill = () => {
    if (!editTarget) return null;
    const rows = editItems.map(({ _key, ...r }) => ({ ...r }));
    const subtotal = rows.reduce((s, i) => s + (i.net ?? i.price ?? 0), 0);
    const disc = Math.max(0, Math.min(subtotal, Number(editDiscount) || 0));
    const normalized = rows.map((c) => ({
      id: c.id || newRowId(),
      serviceId: c.serviceId,
      serviceName: c.serviceName,
      category: c.category,
      therapistId: c.therapistId,
      therapistName: c.therapistName,
      qty: c.qty || 1,
      price: c.price ?? c.net ?? 0,
      discount: c.discount || 0,
      net: c.net ?? c.price ?? 0,
      duration: c.duration,
      totalMinutes: c.totalMinutes || c.duration,
      startTime: c.startTime,
      endTime: c.endTime,
      addons: c.addons || [],
    }));
    return {
      meta: { rows: normalized, subtotal, disc },
      bill: {
        ...editTarget,
        discount: disc,
        promotion: promosActive.find((p) => p.id === editPromoId)?.name || '',
        paymentMethod: editPay,
        subtotal, total: subtotal - disc,
        items: normalized,
      },
    };
  };

  const saveEdit = () => {
    if (!editTarget) return;
    if (editItems.length === 0) { setEditErr('บิลต้องมีอย่างน้อย 1 รายการ'); return; }
    const updated = buildUpdatedBill();
    if (!updated) return;
    const { rows, subtotal, disc } = updated.meta;
    saveData({
      ...data,
      bills: data.bills.map((b) => (b.id === editTarget.id ? updated.bill : b)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: role === 'staff' ? 'พนักงาน' : 'เจ้าของร้าน',
        action: 'แก้ไขบิลที่เปิดอยู่', detail: `${editTarget.customer || 'ลูกค้าหน้าร้าน'} · ${rows.length} รายการ · ฿ ${(subtotal - disc).toLocaleString()}`,
        oldValue: 'open', newValue: 'open', approvedBy: '-',
      }],
    });
    setEditTarget(null);
    alertDialog({ title: 'บันทึกบิลแล้ว', message: `${editTarget.customer || 'ลูกค้าหน้าร้าน'} · ${rows.length} รายการ · ฿ ${(subtotal - disc).toLocaleString()}` });
  };

  // บันทึกเงียบ (ไม่ alert) แล้วต่อด้วย modal เช็คบิล — ปุ่ม "เช็คบิลเลย" ใน modal แก้ไข
  const saveEditAndCheckout = () => {
    if (!editTarget) return;
    if (editItems.length === 0) { setEditErr('บิลต้องมีอย่างน้อย 1 รายการ'); return; }
    const updated = buildUpdatedBill();
    if (!updated) return;
    const { rows, subtotal, disc } = updated.meta;
    saveData({
      ...data,
      bills: data.bills.map((b) => (b.id === editTarget.id ? updated.bill : b)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: role === 'staff' ? 'พนักงาน' : 'เจ้าของร้าน',
        action: 'แก้ไขบิลที่เปิดอยู่', detail: `${editTarget.customer || 'ลูกค้าหน้าร้าน'} · ${rows.length} รายการ · ฿ ${(subtotal - disc).toLocaleString()}`,
        oldValue: 'open', newValue: 'open', approvedBy: '-',
      }],
    });
    setEditTarget(null);
    startCheckoutBill(updated.bill);
  };

  const startCheckoutBill = (b) => {
    setCheckoutTarget(b);
    setCheckoutPay(b.paymentMethod || 'เงินสด');
    setSlipName(b.slip || '');
    setSlipLocal((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; });
    setSlipLocalIsPdf(false);
    setSlipProgress(0);
    setSlipErr('');
    setExpandedKey(null);
  };

  const handleSlipFile = async (file) => {
    if (!file) return;
    setSlipErr('');
    setSlipLocalIsPdf(file.type === 'application/pdf');
    try {
      const blobUrl = URL.createObjectURL(file);
      setSlipLocal((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return blobUrl; });
    } catch { /* ignore */ }
    setSlipProgress(0);
    setSlipUploading(true);
    try {
      const url = await uploadSlip(file, (p) => setSlipProgress(p));
      setSlipName(url);
      setSlipLocal((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; });
      setSlipProgress(100);
    } catch (e) {
      setSlipErr(e.message || 'อัปโหลดสลิปไม่สำเร็จ');
    } finally {
      setSlipUploading(false);
    }
  };

  const doCheckoutBill = (b, payMethod) => {
    saveData({
      ...data,
      bills: data.bills.map((x) => (x.id === b.id ? { ...x, status: 'paid', paymentMethod: payMethod, paidAt: bkkNow(), slip: payMethod === 'QR Code / โอนเงิน' ? (slipName || '') : '' } : x)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: role === 'staff' ? 'พนักงาน' : 'เจ้าของร้าน',
        action: 'เช็คบิล', detail: `${b.customer || 'ลูกค้าหน้าร้าน'} · ฿ ${billTotal(b).toLocaleString()} · ${payMethod}`,
        oldValue: 'open', newValue: 'paid', approvedBy: '-',
      }],
    });
    setCheckoutTarget(null); setSlipName('');
    setSlipLocal((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; });
    setSlipProgress(0);
  };

  // พนักงานกดยกเลิกได้ แต่จะขึ้นแจ้งว่าต้องให้เจ้าของร้านทำ — เจ้าของร้านกดแล้วเข้า modal รหัสเหมือนเดิม
  const requestVoid = (b) => {
    if (role === 'staff') {
      alertDialog({ title: 'จำเป็นต้องให้เจ้าของร้านยกเลิก', message: 'บิลนี้ต้องให้เจ้าของร้านเป็นคนยกเลิก กรุณาเรียกเจ้าของร้านมายืนยัน' });
      return;
    }
    setVoidTarget(b); setAuthPass(''); setVoidErr('');
  };

  const confirmVoid = () => {    if (authPass !== getOwnerPass(data?.ownerPass)) { setVoidErr('รหัสไม่ถูกต้อง'); return; }
    saveData({
      ...data,
      bills: data.bills.map((b) => (b.id === voidTarget.id ? { ...b, status: 'cancelled' } : b)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: 'เจ้าของร้าน',
        action: 'ยกเลิกบิล', detail: `${voidTarget.customer || 'ลูกค้าหน้าร้าน'}`,
        oldValue: voidTarget.status || 'open', newValue: 'cancelled', approvedBy: 'เจ้าของร้าน',
      }],
    });
    setVoidTarget(null); setAuthPass(''); setVoidErr('');
    alertDialog({ title: 'ยกเลิกบิลแล้ว', message: 'สถานะเปลี่ยนเป็นยกเลิกแล้ว' });
  };

  return (
    <div id="open-bills" style={{ scrollMarginTop: 16 }}>
      {openBills.length > 0 && (
        <Card>
          <CardHead title="บิลที่เปิดอยู่" hint={`${openBills.length} บิล · รอเช็คบิล`} />
          
          {openBills.map((b) => {
            const rows = billRows(b);
            const docName = therapistNameOf(b, rows);
            const docExtra = isFreelance(b.therapistId || rows[0]?.therapistId, data.therapists) ? ' (หมอวิ่ง)' : '';
            return (
            <div key={b.id} className="ob-card">
              <div className="ob-head">
                <span className="ob-ava">{(docName || '?').charAt(0)}</span>
                <span className="ob-who">
                  <b>{docName}{docExtra}</b>
                  <span className="muted">{fmtBkk(b.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {rows.length} บริการ{b.startTime ? ` · เริ่ม ${b.startTime}` : ''}</span>
                </span>
                <StatusBadge status="open" />
              </div>
              <div className="ob-rows">
              {rows.map((it, i) => (
                <div key={i} className="ob-row">
                  <span className="ob-time muted">{(it.startTime || it.endTime) ? `${it.startTime || '?'}–${it.endTime || '?'}` : '—'}</span>
                  <span className="ob-name">{serviceNameOf(it)}</span>
                  <b className="ob-price">฿ {(it.net ?? it.price ?? 0).toLocaleString()}</b>
                </div>
              ))}
              </div>
              {b.promotion ? <div className="ob-promo muted">โปร: {b.promotion}</div> : null}
              <div className="ob-total">
                <span className="ob-sum">
                  <span className="ob-grand">฿ {billTotal(b).toLocaleString()}</span>
                </span>
                <span className="ob-btns">
                  <button onClick={() => startEdit(b)} className="btn btn-ghost">แก้ไข</button>
                  <button onClick={() => startCheckoutBill(b)} className="btn btn-primary">เช็คบิล</button>
                  {canVoid && <button onClick={() => requestVoid(b)} className="btn-soft-danger">ยกเลิก</button>}
                </span>
              </div>
            </div>
            );
          })}
        </Card>
      )}

      {editTarget && (
        <Modal onClose={() => setEditTarget(null)}>
          <button className="modal-x" onClick={() => setEditTarget(null)} aria-label="ปิด"><X size={16} /></button>
          <div className="mcard-top" style={{ paddingRight: 34 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>แก้ไขบิล</h3>
                <div className="muted">{fmtBkk(editTarget.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {editItems.length} รายการ</div>  
              </div>
            </div>
            <StatusBadge status="open" />
          </div>
          {editErr && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {editErr}</div>}

          <ReceiptCard
            items={editItems}
            services={data.services}
            therapists={data.therapists}
            subtotal={editSubtotal}
            disc={editDisc}
            discLabel={promosActive.find((p) => p.id === editPromoId)?.name || editTarget.promotion || ''}
            total={editTotal}
            expandedKey={expandedKey}
            onToggle={setExpandedKey}
            onRemove={(it) => handleRemoveEditItem(it._key)}
          />

          {!showAddSvc ? (
            <button type="button" className="dash-add" onClick={() => { setShowAddSvc(true); setEditErr(''); }}><Plus size={15} /> เพิ่มบริการ</button>
          ) : (
            <div className="field">
              <label>เพิ่มบริการ (หมอเดิม)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={addSvcId} onChange={(e) => { setAddSvcId(e.target.value); setEditErr(''); }} className="input" style={{ flex: 1, minWidth: 0 }}>
                  <option value="">— เลือกบริการ —</option>
                  {(data.services || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.category}{s.duration != null ? ` ${s.duration}น` : ''} · ฿ {s.price.toLocaleString()}
                    </option>
                  ))}
                </select>
                <button onClick={handleAddEditItem} className="btn btn-ghost" type="button" style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '11px 14px' }}><Plus size={15} /> เพิ่ม</button>
              </div>
              <p className="muted" style={{ marginTop: 6 }}>
                หมอ: <b>{freelanceDisplayName(editItems[0]?.therapistName || editItems[0]?.therapistId || '—')}</b>
                {isFreelance(editItems[0]?.therapistId, data.therapists) ? ' (หมอวิ่ง)' : ''}
                {' · '}<button type="button" className="mini-link" onClick={() => { setShowAddSvc(false); setAddSvcId(''); }}>ย่อกลับ</button>
              </p>
            </div>
          )}

          {promosActive.length > 0 && (
            <div className="field">
              <label>โปรโมชันส่วนลด</label>
              <select
                value={editPromoId}
                onChange={(e) => {
                  const p = promosActive.find((x) => x.id === e.target.value);
                  if (!p) { setEditPromoId(''); setEditDiscount(''); }
                  else selectEditPromo(p);
                  setEditErr('');
                }}
                className="input"
              >
                <option value="">— ไม่ใช้โปร —</option>
                {promosActive.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} −฿ {p.amount.toLocaleString()}</option>
                ))}
              </select>
            </div>
          )}

          
          <div className="field"><label>ช่องทางชำระ</label>
            <div className="pay-seg">
              {payMethods.map((m) => (
                <button key={m} type="button" className={editPay === m ? 'on' : ''} onClick={() => setEditPay(m)}>{m}</button>
              ))}
            </div>
          </div>

          <div className="modal-cta">
            <button onClick={saveEdit} className="btn btn-ghost" style={{ width: '100%' }}>บันทึก</button>
            <button onClick={saveEditAndCheckout} className="btn btn-primary" style={{ width: '100%' }}>เช็คบิล · ฿ {editTotal.toLocaleString()}</button>
          </div>
        </Modal>
      )}

      {checkoutTarget && (
        <Modal onClose={() => { setCheckoutTarget(null); setSlipName(''); setSlipErr(''); setSlipLocal((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; }); }}>
          <button className="modal-x" onClick={() => { setCheckoutTarget(null); setSlipName(''); setSlipErr(''); setSlipLocal((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; }); }} aria-label="ปิด"><X size={16} /></button>
          <div className="mcard-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>เช็คบิล</h3>
                <div className="muted">{fmtBkk(checkoutTarget.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {billRows(checkoutTarget).length} รายการ</div>
              </div>
            </div>
          </div>
          <ReceiptCard
            items={billRows(checkoutTarget)}
            services={data.services}
            therapists={data.therapists}
            subtotal={billRows(checkoutTarget).reduce((s, i) => s + (i.net ?? i.price ?? 0), 0)}
            disc={checkoutTarget.discount || 0}
            discLabel={checkoutTarget.promotion || ''}
            total={billTotal(checkoutTarget)}
            expandedKey={expandedKey}
            onToggle={setExpandedKey}
          />
          <div className="field"><label>ชำระโดย</label>
            <div className="pay-seg">
              {payMethods.map((m) => (
                <button key={m} type="button" className={checkoutPay === m ? 'on' : ''} onClick={() => setCheckoutPay(m)}>{m}</button>
              ))}
            </div>
          </div>
          {checkoutPay === 'QR Code / โอนเงิน' && (
            <div className="field"><label>สลิปโอนเงิน</label>
              {slipErr && <div className="err-banner">⚠ {slipErr}</div>}
              <label className="filebtn">
                {slipUploading ? <Loader2 size={19} className="spin" /> : <Upload size={19} />}
                <span>{slipUploading ? (slipProgress <= 1 ? 'กำลังเตรียมรูป…' : `กำลังอัปโหลด… ${slipProgress}%`) : slipName || slipLocal ? (slipPreview ? 'เปลี่ยนสลิป' : `แนบแล้ว: ${slipName}`) : 'แตะเพื่อถ่ายรูป / แนบสลิป'}</span>
                <input type="file" accept="image/*,application/pdf" hidden disabled={slipUploading} onChange={(e) => handleSlipFile(e.target.files[0])} />
              </label>
              {slipUploading && (
                <div className="bar-track" style={{ margin: '8px 0 0' }}><span className="bar-fill" style={{ width: `${Math.max(2, slipProgress)}%` }} /></div>
              )}
              {slipPreview && !slipIsPdf && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={slipPreview} alt="สลิป" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                  {slipName && (
                  <a href={slipPreview} target="_blank" rel="noopener noreferrer" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <ExternalLink size={13} /> เปิดดูสลิป
                  </a>
                  )}
                  {slipUploading && <span className="muted" style={{ fontSize: 12 }}>กำลังอัปโหลด… {slipProgress}%</span>}
                </div>
              )}
              {slipPreview && slipIsPdf && (
                <div style={{ marginTop: 8 }}>
                  {slipName ? (
                  <a href={slipPreview} target="_blank" rel="noopener noreferrer" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <ExternalLink size={13} /> เปิดดูสลิป (PDF)
                  </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>แนบ PDF แล้ว กำลังอัปโหลด… {slipProgress}%</span>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="modal-cta modal-cta-3">
            <button onClick={() => { startEdit(checkoutTarget); setCheckoutTarget(null); setSlipName(''); setSlipErr(''); setSlipLocal((prev) => { try { prev && URL.revokeObjectURL(prev); } catch { /* ignore */ } return null; }); }} className="btn btn-ghost" style={{ width: '100%' }}>แก้ไข</button>
            <button onClick={() => doCheckoutBill(checkoutTarget, checkoutPay)} disabled={slipUploading} className="btn btn-primary" style={{ width: '100%' }}>ยืนยันเช็คบิล</button>
          </div>
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
    </div>
  );
}
