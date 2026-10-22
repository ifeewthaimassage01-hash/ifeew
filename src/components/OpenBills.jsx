import { useState, useEffect, useMemo, useRef } from 'react';
import { ShieldAlert, TriangleAlert, Plus, Trash2, Upload, X, FileText, Clock, ExternalLink, Loader2, CheckCircle2, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardHead, EmptyState, StatusBadge, Modal, Lightbox, alertDialog, confirmDialog, formatDuration } from './ui';
import { bkkNow, bkkToday, bizDateOf, fmtBkk } from '../utils/bkk';
import { supabase } from '../lib/supabase';
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

/* ---------- เลือกวันที่ของการ์ด "บิลที่เปิดอยู่" (จากคำขอผู้ใช้ 22 ต.ค. 2026)
   ลอก UI จากหน้าเลือกช่วงเวลาของเว็บจอง 100%: ชิปแถมชั้น ชื่อวัน / วันที่ใหญ่ /
   เดือนย่อ · วันที่ร้านปิด (booking_settings: closed_weekdays + closed_dates)
   เป็นเส้นประ + ป้ายแดง "ปิด" กดไม่ได้ · เครื่องมือวันอ่านท้องถิ่น (กัน TZ เพี้ยน)
   ค่า advance_days กับวันปิดอ่านจาก app_settings key ที่เดียวกับเว็บจอง ---------- */
const TH_WD = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
const TH_MO = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** label เต็มของวัน (สำหรับข้อความ/aria) — "วันนี้" / "ศุกร์ 23 ต.ค." */
function dayChipLabel(d) {
  const [y, m, dd] = String(d || '').split('-').map(Number);
  if (!y || !m || !dd) return String(d || '—');
  if (d === bkkToday()) return 'วันนี้';
  const t = new Date(y, m - 1, dd);
  return `${TH_WD[t.getDay()]} ${dd} ${TH_MO[m - 1]}`;
}

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

/* แสดงค่าเวลา "HH:mm" แบบนาฬิกา — ค่าที่เกินเที่ยงคืน (≥24:00) วนเป็น 00:xx */
function clockStr(t) {
  const m = timeToMinutes(t);
  return m == null ? t : minutesToTime(((m % 1440) + 1440) % 1440);
}

