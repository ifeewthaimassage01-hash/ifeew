import { useState } from 'react';
import { ShieldAlert, TriangleAlert, Plus, Trash2, Upload, X } from 'lucide-react';
import { Card, CardHead, StatusBadge, Modal, alertDialog, confirmDialog, formatDuration } from './ui';
import { commBaht } from '../data/demoData';

const billRows = (b) => b.items || b.customers || [];
const rowNet = (i) => i.net ?? i.price ?? 0;
const billTotal = (b) => Math.max(0, billRows(b).reduce((s, i) => s + rowNet(i), 0) - (b.discount || 0));
const payMethods = ['เงินสด', 'QR Code / โอนเงิน'];
const BREAK_MINUTES = 15;

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
function ReceiptCard({ items, services, subtotal, disc, discLabel, total, expandedKey, onToggle, onRemove }) {
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
        return (
          <div key={key} className="rcpt-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="rcpt-line1" onClick={() => onToggle && onToggle(open ? null : key)} aria-expanded={open}>
                <b>{it.serviceName || it.serviceId}</b>
                <span className="amt">฿ {(it.net ?? it.price ?? 0).toLocaleString()}</span>
              </button>
              {onRemove && (
                <button
                  onClick={async () => {
                    const ok = await confirmDialog({ title: 'ลบรายการนี้?', message: it.serviceName || it.serviceId, confirmLabel: 'ลบ', danger: true });
                    if (ok) onRemove(it);
                  }}
                  aria-label="ลบรายการ"
                  className="icon-btn danger"
                  style={{ width: 30, height: 30, flexShrink: 0 }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="rcpt-doc">
              <span className="rcpt-doc-name">{it.therapistName || it.therapistId || '—'}{String(it.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : ''} · <span className="rcpt-comm">ค่าแรง ฿ {commOf(it).toLocaleString()}</span></span>
              <span className="rcpt-doc-time">{itemTimeText(it)}</span>
            </div>
            {open && (it.addons || []).length > 0 && (
              <div className="rcpt-sub">
                +{(it.addons || []).map((a) => a.name).join(', ')}
              </div>
            )}
          </div>
        );
      })}
      {disc > 0 && (
        <div className="rcpt-item">
          <div className="rcpt-line1" style={{ cursor: 'default' }}>
            <b>{discLabel || 'ส่วนลด'}</b>
            <span className="amt">−฿ {disc.toLocaleString()}</span>
          </div>
        </div>
      )}
      <div className="rcpt-total">
        <span className="muted">สุทธิ</span>
        <span className="grand">฿ {total.toLocaleString()}</span>
      </div>
      <div className="rcpt-sub" style={{ textAlign: 'right', marginTop: 2 }}>ค่าแรงพนักงานรวม ฿ {commTotal.toLocaleString()}</div>
      {disc > 0 && (
        <div className="rcpt-sub" style={{ textAlign: 'right', marginTop: 2 }}>รวมย่อย ฿ {subtotal.toLocaleString()}</div>
      )}
    </div>
  );
}

/* บิลที่เปิดค้างไว้ (ยังไม่เช็คบิล) — แสดงในหน้า POS พร้อมปุ่มแก้ไข / เช็คบิล / ยกเลิก */
export default function OpenBillsSection({ data, saveData, role }) {
  const canVoid = role !== 'staff';
  const openBills = [...(data.bills || [])].filter((b) => b.status === 'open').reverse();

  const [editTarget, setEditTarget] = useState(null);
  const [editDiscount, setEditDiscount] = useState('');
  const [editPromoId, setEditPromoId] = useState('');
  const [editPay, setEditPay] = useState('เงินสด');
  const [expandedKey, setExpandedKey] = useState(null);
  const [showAddSvc, setShowAddSvc] = useState(false);
  const [showPromoPicker, setShowPromoPicker] = useState(false);
  const promosActive = (data.promotions || []).filter((p) => p.active !== false);
  const [editItems, setEditItems] = useState([]);
  const [addSvcId, setAddSvcId] = useState('');
  const [editErr, setEditErr] = useState('');
  const [checkoutTarget, setCheckoutTarget] = useState(null);
  const [checkoutPay, setCheckoutPay] = useState('เงินสด');
  const [slipName, setSlipName] = useState('');
  const [checkoutDone, setCheckoutDone] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [authPass, setAuthPass] = useState('');
  const [authReason, setAuthReason] = useState('');
  const [voidErr, setVoidErr] = useState('');

  if (openBills.length === 0 && !editTarget && !checkoutTarget && !voidTarget && !checkoutDone) return null;

  const startEdit = (b) => {
    setEditTarget(b);
    setEditDiscount(b.discount ? String(b.discount) : '');
    setEditPromoId(promosActive.find((p) => b.promotion && p.name === b.promotion)?.id || '');
    setEditPay(b.paymentMethod || 'เงินสด');
    setEditItems(billRows(b).map((it, i) => ({ ...it, _key: `${Date.now()}-${i}` })));
    setAddSvcId(''); setEditErr('');
    setExpandedKey(null); setShowAddSvc(false); setShowPromoPicker(false);
  };
  const selectEditPromo = (p) => {
    if (editPromoId === p.id) { setEditPromoId(''); setEditDiscount(''); }
    else { setEditPromoId(p.id); setEditDiscount(String(p.amount)); }
    setEditErr(''); setShowPromoPicker(false);
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
      _key: `${Date.now()}`, serviceId: svc.id, serviceName: label, category: svc.category,
      therapistId, therapistName, qty: 1, price: svc.price, discount: 0, net: svc.price,
      duration: mins, totalMinutes: mins,
      startTime: startMin != null ? minutesToTime(startMin) : '',
      endTime: startMin != null ? minutesToTime(startMin + mins) : '',
    }]);
    setAddSvcId(''); setEditErr('');
  };

  const buildUpdatedBill = () => {
    if (!editTarget) return null;
    const rows = editItems.map(({ _key, ...r }) => ({ ...r }));
    const subtotal = rows.reduce((s, i) => s + (i.net ?? i.price ?? 0), 0);
    const disc = Math.max(0, Math.min(subtotal, Number(editDiscount) || 0));
    return {
      meta: { rows, subtotal, disc },
      bill: {
        ...editTarget,
        discount: disc,
        promotion: promosActive.find((p) => p.id === editPromoId)?.name || '',
        paymentMethod: editPay,
        subtotal, total: subtotal - disc,
        customers: rows.map((c) => ({
          id: c.id || Date.now() + Math.random(), serviceId: c.serviceId, serviceName: c.serviceName,
          category: c.category, duration: c.duration, totalMinutes: c.totalMinutes || c.duration,
          startTime: c.startTime, endTime: c.endTime, therapistId: c.therapistId,
          therapistName: c.therapistName, price: c.net ?? c.price ?? 0, addons: c.addons || [],
        })),
        items: rows.map((c) => ({
          serviceId: c.serviceId, serviceName: c.serviceName, category: c.category,
          therapistId: c.therapistId, therapistName: c.therapistName,
          qty: c.qty || 1, price: c.net ?? c.price ?? 0, discount: 0, net: c.net ?? c.price ?? 0,
          duration: c.totalMinutes || c.duration, startTime: c.startTime,
        })),
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
        id: `A-${Date.now()}`, timestamp: new Date().toISOString(), user: role === 'staff' ? 'พนักงาน' : 'ผู้จัดการ',
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
        id: `A-${Date.now()}`, timestamp: new Date().toISOString(), user: role === 'staff' ? 'พนักงาน' : 'ผู้จัดการ',
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
    setExpandedKey(null);
  };

  const doCheckoutBill = (b, payMethod) => {
    saveData({
      ...data,
      bills: data.bills.map((x) => (x.id === b.id ? { ...x, status: 'paid', paymentMethod: payMethod, paidAt: new Date().toISOString(), slip: payMethod === 'QR Code / โอนเงิน' ? (slipName || '') : '' } : x)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: new Date().toISOString(), user: role === 'staff' ? 'พนักงาน' : 'ผู้จัดการ',
        action: 'เช็คบิล', detail: `${b.customer || 'ลูกค้าหน้าร้าน'} · ฿ ${billTotal(b).toLocaleString()} · ${payMethod}`,
        oldValue: 'open', newValue: 'paid', approvedBy: '-',
      }],
    });
    setCheckoutTarget(null); setSlipName('');
    setCheckoutDone({ total: billTotal(b), pay: payMethod });
    setTimeout(() => setCheckoutDone(null), 1500);
  };

  const confirmVoid = () => {
    if (authPass !== '123123') { setVoidErr('รหัสไม่ถูกต้อง (ตัวอย่าง: 123123)'); return; }
    if (!authReason.trim()) { setVoidErr('กรุณาระบุเหตุผลการยกเลิกสั้น ๆ'); return; }
    saveData({
      ...data,
      bills: data.bills.map((b) => (b.id === voidTarget.id ? { ...b, status: 'cancelled' } : b)),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: new Date().toISOString(), user: 'ผู้จัดการ',
        action: 'ยกเลิกบิล', detail: `${voidTarget.customer || 'ลูกค้าหน้าร้าน'} — ${authReason}`,
        oldValue: voidTarget.status || 'open', newValue: 'cancelled', approvedBy: 'ผู้จัดการ',
      }],
    });
    setVoidTarget(null); setAuthPass(''); setAuthReason(''); setVoidErr('');
    alertDialog({ title: 'ยกเลิกบิลแล้ว', message: 'สถานะเปลี่ยนเป็นยกเลิกแล้ว' });
  };

  return (
    <div id="open-bills" style={{ scrollMarginTop: 16 }}>
      {openBills.length > 0 && (
        <Card>
          <CardHead title="บิลที่เปิดอยู่" hint={`${openBills.length} บิล · รอเช็คบิล`} />
          <div className="alert warn" style={{ marginTop: 0, marginBottom: 10 }}>
            ยอดค้างรวม ฿ {openBills.reduce((s, b) => s + billTotal(b), 0).toLocaleString()} — กด “เช็คบิล” หลังนวดเสร็จ หรือ “แก้ไข” เพื่อเพิ่มบริการระหว่างนวด
          </div>
          {openBills.map((b) => {
            const rows = billRows(b);
            const docName = b.therapistName || rows[0]?.therapistName || rows[0]?.therapistId || '—';
            const docExtra = String(b.therapistId || rows[0]?.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : '';
            return (
            <div key={b.id} className="mcard" style={{ marginBottom: 8 }}>
              <div className="mcard-top">
                <div>
                  <b style={{ fontSize: 14 }}>{docName}{docExtra}</b>
                  <div className="muted">{new Date(b.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {rows.length} บริการ{b.startTime ? ` · เริ่ม ${b.startTime}` : ''}</div>
                </div>
                <StatusBadge status="open" />
              </div>
              {rows.map((it, i) => (
                <div key={i} className="mcard-bot" style={{ padding: '6px 0', borderTop: i === 0 ? 0 : '1px dashed var(--line)' }}>
                  <span className="muted" style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13, color: 'var(--ink)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.serviceName || it.serviceId}</b>
                    {(it.startTime || it.endTime) ? `${it.startTime || '?'}–${it.endTime || '?'}` : ''}
                  </span>
                  <b style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>฿ {(it.net ?? it.price ?? 0).toLocaleString()}</b>
                </div>
              ))}
              {b.promotion ? <div className="muted" style={{ marginTop: 2 }}>โปร: {b.promotion}</div> : null}
              <div className="mcard-bot" style={{ marginTop: 6 }}>
                <span className="big-price">฿ {billTotal(b).toLocaleString()}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEdit(b)} className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 12.5 }}>แก้ไข</button>
                  <button onClick={() => startCheckoutBill(b)} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 12.5 }}>เช็คบิล</button>
                  {canVoid && <button onClick={() => { setVoidTarget(b); setAuthPass(''); setAuthReason(''); setVoidErr(''); }} className="btn-soft-danger">ยกเลิก</button>}
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
                <div className="muted">{new Date(editTarget.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {editItems.length} รายการ</div>  
              </div>
            </div>
            <StatusBadge status="open" />
          </div>
          {editErr && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {editErr}</div>}

          <ReceiptCard
            items={editItems}
            services={data.services}
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
              <label>เพิ่มบริการ (ใช้หมอเดิมจากตอนเปิดบิล)</label>
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
                หมอ: <b>{editItems[0]?.therapistName || editItems[0]?.therapistId || '—'}</b>
                {String(editItems[0]?.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : ''}
                {' · '}<button type="button" className="mini-link" onClick={() => { setShowAddSvc(false); setAddSvcId(''); }}>ย่อกลับ</button>
              </p>
            </div>
          )}

          {promosActive.length > 0 && (!showPromoPicker ? (
            <button type="button" className="dash-add" onClick={() => { setShowPromoPicker(true); setEditErr(''); }}><Plus size={15} /> ใส่โปรโมชัน{editPromoId ? ` (${promosActive.find((p) => p.id === editPromoId)?.name})` : ''}</button>
          ) : (
            <div className="field">
              <label>โปรโมชันส่วนลด</label>
              <div className="preset-row" style={{ marginTop: 0 }}>
                {promosActive.map((p) => (
                  <button key={p.id} type="button" className="preset-btn" style={editPromoId === p.id ? { background: 'var(--brown-950)', color: '#fff', borderColor: 'var(--brown-950)' } : null} onClick={() => selectEditPromo(p)}>{p.name} −฿ {p.amount.toLocaleString()}</button>
                ))}
                {editPromoId && <button type="button" className="preset-btn" onClick={() => { setEditPromoId(''); setEditDiscount(''); }}>ไม่ใช้โปร</button>}
              </div>
            </div>
          ))}

          
          <div className="modal-cta">
            <button onClick={saveEdit} className="btn btn-ghost" style={{ width: '100%' }}>บันทึก</button>
            <button onClick={saveEditAndCheckout} className="btn btn-primary" style={{ width: '100%' }}>เช็คบิล · ฿ {editTotal.toLocaleString()}</button>
          </div>
        </Modal>
      )}

      {checkoutTarget && (
        <Modal onClose={() => { setCheckoutTarget(null); setSlipName(''); }}>
          <button className="modal-x" onClick={() => { setCheckoutTarget(null); setSlipName(''); }} aria-label="ปิด"><X size={16} /></button>
          <div className="mcard-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 17 }}>เช็คบิล</h3>
                <div className="muted">{new Date(checkoutTarget.date).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {billRows(checkoutTarget).length} รายการ</div>
              </div>
            </div>
          </div>
          <ReceiptCard
            items={billRows(checkoutTarget)}
            services={data.services}
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
              <label className="filebtn"><Upload size={16} /><span>{slipName ? `แนบแล้ว: ${slipName}` : 'แตะเพื่อถ่ายรูป / แนบสลิป'}</span>
                <input type="file" accept="image/*" hidden onChange={(e) => setSlipName(e.target.files[0]?.name || '')} />
              </label>
            </div>
          )}
          <div className="modal-cta modal-cta-3">
            <button onClick={() => { startEdit(checkoutTarget); setCheckoutTarget(null); setSlipName(''); }} className="btn btn-ghost" style={{ width: '100%' }}>แก้ไข</button>
            <button onClick={() => doCheckoutBill(checkoutTarget, checkoutPay)} className="btn btn-primary" style={{ width: '100%' }}>ยืนยันเช็คบิล</button>
          </div>
        </Modal>
      )}

      {checkoutDone && (
        <div className="done-ov" onClick={() => setCheckoutDone(null)}>
          <div className="done-card">
            <svg className="check-anim" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="24" />
              <path d="M15 27l7 7 15-16" />
            </svg>
            <h3>เช็คบิลแล้ว</h3>
            <div className="done-total">฿ {Math.round(checkoutDone.total).toLocaleString()}</div>
            <div className="muted">{checkoutDone.pay}</div>
          </div>
        </div>
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