/* ข้อความเวลาของรายการ: "12:15 – 14:15 · รวม 2 ชม" */
function itemTimeText(it) {
  const mins = it.totalMinutes || it.duration || 0;
  const startMin = timeToMinutes(it.startTime);
  const endRaw = it.endTime || (startMin != null && mins > 0 ? minutesToTime(startMin + mins) : '');
  const end = clockStr(endRaw);
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

/* บิลที่เปิดค้างไว้ (ยังไม่เช็คบิล) — แสดงในหน้า POS พร้อมปุ่มแก้ไข / เช็คบิล / ยกเลิก
   children = กลุ่ม "ลูกค้าจอง" (BookingBillsSection) — การจองจากเว็บ นับเป็นบิลที่เปิดอยู่
   เช่นเดียวกัน แค่มีป้ายแยกลูกค้าหน้าร้าน / ลูกค้าจอง (22 ต.ค. 2026) */
export default function OpenBillsSection({ data, saveData, role, children, bookingsHint, dayFilter, onDayFilter }) {
  // ปุ่มยกเลิกโชว์ทุก role — modal ยกเลิกบังคับใส่รหัสเจ้าของร้านอยู่แล้ว
  const canVoid = true;
  const allOpenBills = [...(data.bills || [])].filter((b) => b.status === 'open').reverse();
  // วันทำการของบิลหน้าร้าน = bizDateOf (ตัดหลังเที่ยงคืน 3 โมงแบบแอปเดิม) — เดอร์จองฝั่ง booking ส่ง slot_date มาเอง
  const billDayOf = (b) => bizDateOf(b.date || b.createdAt || '');
  // เลือกวันอยู่ (แถบเลือกวัน) → กรองบิลหน้าร้านเหลือวันนั้น
  const openBills = dayFilter ? allOpenBills.filter((b) => billDayOf(b) === dayFilter) : allOpenBills;

  /* การตั้งค่าการจอง (วันปิดร้าน + ล่วงหน้าได้กี่วัน) — อ่านจาก app_settings key
     "booking_settings" เดียวกับเว็บจอง (anon อ่านได้ตามที่ auth.js ใช้อยู่) */
  const [shopSettings, setShopSettings] = useState(null);
  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'booking_settings').maybeSingle();
        if (error) throw error;
        let v = data?.value ?? null;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
        if (alive) setShopSettings(v && typeof v === 'object' ? v : null);
      } catch { /* อ่านไม่ได้ → ไม่มีข้อมูลวันปิด (ทุกวันกดได้ตามปกติ) */ }
    })();
    return () => { alive = false; };
  }, []);

  const advanceDays = Math.max(0, Number(shopSettings?.advance_days ?? 6));
  const closedDates = Array.isArray(shopSettings?.closed_dates) ? shopSettings.closed_dates.map(String) : [];
  const closedWeekdays = Array.isArray(shopSettings?.closed_weekdays) ? shopSettings.closed_weekdays.map(Number) : [];

  /* แถบวัน = วันนี้ → วันนี้ + advanceDays (เหมือนเว็บจองเอง · ล่วงหน้าได้ตามตั้งค่า) */
  const dayList = useMemo(() => Array.from({ length: advanceDays + 1 }, (_, i) => {
    const date = bkkToday(i);
    const [y, m, dd] = date.split('-').map(Number);
    const t = new Date(y, m - 1, dd);
    return {
      date,
      dow: TH_WD[t.getDay()],
      num: dd,
      mon: TH_MO[m - 1],
      closed: closedDates.includes(date) || closedWeekdays.includes(t.getDay()),
    };
  }), [advanceDays, closedDates, closedWeekdays]);

  /* เลื่อนแถบให้วันที่เลือกอยู่กลางจอ (สำเนาทำงานตรงจาก PageSlot ของเว็บจอง) */
  const dateStripRef = useRef(null);
  const dateRefs = useRef({});
  const dateCenteredRef = useRef(false);
  useEffect(() => {
    const strip = dateStripRef.current;
    const el = dateRefs.current[dayFilter];
    if (!strip || !el) return;
    const stripRect = strip.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const delta = (elRect.left - stripRect.left) - (strip.clientWidth - elRect.width) / 2;
    strip.scrollBy({ left: delta, behavior: dateCenteredRef.current ? 'smooth' : 'auto' });
    dateCenteredRef.current = true;
  }, [dayFilter, dayList.length]);
  const scrollDays = (dir) => {
    const strip = dateStripRef.current;
    if (strip) strip.scrollBy({ left: dir * Math.max(160, Math.round(strip.clientWidth * 0.7)), behavior: 'smooth' });
  };

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
  // สลิปที่กำลังเปิดดูแบบเต็มจอ (lightbox) — null = ปิด
  const [viewSlip, setViewSlip] = useState(null);

  // รวมบิล: โหมดเลือกบิลเปิด ≥ 2 บิล (วันเดียวกัน) → พรีวิว → ยืนยันรวมเป็นบิลเดียว
  // บิลตัวถูกกลืน = status 'merged' + mergedInto (ไม่ลบทิ้งเพราะ cloud sync เป็น upsert-only
  // การเปลี่ยนสถานะ sync ผ่าน upsert เอง และ push-bill webhook ข้ามสถานะ merged ให้อยู่แล้ว)
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSel, setMergeSel] = useState([]); // id ของบิลที่เลือก
  const [mergeReview, setMergeReview] = useState(null); // { bill, absorbedIds, count } — พรีวิวก่อนยืนยัน

  // BUG-OB-02: มี modal แก้ไข/เช็คบิล/ยกเลิก/รวมบิลเปิดอยู่ → บอก App ให้หยุด realtime reload กลางการแก้
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ifeew-modal', { detail: { open: (editTarget || checkoutTarget || voidTarget || mergeReview) ? 1 : 0 } }));
  }, [editTarget, checkoutTarget, voidTarget, mergeReview]);

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
  // เดิมยังมี early return "ไม่มีบิลที่เปิดอยู่" — ถอดออกเพราะกลุ่มลูกค้าจอง (children)
  // ก็คือบิลที่เปิดอยู่ด้วย ต้องแสดงตลอดแม้ไม่มีบิลหน้าร้าน

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
    // BUG-OB-01: เพิ่ม/แก้รายการแล้วต้องคำนวณเวลาเริ่ม–จบระดับบิลใหม่ (min start – max end)
    // เพื่อให้ slot ว่างนับเวลาตรง — กันเวลาบิลค้างของเดิมหลังต่อรายการท้าย
    const rowStarts = normalized.map((c) => timeToMinutes(c.startTime)).filter((m) => m != null);
    const rowEnds = normalized.map((c) => timeToMinutes(c.endTime)).filter((m) => m != null);
    const billStartTime = rowStarts.length ? minutesToTime(Math.min(...rowStarts)) : editTarget.startTime;
    const billEndTime = rowEnds.length ? minutesToTime(Math.max(...rowEnds)) : editTarget.endTime;
    return {
      meta: { rows: normalized, subtotal, disc },
      bill: {
        ...editTarget,
        discount: disc,
        // BUG-OB-03: โปรที่ถูกปิดไปแล้ว — คงป้ายโปรเดิมไว้ ไม่ให้หายตอนเซฟ
        promotion: (promosActive.find((p) => p.id === editPromoId)?.name) ?? editTarget.promotion ?? '',
        paymentMethod: editPay,
        subtotal, total: subtotal - disc,
        startTime: billStartTime,
        endTime: billEndTime,
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

  /* ---------- รวมบิล ----------
     กติกา: รวมได้เฉพาะบิล "open" วันเดียวกัน (กันเพี้ยนสรุปคอม/ประกันมือรายวัน)
     - target = บิลที่เก่าสุดในกลุ่ม (เก็บ id/date เดิม บิลใหม่ตามลำดับเดิมในรายงาน)
     - items = เรียงต่อจากทุกบิล โดยแต่ละแถวคง therapistId/therapistName/เวลา/addons ของตัวเอง
       → คอม/ค่าแรงเดิมคิดต่อแถว (billing.js: it.therapistId || b.therapistId) จึงยังให้หมอถูกคน
     - ส่วนลดรวม = ผลรวมส่วนลดที่ใช้ได้จริงของแต่ละบิล (clamp ต่อบิลก่อน ไม่ให้ติดลบ)
     - startTime/endTime ระดับบิล = เริ่มสุด – จบสุดของทุกแถว (เทียบเท่า buildUpdatedBill)
     - bill.therapistId ระดับบิล: ถ้าหมอเดียวคงเดิม, หลายหมอ = ว่าง (ให้ POS บล็อกสล็อตเฉพาะตามแถวของหมอแต่ละคน) */
  const mergePlanOf = (sel) => {
    const sorted = [...sel].sort((a, z) =>
      String(a.date || '').localeCompare(String(z.date || '')) || String(a.id || '').localeCompare(String(z.id || '')));
    const target = sorted[sorted.length - 1]; // บิลล่าสุดเป็นตัวตั้ง
    const rows = sorted.flatMap((b) => billRows(b));
    const subtotal = rows.reduce((s, i) => s + rowNet(i), 0);
    const discount = sorted.reduce((s, b) => s + Math.max(0, Math.min(b.discount || 0, billRows(b).reduce((x, i) => x + rowNet(i), 0))), 0);
    const tids = [...new Set(rows.map((i) => i.therapistId).filter(Boolean))];
    const names = [...new Set(rows.map((i) => freelanceDisplayName(i.therapistName || i.therapistId || '')).filter(Boolean))];
    const starts = rows.map((i) => timeToMinutes(i.startTime)).filter((m) => m != null);
    const ends = rows.map((i) => timeToMinutes(i.endTime)).filter((m) => m != null);
    const promoNames = [...new Set(sorted.map((b) => b.promotion).filter(Boolean))];
    const customer = target.customer
      || sorted.map((b) => b.customer).find((c) => c && c !== 'ลูกค้าหน้าร้าน')
      || 'ลูกค้าหน้าร้าน';
    return {
      bill: {
        ...target,
        customer,
        items: rows,
        subtotal,
        discount,
        total: subtotal - discount,
        promotion: promoNames.join(' + '),
        startTime: starts.length ? minutesToTime(Math.min(...starts)) : target.startTime,
        endTime: ends.length ? minutesToTime(Math.max(...ends)) : target.endTime,
        therapistId: tids.length === 1 ? tids[0] : '',
        therapistName: names.length === 1 ? (target.therapistName || names[0]) : names.join(' + '),
      },
      absorbedIds: sorted.map((b) => b.id).filter((id) => id !== target.id),
      count: sorted.length,
      summaryRows: sorted.map((b) => ({ id: b.id, total: billTotal(b), rows: billRows(b).length })),
    };
  };

  const toggleMergeSel = (id) => {
    setMergeSel((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  };

  const openMergeReview = () => {
    const sel = openBills.filter((b) => mergeSel.includes(b.id));
    if (sel.length < 2) return;
    // บังคับวันเดียวกัน — รายวัน (สรุปคอม/ประกันมือ/สเตตเมนต์) นับตามวันของบิล ข้ามวันจะเลื่อนยอดข้ามวันเอง
    const day1 = String((sel[0].date || '').slice(0, 10));
    const sameDay = sel.every((b) => String((b.date || '').slice(0, 10)) === day1);
    if (!sameDay) {
      alertDialog({ title: 'รวมได้เฉพาะบิลวันเดียวกัน', message: 'บิลที่เลือกมีหลายวัน — กรุณาเลือกเฉพาะบิลของวันเดียวกัน' });
      return;
    }
    setMergeReview(mergePlanOf(sel));
  };

  const confirmMerge = () => {
    if (!mergeReview) return;
    const { bill, absorbedIds, count } = mergeReview;
    saveData({
      ...data,
      bills: data.bills.map((b) => {
        if (absorbedIds.includes(b.id)) return { ...b, status: 'merged', mergedInto: bill.id };
        if (b.id === bill.id) return bill;
        return b;
      }),
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: bkkNow(), user: role === 'staff' ? 'พนักงาน' : 'เจ้าของร้าน',
        action: 'รวมบิล', detail: `${count} บิล → บิลเดียว · ฿ ${bill.total.toLocaleString()} (${[bill.id, ...absorbedIds].join(' + ')})`,
        oldValue: 'open', newValue: 'open', approvedBy: '-',
      }],
    });
    setMergeReview(null);
    setMergeMode(false);
    setMergeSel([]);
    setExpandedKey(null);
    alertDialog({ title: `รวม ${count} บิลแล้ว`, message: `บิลรวม ฿ ${bill.total.toLocaleString()} — เช็คบิลได้จากการ์ด "บิลที่เปิดอยู่"` });
  };

  return (
    <div id="open-bills" style={{ scrollMarginTop: 16 }}>
      {/* การ์ดเปิดตลอด (เดิมเคยซ่อนเมื่อไม่มีบิล) — กลุ่ม "ลูกค้าจอง" (children)
          ก็นับเป็นบิลที่เปิดอยู่ด้วย จึงต้องแสดงแม้ไม่มีบิลหน้าร้าน */}
      <Card>
          <CardHead
            title="บิลที่เปิดอยู่"
            hint={mergeMode
              ? 'แตะการ์ดเพื่อเลือกบิลที่จะรวม'
              : [openBills.length > 0 && `ลูกค้าหน้าร้าน ${openBills.length}`, bookingsHint].filter(Boolean).join(' · ') || 'ไม่มีบิลที่เปิดอยู่'}
            right={openBills.length >= 2 ? (
              <button
                className={mergeMode ? 'btn btn-primary auto' : 'btn btn-ghost auto'}
                style={{ padding: '9px 15px', fontSize: 13 }}
                onClick={() => { setMergeMode(!mergeMode); setMergeSel([]); }}
              >
                {mergeMode ? 'ปิดโหมดรวม' : 'รวมบิล'}
              </button>
            ) : null}
          />
          {/* เลือกวันที่ — ลอก UI หน้าเลือกช่วงเวลาของเว็บจอง 100%
              เลือกแล้วกรองทั้งกลุ่มลูกค้าหน้าร้านและกลุ่มลูกค้าจองพร้อมกัน */}
          {onDayFilter && dayList.length > 0 && (
            <>
              <div className="bk-datehead">
                <div>
                  <div className="bk-datehead-t">
                    <CalendarDays size={15} strokeWidth={1.8} /> เลือกวันที่
                  </div>
                  <small className="bk-datehead-hint">เลือกได้ตั้งแต่วันนี้ถึงอีก {advanceDays} วัน (รวม {advanceDays + 1} วัน)</small>
                </div>
                <div className="bk-pick-date-nav">
                  <button type="button" className="bk-pick-date-btn" onClick={() => scrollDays(-1)} aria-label="เลื่อนวันที่ไปก่อนหน้า">
                    <ChevronLeft size={15} strokeWidth={2} />
                  </button>
                  <button type="button" className="bk-pick-date-btn" onClick={() => scrollDays(1)} aria-label="เลื่อนวันที่ไปข้างหน้า">
                    <ChevronRight size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
              <div className="bk-date-strip" ref={dateStripRef} role="group" aria-label="เลือกวันที่ที่ต้องการดูบิล">
                {dayList.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    ref={(el) => { dateRefs.current[d.date] = el; }}
                    className={`bk-date${dayFilter === d.date ? ' on' : ''}${d.closed ? ' closed' : ''}`}
                    onClick={() => onDayFilter(d.date)}
                    disabled={d.closed}
                    aria-pressed={dayFilter === d.date}
                    aria-label={`${d.dow} ${d.num} ${d.mon}${d.closed ? ' (ร้านปิด)' : ''}`}
                  >
                    <span className="d-dow">{d.dow}</span>
                    <span className="d-num">{d.num}</span>
                    <span className="d-mon">{d.mon}</span>
                    {d.closed ? <span className="d-off">ปิด</span> : null}
                  </button>
                ))}
              </div>
            </>
          )}
          {mergeMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              margin: '0 0 12px', padding: '10px 12px',
              background: 'var(--brown-tint)', borderRadius: 12, border: '1px solid var(--line)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0 }}>เลือกแล้ว {mergeSel.length} บิล</span>
              <button className="btn btn-ghost auto" style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0 }} onClick={() => setMergeSel([])} disabled={mergeSel.length === 0}>ล้าง</button>
              <button className="btn btn-primary auto" style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0, whiteSpace: 'nowrap' }} onClick={openMergeReview} disabled={mergeSel.length < 2}>
                รวม {mergeSel.length} บิล
              </button>
            </div>
          )}
          
          {bookingsHint != null && openBills.length > 0 && (
            <div className="bk-sep-label"><b>ลูกค้าหน้าร้าน</b><span className="muted num" style={{ fontSize: 12 }}>{openBills.length} บิล</span></div>
          )}

          {openBills.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="ไม่มีบิลหน้าร้านที่เปิดอยู่"
              subtitle={dayFilter
                ? `ในวันที่ ${dayChipLabel(dayFilter)} — ของวันอื่นยังอยู่ตามปกติ`
                : 'เปิดบิลใหม่จากหน้า POS'}
            />
          ) : openBills.map((b) => {
            const rows = billRows(b);
            const docName = therapistNameOf(b, rows);
            const docExtra = isFreelance(b.therapistId || rows[0]?.therapistId, data.therapists) ? ' (หมอวิ่ง)' : '';
            const msel = mergeMode && mergeSel.includes(b.id);
            return (
            <div
              key={b.id}
              className="ob-card"
              style={msel ? { outline: '2px solid var(--brown)', outlineOffset: '-2px' } : undefined}
              onClick={mergeMode ? () => toggleMergeSel(b.id) : undefined}
            >
              <div className="ob-head">
                {mergeMode ? (
                  <span
                    aria-label={msel ? `เลือกบิล ${docName} อยู่` : `แตะเพื่อเลือกบิล ${docName}`}
                    style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: '#fff',
                      border: msel ? 'none' : '1.5px dashed var(--line)',
                      background: msel ? 'var(--brown)' : 'transparent',
                    }}
                  >{msel ? '✓' : ''}</span>
                ) : (
                  <span className="ob-ava">{(docName || '?').charAt(0)}</span>
                )}
                <span className="ob-who">
                  <b>{docName}{docExtra}</b>
                  <span className="muted">{fmtBkk(b.date, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {rows.length} บริการ{b.startTime ? ` · เริ่ม ${b.startTime}` : ''}</span>
                </span>
                <StatusBadge status="open" />
              </div>
              <div className="ob-rows">
              {rows.map((it, i) => (
                <div key={i} className="ob-row">
                  <span className="ob-time muted">{(it.startTime || it.endTime) ? `${it.startTime || '?'}–${clockStr(it.endTime) || '?'}` : '—'}</span>
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
                {!mergeMode && (
                  <span className="ob-btns">
                    <button onClick={() => startEdit(b)} className="btn btn-ghost">แก้ไข</button>
                    <button onClick={() => startCheckoutBill(b)} className="btn btn-primary">เช็คบิล</button>
                    {canVoid && <button onClick={() => requestVoid(b)} className="btn-soft-danger">ยกเลิก</button>}
                  </span>
                )}
              </div>
            </div>
            );
          })}

          {/* กลุ่ม "ลูกค้าจอง" — การจองจากเว็บลูกค้า นับเป็นบิลที่เปิดอยู่เช่นกัน */}
          {children}
        </Card>

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
                  <button type="button" onClick={() => setViewSlip(slipPreview)} title="ดูสลิปใหญ่" aria-label="ดูสลิปใหญ่" style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                    <img src={slipPreview} alt="สลิป" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', display: 'block' }} />
                  </button>
                  {slipName && (
                  <button type="button" className="mini-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }} onClick={() => setViewSlip(slipPreview)}>
                    <ExternalLink size={13} /> เปิดดูสลิป
                  </button>
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

      {mergeReview && (
        <Modal onClose={() => setMergeReview(null)}>
          <button className="modal-x" onClick={() => setMergeReview(null)} aria-label="ปิด"><X size={16} /></button>
          <div className="mcard-top" style={{ paddingRight: 34 }}>
            <div>
              <h3 style={{ fontSize: 17 }}>รวมบิล · {mergeReview.count} บิล</h3>
              <div className="muted">{mergeReview.bill.customer || 'ลูกค้าหน้าร้าน'} · {mergeReview.bill.items.length} รายการรวมกัน</div>
            </div>
          </div>
          <ReceiptCard
            items={mergeReview.bill.items}
            services={data.services}
            therapists={data.therapists}
            subtotal={mergeReview.bill.subtotal}
            disc={mergeReview.bill.discount}
            discLabel={mergeReview.bill.promotion || ''}
            total={mergeReview.bill.total}
            expandedKey={expandedKey}
            onToggle={setExpandedKey}
          />
          <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>
            ค่าแรง/คอมยังนับให้หมอแต่ละคนตามรายการของตัวเอง · บิลที่ถูกรวมจะปิดเป็น "รวมเข้าบิลอื่นแล้ว" ไม่นับซ้ำในรายงาน
          </p>
          <div className="modal-row">
            <button onClick={() => setMergeReview(null)} className="btn btn-ghost">ยกเลิก</button>
            <button onClick={confirmMerge} className="btn btn-primary"><CheckCircle2 size={16} /> ยืนยันรวม {mergeReview.count} บิล · ฿ {mergeReview.bill.total.toLocaleString()}</button>
          </div>
        </Modal>
      )}

      {/* lightbox สลิปเต็มจอ — มาตรฐานเดียวกันทั้งแอป */}
      <Lightbox url={viewSlip} title="สลิปโอนเงิน" onClose={() => setViewSlip(null)} />
    </div>
  );
}
