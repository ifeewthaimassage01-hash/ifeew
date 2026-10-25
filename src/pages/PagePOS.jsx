import { useState, useMemo, useEffect, useRef, useId, useCallback } from 'react';
import {
  ReceiptText, Plus, Search, TriangleAlert, Trash2, ChevronDown, ChevronRight, Check, Fuel,
  Hand, Footprints, Droplet, Flower2, Sparkles, Leaf, Package, ScanFace, HeartHandshake,
  Store, CalendarDays,
} from 'lucide-react';
import { Card, CardHead, EmptyState, formatDuration, alertDialog, confirmDialog } from '../components/ui';
import { chainTimes, serviceCategoryOrder, billBizDay } from '../lib/billing';
import { generateBillId } from '../lib/ids';
import { bkkNow, bkkMinutes, bizToday, bkkToday } from '../utils/bkk';
import { bookingAdminApi } from '../lib/bookingAdminApi';
import { getOwnerPass } from '../lib/auth';
import { onBookingsChanged } from '../lib/bookingRealtime';
import { slotMinutesBkk, therapistKey, dayChipLabel } from '../booking/bookingUtils';

const BREAK_MINUTES = 15;

function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/* แสดงเวลานาฬิกา 00:00–23:59 — ค่าที่เกินเที่ยงคืน (≥24:00) วนกลับให้อ่านง่าย
   (เก็บค่าดิบเกิน 24:00 ไว้คำนวณ/เทียบช่วงเวลาให้เรียงถูก) */
function clockTime(m) {
  if (m == null) return '—';
  return minutesToTime(((m % 1440) + 1440) % 1440);
}

function timeToMinutes(t) {
  if (!t || !String(t).includes(':')) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/* เวลาปัจจุบันไทย (นาที) ปัดขึ้นเป็น 15 นาที — ตรงกับ grid เลือกเวลา */
function nowMinutes() {
  const m = bkkMinutes();
  return Math.ceil(m / 15) * 15;
}

function snap15(m) {
  return Math.round(m / 15) * 15;
}

const OPEN_MIN = 12 * 60;
// รับคิวสุดท้าย 22:30 — เริ่มได้ถึงเวลานี้ทุกความยาวบริการ (อาจจบหลัง 23:00 ได้)
const LAST_START_MIN = 22 * 60 + 30;
const GRID_STEP = 15;

/* ป้ายสถานะของแต่ละช่องเวลา — ว่าง = ไม่มีป้าย */
const SLOT_TAG = { free: '', clash: 'ชนคิว', oob: 'เกินเวลา' };

/* ไอคอนวงกลมของแต่ละหมวด (POS ขั้น 1) — หากตรงคีย์เวิร์ดชื่อหมวดกว่า 1 รายการ ตัวที่เจอก่อน wins
   หมวดที่ไม่ตรงรายการเลย = ใช้ไอคอนกลาง ๆ (HeartHandshake) */
const CATEGORY_ICON_RULES = [
  [/น้ำมัน/, Droplet],
  [/อโรมา|สปา/, Flower2],
  [/ไทย/, Hand],
  [/เท้า/, Footprints],
  [/หน้า/, ScanFace],
  [/สมุนไพร/, Leaf],
  [/ขัด/, Sparkles],
  [/แพ็กเกจ|คอร์ส/, Package],
];
function categoryIcon(cat) {
  const name = String(cat || '');
  for (const [re, Icon] of CATEGORY_ICON_RULES) if (re.test(name)) return Icon;
  return HeartHandshake;
}

/* Dropdown เลือกเวลาเริ่มตัวเดียว — เมนูเป็นช่วงละ 15 นาที พร้อมจุดสีบอกสถานะ
   ว่าง (เขียว) · ชนคิว (แดง) · เกินเวลาร้าน (จาง)
   รองรับคีย์บอร์ด: ↓/↑ เปิดเมนู, Esc ปิด, ลูกศรเลื่อน + Enter เลือก */
function TimeSlotPicker({ value, slots, onChange, label = 'เวลาเริ่ม', sub = 'เวลาเริ่ม' }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // เปิดเมนูทีไร ไฮไลต์ค่าปัจจุบัน + ย้ายโฟกัสเข้าเมนูเพื่อกดลูกศรต่อได้เลย
  useEffect(() => {
    if (open) {
      setHi(Math.max(0, slots.findIndex((o) => o.v === value)));
      menuRef.current?.focus();
    }
  }, [open, slots, value]);

  const pick = (v) => {
    onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  };

  const move = (d) => {
    const n = Math.min(slots.length - 1, Math.max(0, hi + d));
    setHi(n);
    itemRefs.current[n]?.scrollIntoView({ block: 'nearest' });
  };

  const onMenuKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0); itemRefs.current[0]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'End') { e.preventDefault(); const n = slots.length - 1; setHi(n); itemRefs.current[n]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (slots[hi]) pick(slots[hi].v); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={`dropdown timepick-dd${open ? ' open' : ''}`} ref={ref}>
      <button
        ref={btnRef}
        className="dropdown-btn timepick-btn"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); setOpen(true); } }}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <span className="timepick-val">{value != null ? minutesToTime(value) : '--:--'}</span>
        <span className="timepick-sub">{sub}</span>
        <ChevronDown size={16} strokeWidth={1.9} className="dd-caret" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="dropdown-menu ts-menu"
          role="listbox"
          aria-label={label}
          aria-activedescendant={slots[hi] ? `${menuId}-opt-${hi}` : undefined}
          tabIndex={-1}
          onKeyDown={onMenuKey}
        >
          {slots.map((o, i) => (
            <button
              key={o.v}
              id={`${menuId}-opt-${i}`}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="option"
              aria-selected={value === o.v}
              className={`dropdown-item ts-item${value === o.v ? ' on' : ''}${hi === i ? ' hi' : ''}`}
              onClick={() => pick(o.v)}
              onMouseEnter={() => setHi(i)}
              onFocus={() => setHi(i)}
            >
              <span className={`ts-dot ${o.s}`} aria-hidden="true" />
              <span className="ts-time">{o.l}</span>
              <span className="ts-tail">
                {SLOT_TAG[o.s] ? <span className={`ts-tag ${o.s}`}>{SLOT_TAG[o.s]}</span> : null}
                {value === o.v && <Check size={14} strokeWidth={1.9} className="dd-check" aria-hidden="true" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PagePOS({ data, saveData, onNavigate, role }) {
  const therapistsList = (data.therapists || []).filter((t) => t.active !== false);
  const services = data.services || [];

  // Step: 1=รายการ, 2=ระยะเวลา, 3=หมอ, 4=เวลา, 5=ตรวจสอบ
  const [step, setStep] = useState(1);

  // ประเภทลูกค้า: null = ยังไม่เลือก (หน้าเลือกประเภท), 'walkin' = ลูกค้าหน้าร้าน, 'booking' = ลูกค้าจอง
  // flow จองเลื่อนเลขขั้น 1 ขั้น: 1=ชื่อลูกค้า 2=รายการ 3=ระยะเวลา 4=เวลา(เลือกวันได้) 5=ตรวจสอบ — ไม่มีขั้นหมอ
  const [customerType, setCustomerType] = useState(null);
  // บิลจอง: วันที่ให้บริการ (จองล่วงหน้าได้ถึง 7 วัน) + ชื่อลูกค้า + ผู้รับจอง
  const [bizDate, setBizDate] = useState(bkkToday());
  const [customerName, setCustomerName] = useState('');
  const [bookerName, setBookerName] = useState('');
  // ผู้รับจอง: แตะเลือกหมอที่เช็กชื่อ = รหัสหมอ · พิมพ์ชื่ออิสระ = '' (เจ้าของร้าน/พนักงาน ไม่ต้องเป็นหมอทะเบียน)
  const [bookerId, setBookerId] = useState('');

  // Step 1-2: บริการที่หยิบไว้ (หลายบริการได้ หมอคนเดียวทั้งบิล)
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [pickedServices, setPickedServices] = useState([]);
  // โหมดวน: กด "+ เพิ่มรายการ" จากขั้น 4 → วน 1→2 แล้วข้ามขั้น 3 (ใช้หมอเดิม)
  const [looping, setLooping] = useState(false);

  // Step 3: หมอคนเดียวทั้งบิล
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  // Step 4: เวลาเริ่มเดียวทั้งบิล (รายการถัดไปต่อคิวอัตโนมัติ)
  const [selectedStartTime, setSelectedStartTime] = useState(null);
  const [therapistType, setTherapistType] = useState('resident'); // resident | visiting
  // หมอวิ่ง = พิมพ์ชื่อใช้เลย ไม่ต้องเพิ่มเข้าทะเบียน
  const [visitingName, setVisitingName] = useState('');
  // ค่าน้ำมันหมอวิ่ง ฿30/รอบ (รายจ่ายร้าน ไม่ได้บวกในบิลลูกค้า) — default ติ๊กไว้
  const [fuelChecked, setFuelChecked] = useState(true);
  const activeTherapistId = therapistType === 'visiting'
    ? (visitingName.trim() ? `EXT-VIS-${visitingName.trim()}` : null)
    : selectedTherapist;
  const activeTherapistName = therapistType === 'visiting'
    ? visitingName.trim()
    : (therapistsList.find((t) => t.id === selectedTherapist)?.name || '');

  const switchTherapistType = (t) => {
    setTherapistType(t);
    setSelectedTherapist(null);
    setErr('');
  };

  /* ── บิลจอง (ลูกค้าโทรมาจอง) ──
     ผู้รับจองแนะนำ = หมอที่เช็กชื่อวันนี้ (attendance[bizToday][therapistId] = { at, by }) */
  const todayAtt = (data.attendance || {})[bizToday()] || {};
  const bookerChips = therapistsList.filter((t) => Boolean(todayAtt[t.id]));
  const pickBooker = (t) => { setBookerId(t.id); setBookerName(t.name); setErr(''); };
  const setFreeBooker = (v) => {
    setBookerName(v);
    // พิมพ์ต่างจาก chip ที่เลือกไว้ → ยกเลิกรหัสหมอ (bookerId ใช้กับ chip เท่านั้น)
    if (bookerId) {
      const chipName = bookerChips.find((x) => x.id === bookerId)?.name || '';
      if (v !== chipName) setBookerId('');
    }
    setErr('');
  };

  // ขั้น 0: เลือกประเภทลูกค้า → ขั้น 1 ของ flow นั้น (walk-in ขั้น 1 = รายการ · จองขั้น 1 = ชื่อลูกค้า)
  const startFlow = (t) => {
    setCustomerType(t);
    setStep(1);
    setErr('');
  };

  // กลับไปหน้าเลือกประเภทลูกค้า — ถ้ามีข้อมูลกรอก/หยิบไว้แล้ว ให้ยืนยันก่อนล้าง (กันแตะพลาด)
  const backToTypePick = async () => {
    const dirty = customerName.trim() || bookerName.trim() || pickedServices.length > 0;
    if (dirty) {
      const ok = await confirmDialog({ title: 'เปลี่ยนประเภทลูกค้า?', message: 'ข้อมูลที่กรอก/หยิบไว้จะถูกล้าง', confirmLabel: 'ล้างและเปลี่ยน' });
      if (!ok) return;
      resetAll();
    }
    setCustomerType(null);
    setStep(1);
    setErr('');
  };

  // Step 5 — วิธีชำระค่าเริ่มต้นของบิลใหม่ (เปลี่ยนตอนเช็คบิลได้ที่หน้าบิล)
  const paymentMethod = 'เงินสด';
  const [discount, setDiscount] = useState('');
  const [promoId, setPromoId] = useState('');
  const promosActive = (data.promotions || []).filter((p) => p.active !== false);
  const promoName = promosActive.find((p) => p.id === promoId)?.name || '';
  const selectPromo = (p) => {
    if (promoId === p.id) { setPromoId(''); setDiscount(''); }
    else { setPromoId(p.id); setDiscount(String(p.amount)); }
    setErr('');
  };

  const [err, setErr] = useState('');
  // M7: กันกดเปิดบิลซ้ำ (ดับเบิลแตะสร้างบิลคู่)
  const [creating, setCreating] = useState(false);

  // ── กันเวลาทับ: เดอร์จองจากเว็บ (ยืนยันแล้ว) ของ "วันนี้" ──
  // ดึงด้วยรหัสเจ้าของร้าน (edge function booking-admin) — พนักงานไม่มีรหัสนี้จึงข้าม
  // (ระบบกันทับของบิลหน้าร้านต่อกันเองยังทำงานตามเดิมเสมอ)
  const authKey = getOwnerPass(data?.ownerPass);
  const canCheckWebBookings = role === 'owner' && Boolean(authKey);
  const [webBookings, setWebBookings] = useState([]);

  const fetchWebBookings = useCallback(async () => {
    if (!canCheckWebBookings) return;
    try {
      const res = await bookingAdminApi.list(authKey, { date: bizToday(), status: '', limit: 200 });
      setWebBookings(Array.isArray(res?.bookings) ? res.bookings : []);
    } catch (e) {
      // ดึงไม่ได้ (เช่น network) → ไม่มีข้อมูลกันทับฝั่งเดอร์จอง แต่เปิดบิลได้ตามปกติ
      console.error('[pos] ดึงเดอร์จองเพื่อกันเวลาทับไม่สำเร็จ', e);
      setWebBookings([]);
    }
  }, [canCheckWebBookings, authKey]);

  useEffect(() => {
    if (!canCheckWebBookings) return undefined;
    fetchWebBookings();
    const t = setInterval(fetchWebBookings, 60000);
    return () => clearInterval(t);
  }, [canCheckWebBookings, fetchWebBookings]);

  /* เรียลไทม์: เดอร์จองเปลี่ยนฝั่ง server (ชำระเงิน/ยืนยัน/ยกเลิก) → ดึงใหม่ทันที
     เพื่อให้ช่องเวลา "ชนคิว" ของหมอคนเดียวกันหลังบ้านตรงขึ้นเกือบสด ๆ (ไม่ต้องรอ 60 วิ) */
  useEffect(() => onBookingsChanged(() => {
    if (canCheckWebBookings) fetchWebBookings();
  }), [canCheckWebBookings, fetchWebBookings]);
  // BUG-POS-04: ref กันดับเบิลแตะแบบ synchronous (state creating อัปเดตช้าเกินไป)
  const creatingRef = useRef(false);
  const wizardGuardRef = useRef(false);

  // บอก App ว่ากำลังเลือกหมอ/เวลา/ตรวจสอบบิล — realtime จะได้ไม่โหลดทับกลางคัน
  // walk-in: ขั้นหมอ→ตรวจสอบ · จอง: ขั้น 1-3 เป็นแบบฟอร์ม (รีโหลดได้เหมือนเดิม) กันตั้งแต่ขั้นเวลา
  useEffect(() => {
    const isWizardActive = customerType === 'booking'
      ? step >= 4 && step <= 5
      : step >= 3 && step <= 5;
    const prev = wizardGuardRef.current;
    wizardGuardRef.current = isWizardActive;
    if (prev !== isWizardActive) {
      window.dispatchEvent(new CustomEvent('ifeew-modal', { detail: { open: isWizardActive ? 1 : 0 } }));
    }
  }, [step, customerType]);

  // BUG-POS-03: ออกจากหน้าระหว่างอยู่ wizard → ปลด guard ให้ realtime กลับมาทำงาน
  useEffect(() => () => {
    if (wizardGuardRef.current) {
      window.dispatchEvent(new CustomEvent('ifeew-modal', { detail: { open: 0 } }));
    }
  }, []);

  // รายการที่จองได้ = มีบริการแบบมีระยะเวลา — เรียงตามลำดับที่จัดในจัดการร้าน (serviceCategoryOrder)
  const bookableCats = useMemo(() => {
    const base = (data.serviceCategories?.length || data.serviceCategoryOrder?.length)
      ? serviceCategoryOrder(data)
      : [...new Set(services.map((s) => s.category))];
    return base.filter((c) => services.some((s) => s.category === c && s.duration != null));
  }, [services, data.serviceCategories, data.serviceCategoryOrder]);

  const visibleCats = bookableCats;

  // ระยะเวลาที่มีจริงในรายการนั้น + ราคาตรงจาก data (ไม่คำนวณเอง)
  const durationsForCat = (cat) => {
    const rows = services.filter((s) => s.category === cat && s.duration != null);
    const map = new Map();
    rows.forEach((s) => { if (!map.has(s.duration)) map.set(s.duration, s); });
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([dur, svc]) => ({ duration: dur, price: svc.price, svc }));
  };
  const availableDurations = selectedCategory ? durationsForCat(selectedCategory) : [];
  const priceFor = (dur) => availableDurations.find((d) => d.duration === dur)?.price || 0;
  const svcFor = (dur) => availableDurations.find((d) => d.duration === dur)?.svc || null;

  // บริการเสริม (หลายอย่างได้) — บวกเงิน + บวกเวลา (ประกาศก่อน memo ที่ใช้)
  const [selectedAddons, setSelectedAddons] = useState([]);
  const addonsActive = (data.addons || []).filter((a) => a.active !== false);
  const toggleAddon = (id) => {
    setSelectedAddons((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setErr('');
  };
  // นาทีรวมทั้งบิล + รายการที่ผูกเวลาเริ่ม–จบต่อกัน (พักห้องคั่น)
  const billMinutes = pickedServices.reduce((s, p) => s + (p.minutes || 0), 0);
  const chained = useMemo(() => {
    if (pickedServices.length === 0 || selectedStartTime == null) return [];
    const times = chainTimes(selectedStartTime, pickedServices.map((p) => p.minutes || 0), BREAK_MINUTES);
    return pickedServices.map((p, i) => ({ ...p, start: times[i].start, end: times[i].end }));
  }, [pickedServices, selectedStartTime]);
  const billEnd = chained.length ? chained[chained.length - 1].end : null;
  // BUG-POS-02: ช่วงเวลาจริงของบิลตามเวลาเริ่มที่เลือก — ใช้เช็กช่องว่างให้ตรงกับ timeError
  // (fallback เป็น billMinutes เมื่อยังไม่มีเวลาเริ่ม/ยังต่อคิวไม่ได้)
  const billSpan = (billEnd != null && selectedStartTime != null) ? billEnd - selectedStartTime : billMinutes;

  // ช่วงเวลาที่ถูก "เดอร์จองจากเว็บ" (ยืนยันแล้ว) ครอบ แยกตามหมอ — จับคู่หมอด้วยชื่อ
  // (เดอร์จองเก็บ therapist_name ส่วนบิลหน้าร้านเก็บ therapistId)
  const webSlotByTherapistId = useMemo(() => {
    const map = new Map(); // therapistId → [{ start, end }]
    const idByKey = new Map((data.therapists || []).map((t) => [therapistKey(t.name), t.id]));
    webBookings.forEach((b) => {
      if (b?.status !== 'confirmed') return; // กันเฉพาะเดอร์ที่ยืนยันแล้ว (รอยืนยัน/กำลังยกเลิกไม่ล็อกคิวร้าน)
      const tid = idByKey.get(therapistKey(b.therapist_name));
      if (!tid) return;
      const span = slotMinutesBkk(b);
      if (!span) return;
      const arr = map.get(tid) || [];
      arr.push({ start: span.start, end: span.end + BREAK_MINUTES }); // เผื่อพักห้องเหมือนคิวบิล
      map.set(tid, arr);
    });
    return map;
  }, [webBookings, data.therapists]);

  const bookedSlots = useMemo(() => {
    if (!activeTherapistId) return [];
    const slots = [];
    const todayBiz = bizToday(); // FIX BUG-07: คิวชนได้เฉพาะบิลวันธุรกิจวันนี้เท่านั้น (กันบิลค้างวันก่อนหลอกช่องวันนี้)
    (data.bills || []).forEach((b) => {
      // ตรวจเฉพาะบิลที่ยังเปิดอยู่ (status = open) — ไม่นับบิลที่เช็คแล้ว (paid) หรือยกเลิก (cancelled)
      if (b.status !== 'open') return;
      if (billBizDay(b) !== todayBiz) return; // ← บิลวันธุรกิจอื่น (รวมบิลจองอนาคต) ไม่มาชน slot วันนี้
      // โมเดลใหม่: หมอระดับบิล ก้อนเดียวทั้งบิล
      if (b.therapistId && b.startTime) {
        if (b.therapistId === activeTherapistId) {
          const start = timeToMinutes(b.startTime);
          const end = b.endTime ? timeToMinutes(b.endTime) : start + 60;
          if (start != null && end != null) slots.push({ start, end: end + BREAK_MINUTES });
        }
        return;
      }
      // โมเดลเก่า: ทีละแถว
      const rows = b.customers || b.items || [];
      rows.forEach((it) => {
        if (it.therapistId === activeTherapistId && it.startTime) {
          const start = timeToMinutes(it.startTime);
          const end = start + (it.totalMinutes || it.duration || 60) + BREAK_MINUTES;
          slots.push({ start, end });
        }
      });
    });
    // เดอร์จองจากเว็บ (ยืนยันแล้ว) ของหมอคนเดียวกัน — ถือเป็นคิวที่ชนได้เหมือนบิลหน้าร้าน
    (webSlotByTherapistId.get(activeTherapistId) || []).forEach((s) => slots.push(s));
    return slots;
  }, [data.bills, activeTherapistId, webSlotByTherapistId]);

  // บิลจอง: กันคิว "รวมทุกหมอ" ของวันที่ให้บริการที่เลือก (bookedDate) — เพราะยังไม่รู้ว่าหมอคนใดจะให้บริการ
  const bookedAllDay = useMemo(() => {
    if (customerType !== 'booking') return [];
    const slots = [];
    (data.bills || []).forEach((b) => {
      // ตรวจเฉพาะบิลที่ยังเปิดอยู่ — นับเฉพาะบิลของ "วันให้บริการ" ที่เลือก (บิลจองใช้ bookedDate)
      if (b.status !== 'open') return;
      if (billBizDay(b) !== bizDate) return;
      // โมเดลใหม่: เวลาเริ่ม/จบระดับบิล
      if (b.startTime) {
        const start = timeToMinutes(b.startTime);
        if (start != null) {
          const end = b.endTime ? timeToMinutes(b.endTime) : start + 60;
          if (end != null) slots.push({ start, end: end + BREAK_MINUTES });
          return;
        }
      }
      // โมเดลเก่า: ทีละแถว
      const rows = b.customers || b.items || [];
      rows.forEach((it) => {
        const start = timeToMinutes(it.startTime);
        if (start != null) slots.push({ start, end: start + (it.totalMinutes || it.duration || 60) + BREAK_MINUTES });
      });
    });
    // เดอร์จองเว็บ (ยืนยันแล้ว) — ดึงเป็น "วันนี้" เท่านั้น จึงรวมเมื่อจองหน้าร้านของวันนี้
    if (bizDate === bizToday()) {
      webBookings.forEach((b) => {
        if (b?.status !== 'confirmed') return;
        const span = slotMinutesBkk(b);
        if (!span) return;
        slots.push({ start: span.start, end: span.end + BREAK_MINUTES });
      });
    }
    return slots;
  }, [customerType, data.bills, bizDate, webBookings]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  // สถานะของ 1 ช่องเวลา: ว่าง / ชนคิว / นอกช่วงรับคิว (เกิน 22:30)
  const slotState = (t) => {
    if (pickedServices.length === 0) return 'oob';
    // รับคิวสุดท้าย 22:30 — เริ่มได้ถึงเวลานี้ทุกความยาว (อาจจบหลัง 23:00 ได้)
    if (t < OPEN_MIN || t > LAST_START_MIN) return 'oob';
    const clash = bookedSlots.some((s) => t < s.end && t + billSpan > s.start);
    return clash ? 'clash' : 'free';
  };

  // บิลจอง: ช่องเวลาใดชนคิว "ทั้งวัน" (ทุกหมอรวมกัน) — ต่างจากหน้าร้านที่กันต่อหมอ
  const bookedSlotState = (t) => {
    if (pickedServices.length === 0) return 'oob';
    if (t < OPEN_MIN || t > LAST_START_MIN) return 'oob';
    const clash = bookedAllDay.some((s) => t < s.end && t + billSpan > s.start);
    return clash ? 'clash' : 'free';
  };
  // ตัวเลือกสถานะช่องเวลาตาม flow: จอง = กันทั้งวัน · หน้าร้าน = กันต่อหมอ (ผลเดิมทุกอย่าง)
  const chooserSlotState = (t) => (customerType === 'booking' ? bookedSlotState(t) : slotState(t));

  // ตรวจเวลาที่ pick: อยู่ในเวลาเปิดร้าน + ไม่ชนคิว (รวมพัก) — ทั้งบิลก้อนเดียว
  // บิลจองชนคิวได้จาก "ทุกหมอ" ของวันนั้น (bookedAllDay) · หน้าร้านชนคิวของหมอที่เลือก (bookedSlots เดิม)
  const timeError = useMemo(() => {
    if (selectedStartTime == null || pickedServices.length === 0) return '';
    if (selectedStartTime < OPEN_MIN) return `ร้านเปิด ${minutesToTime(OPEN_MIN)} — เลือกเวลาหลังจากนั้น`;
    if (selectedStartTime > LAST_START_MIN) return `รับคิวสุดท้าย ${minutesToTime(LAST_START_MIN)} — เลือกเวลาไม่เกินนี้`;
    const ranges = customerType === 'booking' ? bookedAllDay : bookedSlots;
    const clash = ranges.some((s) => selectedStartTime < s.end && (billEnd ?? selectedStartTime) > s.start);
    if (clash) return 'เวลานี้ชนกับคิวที่จองแล้ว ลองขยับเวลา';
    return '';
  }, [selectedStartTime, pickedServices.length, billEnd, customerType, bookedAllDay, bookedSlots]);

  // ช่วงว่างถัดไป (ละเอียด 15 นาที) นับจากเวลาฐาน — ใช้กับปุ่มแนะนำ + auto-snap
  const nextFreeFrom = (base) => {
    if (pickedServices.length === 0) return null;
    const start = Math.max(snap15(base ?? nowMinutes()), OPEN_MIN);
    // BUG-POS-02: ใช้ billSpan ในการกวาดหาช่องว่าง — บิลจองกวาดด้วยสถานะ "ทั้งวัน"
    for (let t = start; t <= LAST_START_MIN; t += GRID_STEP) {
      if (chooserSlotState(t) === 'free') return t;
    }
    return null;
  };

  // ตัวเลือกเวลาเริ่ม 12:00 → 22:30 (รับคิวสุดท้าย 22:30) + สถานะแต่ละช่อง (ว่าง/ชนคิว)
  const timeSlots = [];
  for (let t = OPEN_MIN; t <= LAST_START_MIN; t += GRID_STEP) {
    const s = chooserSlotState(t);
    if (s === 'oob') continue;
    timeSlots.push({ v: t, l: minutesToTime(t), s });
  }

  // เข้าขั้น 4 แล้วยังไม่เลือกเวลา → ตั้งเป็นเวลาปัจจุบัน (ปัดเป็น 15 นาที + ไม่เกิน 22:30)
  useEffect(() => {
    if (step !== 4 || pickedServices.length === 0 || selectedStartTime != null) return;
    setSelectedStartTime(Math.min(Math.max(nowMinutes(), OPEN_MIN), LAST_START_MIN));
  }, [step]);

  // เข้าขั้น 4 แล้วเวลาชนคิว → ขยับไปช่วงว่างถัดไปให้เลย (กันกดซ้ำด้วย ref)
  const snapGuard = useRef({ doneFor: null });
  useEffect(() => {
    if (step !== 4 || pickedServices.length === 0 || selectedStartTime == null) return;
    if (!timeError) return;
    const key = `${activeTherapistId}-${selectedStartTime}-${billMinutes}`;
    if (snapGuard.current.doneFor === key) return;
    snapGuard.current.doneFor = key;
    const next = nextFreeFrom(selectedStartTime);
    if (next != null) setSelectedStartTime(next);
  }, [step, pickedServices.length, selectedStartTime, timeError, activeTherapistId, billMinutes, bookedSlots, customerType, bookedAllDay]);

  const subtotal = pickedServices.reduce((s, p) => s + p.price, 0);
  const discVal = Math.max(0, Math.min(subtotal, Number(discount) || 0));
  const total = subtotal - discVal;

  const resetServicePick = () => {
    setSelectedCategory(null);
    setSelectedDuration(null);
    setSelectedAddons([]);
  };

  const resetAll = () => {
    resetServicePick();
    setPickedServices([]);
    setSelectedTherapist(null);
    setSelectedStartTime(null);
    setVisitingName('');
    setTherapistType('resident');
    setFuelChecked(true);
    setLooping(false);
    // ล้างข้อมูลบิลจอง + กลับไปหน้าเลือกประเภทลูกค้า
    setCustomerName('');
    setBookerName('');
    setBookerId('');
    setBizDate(bkkToday());
    setCustomerType(null);
  };

  const handleSelectCategory = (cat) => {
    if (selectedCategory !== cat) {
      setSelectedCategory(cat);
      setSelectedDuration(null);
      setSelectedAddons([]);
      // default เวลาเริ่ม = เวลาปัจจุบัน (ตั้งครั้งแรกครั้งเดียว ไม่ทับที่เลือกไว้)
      if (selectedStartTime == null) {
        setSelectedStartTime(Math.min(Math.max(nowMinutes(), OPEN_MIN), LAST_START_MIN));
      }
    }
    setErr('');
  };

  // เลือกแล้วค้างหน้านี้ — ไปต่อด้วยปุ่มถัดไปเท่านั้น
  const pickDuration = (dur) => {
    setSelectedDuration(dur);
    setErr('');
  };
  const pickTherapist = (id) => {
    setSelectedTherapist(id);
    setSelectedStartTime(null);
    setErr('');
  };

  // หยิบบริการที่เลือกเข้าตะกร้า แล้วเดินหน้า (รอบปกติ→ขั้น 3, รอบวน→ข้ามไปขั้น 4)
  const addPickedService = () => {
    if (!selectedCategory || !selectedDuration) { setErr('เลือกรายการและระยะเวลาให้ครบ'); return; }
    const matched = svcFor(selectedDuration);
    const pickedAddons = selectedAddons
      .map((id) => addonsActive.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => ({ id: a.id, name: a.name, minutes: a.minutes, price: a.price }));
    const extraMin = pickedAddons.reduce((s, a) => s + (a.minutes || 0), 0);
    const extraPrice = pickedAddons.reduce((s, a) => s + (a.price || 0), 0);
    setErr('');
    setPickedServices((prev) => [...prev, {
      key: `${Date.now()}-${prev.length}`,
      serviceId: matched?.id || `${selectedCategory}-${selectedDuration}`,
      serviceName: `${selectedCategory} ${formatDuration(selectedDuration)}`,
      category: selectedCategory,
      duration: selectedDuration,
      addons: pickedAddons,
      minutes: (selectedDuration || 0) + extraMin,
      price: priceFor(selectedDuration) + extraPrice,
    }]);
    resetServicePick();
    // จอง: ขั้นถัดไปคือเวลา (ขั้น 4) เสมอ · หน้าร้าน: รอบวน→ขั้น 4, รอบปกติ→ขั้นหมอ (เดิม)
    setStep(customerType === 'booking' ? 4 : (looping ? 4 : 3));
  };

  const removePickedService = (key) => {
    setPickedServices((prev) => prev.filter((p) => p.key !== key));
  };

  // ปุ่ม "เช็คบิล →" ขั้นเวลาเปิดได้เมื่อ: มีบริการ + เวลาถูกต้อง (+ หมอ เฉพาะหน้าร้าน — บิลจองตั้งหมอทีหลัง)
  const validPick = pickedServices.length > 0
    && selectedStartTime != null
    && !timeError
    && (customerType === 'booking' || activeTherapistId);

  // เปิดบิลไว้ก่อน (ยังไม่เช็คบิล) — ไม่ต้องอนุมัติเจ้าของร้าน, สถานะ open
  const openDraftBill = () => {
    // BUG-POS-04: ใช้ ref กันดับเบิลแตะแบบ synchronous
    if (creatingRef.current) return;
    if (pickedServices.length === 0) { setErr('เพิ่มบริการอย่างน้อย 1 รายการก่อนเปิดบิล'); return; }
    // บิลจอง: ไม่บังคับหมอ (ยังไม่รู้ว่าใครให้บริการ — ตั้งหมอทีหลังที่การ์ดบิลที่เปิดอยู่)
    if (customerType === 'booking') {
      if (selectedStartTime == null || timeError) { setErr('เลือกเวลาเริ่มให้ถูกต้องก่อนเปิดบิลจอง'); return; }
      setErr('');
      openBill();
      return;
    }
    if (!activeTherapistId) { setErr('เลือกหมอนวดก่อนเปิดบิล'); return; }
    if (selectedStartTime == null || timeError) { setErr('เลือกเวลาเริ่มให้ถูกต้องก่อนเปิดบิล'); return; }
    setErr('');
    openBill();
  };

  const openBill = async () => {
    // BUG-POS-04: guard แบบ synchronous ก่อน state creating
    if (creatingRef.current) return;
    const isBooking = customerType === 'booking';
    // ตรวจซ้ำก่อนเซฟ: กันเครื่องอื่นจองช่วงเวลาเดียวกันเข้าไปก่อนแล้ว
    // (บิลจอง: กันคิว "ทั้งวัน" — เลือกไม่ได้เพราะยังไม่รู้หมอ · หน้าร้าน: กันคิวของหมอที่เลือก เดิม)
    const clashRanges = isBooking ? bookedAllDay : bookedSlots;
    const clash = clashRanges.some((s) => selectedStartTime < s.end && (billEnd ?? selectedStartTime) > s.start);
    if (clash) {
      setErr('เวลานี้ชนกับคิวที่จองแล้ว (มีผู้ใช้งานคนอื่นจองไปก่อน) ลองเลือกเวลาว่างถัดไป');
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    try {
    const id = generateBillId(data.bills);
    const stamp = bkkNow();
    const times = chainTimes(selectedStartTime, pickedServices.map((p) => p.minutes || 0), BREAK_MINUTES);
    const endMin = times.length ? times[times.length - 1].end : selectedStartTime;
    const newBill = {
      id, date: stamp,
      customer: isBooking ? customerName.trim() : '', memberNo: '',
      // บิลจอง: ประเภทลูกค้า + วันที่ให้บริการ + ผู้รับจอง (หมอเว้นว่างตั้งทีหลัง) · หน้าร้าน: walkin
      customerType: isBooking ? 'booking' : 'walkin',
      ...(isBooking ? { bookedDate: bizDate, bookerName: bookerName.trim(), bookerId } : {}),
      // โมเดลใหม่: หมอ + เวลาเริ่ม/จบ ระดับบิล
      therapistId: isBooking ? '' : activeTherapistId,
      therapistName: isBooking ? '' : activeTherapistName,
      startTime: minutesToTime(selectedStartTime),
      endTime: minutesToTime(endMin),
      // ค่าน้ำมันหมอวิ่ง ฿30/รอบ — รายจ่ายร้าน ไม่บวกยอดลูกค้า (บิลจองไม่มีหมอ ไม่มีค่าน้ำมัน)
      fuel: isBooking ? 0 : (therapistType === 'visiting' && fuelChecked ? 30 : 0),
      items: pickedServices.map((p, i) => ({
        serviceId: p.serviceId,
        serviceName: (p.addons || []).length ? `${p.serviceName} + ${(p.addons || []).map((a) => a.name).join(', ')}` : p.serviceName,
        category: p.category,
        therapistId: isBooking ? '' : activeTherapistId,
        therapistName: isBooking ? '' : activeTherapistName,
        qty: 1, price: p.price, discount: 0, net: p.price,
        duration: p.minutes, totalMinutes: p.minutes,
        startTime: minutesToTime(times[i].start),
        endTime: minutesToTime(times[i].end),
      })),
      subtotal, discount: discVal, total, paymentMethod, status: 'open', createdAt: stamp,
      promotion: promoName || '',
    };
    const auditEntry = isBooking
      ? {
          id: `A-${Date.now()}`, timestamp: stamp, user: 'ระบบ POS',
          action: 'เปิดบิลจอง (รอลูกค้า)',
          detail: `คุณ${customerName.trim()} · ${dayChipLabel(bizDate)} ${minutesToTime(selectedStartTime)} น. · รับจอง ${bookerName.trim()}`,
          oldValue: '-', newValue: 'open', approvedBy: '-',
        }
      : {
          id: `A-${Date.now()}`, timestamp: stamp, user: 'ระบบ POS',
          action: 'เปิดบิล (รอเช็คบิล)', detail: `฿ ${total.toLocaleString()} · ${activeTherapistName} · ${pickedServices.length} บริการ`,
          oldValue: '-', newValue: 'open', approvedBy: '-',
        };
    saveData({
      ...data,
      bills: [...(data.bills || []), newBill],
      auditLog: [...(data.auditLog || []), auditEntry],
    });
    setPickedServices([]); setDiscount(''); setPromoId('');
    resetAll();
    setStep(1);
    await alertDialog({
      title: isBooking ? 'เปิดบิลจองแล้ว' : 'เปิดบิลแล้ว',
      message: isBooking
        ? `คุณ${newBill.customer} · ${dayChipLabel(newBill.bookedDate)} ${newBill.startTime} น. · ${newBill.items.map((i) => i.serviceName).join(' · ')} · ฿ ${total.toLocaleString()}`
        : `${newBill.items.map((i) => i.serviceName).join(' · ')} · ${activeTherapistName} · ฿ ${total.toLocaleString()}`,
    });
    if (onNavigate) onNavigate('bills');
    } finally {
      // BUG-POS-04: reset ref คู่กับ state เสมอ
      creatingRef.current = false;
      setCreating(false);
    }
  };

  return (
    <div>
      {err && <div className="err-banner"><TriangleAlert size={16} strokeWidth={1.9} className="eic" /> {err}</div>}

      {/* ขั้น 0: เลือกประเภทลูกค้า — ยังไม่เลือกจึงไม่แสดงแถบขั้น */}
      {customerType === null && (
        <Card>
          <CardHead title="ลูกค้าแบบไหน?" hint="เลือกก่อนเริ่มเปิดบิล" />
          <div className="typepick-grid">
            <button type="button" className="typepick-card" onClick={() => startFlow('walkin')}>
              <span className="typepick-ico"><Store size={26} strokeWidth={1.6} /></span>
              <b>ลูกค้าหน้าร้าน</b>
              <small>รายการ → ระยะเวลา → หมอนวด → เวลา → ตรวจสอบ</small>
            </button>
            <button type="button" className="typepick-card typepick-green" onClick={() => startFlow('booking')}>
              <span className="typepick-ico"><CalendarDays size={26} strokeWidth={1.6} /></span>
              <b>ลูกค้าจอง</b>
              <small>โทรมาจองล่วงหน้า · ชื่อลูกค้า + ผู้รับจอง (ตั้งหมอทีหลัง)</small>
            </button>
          </div>
        </Card>
      )}

      {/* แถบขั้น — labels ต่างกันตาม flow (จอง: ขั้น 1 = ชื่อลูกค้า) */}
      {customerType !== null && (
        <div className="steps">
          {(customerType === 'booking'
            ? ['ชื่อลูกค้า', 'รายการ', 'ระยะเวลา', 'เวลา', `ตรวจสอบ${pickedServices.length > 0 ? ` (${pickedServices.length})` : ''}`]
            : ['รายการ', 'ระยะเวลา', 'หมอนวด', 'เวลา', `ตรวจสอบ${pickedServices.length > 0 ? ` (${pickedServices.length})` : ''}`]
          ).map((label, i) => {
            const n = i + 1;
            return (
              <div key={n} className={`step${step === n ? ' cur' : ''}${step > n ? ' done' : ''}`}>
                <span className="step-dot">{step > n ? '✓' : n}</span>
                <span className="st"><b>{label}</b><small>ขั้น {n}/5</small></span>
                {i < 4 && <span className={`step-link${step > n ? ' done' : ''}`} />}
              </div>
            );
          })}
        </div>
      )}

      {customerType === 'booking' && (
        <div className="pos-type-badge"><CalendarDays size={13} strokeWidth={1.9} /> ลูกค้าจอง</div>
      )}

      {/* BOOKING STEP 1: ชื่อลูกค้า + ผู้รับจอง — บิลจอง = ลูกค้าโทรมาจอง (เปิดไว้รอลูกค้า) */}
      {step === 1 && customerType === 'booking' && (
        <Card>
          <CardHead title="ชื่อลูกค้า" hint="บิลจอง — บันทึกชื่อลูกค้าเพื่อเปิดบิลไว้ล่วงหน้า" />
          <div className="field">
            <label>ชื่อลูกค้า</label>
            <input
              value={customerName}
              onChange={(e) => { setCustomerName(e.target.value); setErr(''); }}
              placeholder="เช่น คุณสม"
              className="input"
            />
          </div>
          <div className="field">
            <label>รับจองโดย</label>
            <div className="preset-row mt0">
              {bookerChips.map((t) => (
                <button key={t.id} type="button" className={`preset-btn${bookerId === t.id ? ' on' : ''}`} aria-pressed={bookerId === t.id} onClick={() => pickBooker(t)}>
                  {t.name}
                </button>
              ))}
            </div>
            {bookerChips.length === 0 && <p className="muted">วันนี้ยังไม่มีใครเช็กชื่อ — พิมพ์ชื่อได้เลย</p>}
            <div className="search-wrap mt8">
              <Search size={16} />
              <input
                value={bookerName}
                onChange={(e) => setFreeBooker(e.target.value)}
                placeholder="พิมพ์ชื่ออิสระ… เจ้าของร้าน/พนักงาน ไม่ต้องเป็นหมอทะเบียน"
                className="input"
              />
            </div>
          </div>
          <div className="stepnav">
            <button className="btn btn-ghost fg1" onClick={backToTypePick}>← เปลี่ยนประเภทลูกค้า</button>
            <button
              className="btn btn-primary fg16"
              disabled={!(customerName.trim() && bookerName.trim())}
              onClick={() => {
                if (!customerName.trim() || !bookerName.trim()) { setErr('กรอกชื่อลูกค้าและผู้รับจองให้ครบก่อน'); return; }
                setErr('');
                setStep(2);
              }}
            >
              ถัดไป →
            </button>
          </div>
        </Card>
      )}

      {/* STEP 1: รายการล้วน (จอง: ขั้น 2) */}
      {step === (customerType === 'booking' ? 2 : 1) && (
        <>
          {pickedServices.length > 0 && (
            <Card>
              <CardHead title="บริการที่เลือก" hint={`${pickedServices.length} รายการ · ต่อกันอัตโนมัติ`} />
              {pickedServices.map((p, idx) => (
                <div key={p.key} className="tline">
                  <span className="q">{idx + 1}</span>
                  <span className="tt">
                    <b>{p.serviceName}</b>
                    <small>{formatDuration(p.minutes)}{(p.addons || []).length ? ` · +${p.addons.map((a) => `${a.name} ${a.minutes}น`).join(', ')}` : ''}</small>
                  </span>
                  <span className="qty">
                    <button onClick={() => removePickedService(p.key)} aria-label={`ลบบริการ ${p.serviceName}`}><Trash2 size={14} strokeWidth={1.9} /></button>
                  </span>
                  <b className="num">฿ {p.price.toLocaleString()}</b>
                </div>
              ))}
            </Card>
          )}
          <Card>
          <CardHead title="เลือกรายการ" hint={`${visibleCats.length} รายการ`} />
          <div className="svc-list">
            {visibleCats.map((c) => {
              const durs = durationsForCat(c);
              if (durs.length === 0) return null;
              const prices = durs.map((d) => d.price);
              const min = Math.min(...prices);
              const max = Math.max(...prices);
              /* เวลา: มีเดียว = "1 ชม" · หลายเวลา = "30 นาที – 2 ชม" (เลือกเอาในขั้น 2) */
              const durHint = durs.length === 1
                ? formatDuration(durs[0].duration)
                : `${formatDuration(durs[0].duration)} – ${formatDuration(durs[durs.length - 1].duration)}`;
              const Icon = categoryIcon(c);
              return (
                <button key={c} type="button" aria-pressed={selectedCategory === c} className={`svc-row${selectedCategory === c ? ' on' : ''}`} onClick={() => handleSelectCategory(c)}>
                  <span className="svc-ico" aria-hidden="true"><Icon size={22} strokeWidth={1.6} /></span>
                  <span className="svc-main">
                    <b>{c}</b>
                    <small>{durHint}</small>
                  </span>
                  <span className="svc-price num">฿ {min.toLocaleString()}{max !== min ? ` – ${max.toLocaleString()}` : ''}</span>
                  <ChevronRight className="svc-arrow" size={18} strokeWidth={1.9} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {visibleCats.length === 0 && <EmptyState title="ยังไม่มีรายการ" subtitle="เพิ่มรายการในหน้าจัดการร้าน" />}
          {selectedCategory && (
          <div className="stepnav">
            <button className="btn btn-primary btn-block" onClick={() => setStep(step + 1)}>ถัดไป →</button>
          </div>
          )}
        </Card>
        </>
      )}

      {/* STEP 2: ระยะเวลา (จอง: ขั้น 3) — walk-in ขั้น 3 คือขั้นเลือกหมอนวด */}
      {step === (customerType === 'booking' ? 3 : 2) && selectedCategory && (
        <Card>
          <CardHead
            title={selectedCategory}
            hint="เลือกระยะเวลา"
          />

          <div className="dur-grid">
              {availableDurations.map(({ duration, price }) => (
                <button key={duration} className={`dur-card${selectedDuration === duration ? ' on' : ''}`} onClick={() => pickDuration(duration)}>
                  <span className="dur-label">{formatDuration(duration)}</span>
                  <span className="dur-price">฿ {price.toLocaleString()}</span>
                </button>
              ))}
            </div>
          {addonsActive.length > 0 && (
            <div className="field mt12">
              <label>บริการเสริม (หลายอย่างได้ · +เงิน +เวลา)</label>
              <div className="addon-list">
                {addonsActive.map((a) => {
                  const on = selectedAddons.includes(a.id);
                  return (
                    <button key={a.id} type="button" className={`addon-row${on ? ' on' : ''}`} onClick={() => toggleAddon(a.id)}>
                      <span className="addon-check">{on ? '✓' : ''}</span>
                      <span className="addon-main"><b>{a.name}</b><small>+{a.minutes} นาที</small></span>
                      <span className="addon-price">+฿ {a.price.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="stepnav">
            <button className="btn btn-ghost fg1" onClick={() => { resetServicePick(); setStep(customerType === 'booking' ? 2 : 1); }}>← กลับ</button>
            <button className="btn btn-primary fg16" onClick={addPickedService} disabled={!selectedDuration}>ถัดไป →</button>
          </div>
        </Card>
      )}

      {/* STEP 3: หมอนวด (คนเดียวทั้งบิล) — เฉพาะลูกค้าหน้าร้าน (บิลจองไม่มีขั้นหมอ) */}
      {step === 3 && customerType === 'walkin' && pickedServices.length > 0 && (
        <Card>
          <CardHead
            title="เลือกหมอนวด"
            hint={`${pickedServices.length} บริการ · รวม ${formatDuration(billMinutes)}`}
          />
          <div className="seg">
              <button onClick={() => switchTherapistType('resident')} className={therapistType === 'resident' ? 'on' : ''}>หมอประจำ</button>
              <button onClick={() => switchTherapistType('visiting')} className={therapistType === 'visiting' ? 'on' : ''}>หมอวิ่ง</button>
            </div>
            {therapistType === 'resident' ? (
              <div className="thera-scroll">
                {therapistsList.map((th) => {
                  const active = selectedTherapist === th.id;
                  return (
                    <button key={th.id} onClick={() => pickTherapist(th.id)} className={`thera${active ? ' on' : ''}`}>
                      <span className="thera-ava">{(th.name || '?').charAt(0)}</span>
                      <span><b>{th.name}</b></span>
                      <span className="pick">{active ? '✓ เลือกแล้ว' : 'แตะเลือก'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="field mb0">
                <div className="search-wrap">
                  <Search size={16} />
                  <input
                    value={visitingName}
                    onChange={(e) => { setVisitingName(e.target.value); setErr(''); }}
                    placeholder="พิมพ์ชื่อหมอวิ่ง… เช่น หมอนิด"
                    className="input"
                  />
                </div>
              </div>
            )}
          <div className="stepnav">
            <button className="btn btn-ghost fg1" onClick={() => setStep(1)}>← กลับ</button>
            <button className="btn btn-primary fg16" onClick={() => setStep(4)} disabled={therapistType === 'visiting' ? !visitingName.trim() : !selectedTherapist}>ถัดไป →</button>
          </div>
        </Card>
      )}

      {/* STEP 4: เวลาเริ่มเดียวทั้งบิล (บิลจอง: เลือกวันที่ให้บริการได้ ไม่ต้องมีหมอก่อน) */}
      {step === 4 && pickedServices.length > 0 && (customerType === 'booking' || activeTherapistId) && (
        <Card>
          <CardHead
            title="เลือกเวลาเริ่ม"
            hint={`${pickedServices.length} บริการ${customerType === 'booking' ? ` · บิลจอง · ${dayChipLabel(bizDate)}` : ` · ${activeTherapistName}`}`}
          />
          <div className="field">
            {/* บิลจอง: วันที่ให้บริการ (จองล่วงหน้าได้ถึง 7 วัน) */}
            {customerType === 'booking' && (
              <div className="field typepick-days">
                <label>วันที่ให้บริการ</label>
                <div className="preset-row mt0">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((off) => {
                    const d = bkkToday(off);
                    return (
                      <button key={d} type="button" className={`preset-btn${bizDate === d ? ' on' : ''}`} aria-pressed={bizDate === d} onClick={() => { setBizDate(d); setErr(''); }}>
                        {dayChipLabel(d)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* ป้าย "เวลาเริ่ม" อยู่ในปุ่ม picker อยู่แล้ว (sub) — ไม่ซ้ำ label นอก */}
            <TimeSlotPicker
              value={selectedStartTime}
              slots={timeSlots}
              onChange={(v) => { setSelectedStartTime(v); setErr(''); }}
            />
            {selectedStartTime != null && (
              <div className="tend-box full">จบ {billEnd != null ? clockTime(billEnd) : '—'} · รวม {formatDuration(billMinutes)}</div>
            )}
            {timeError && (
              <div className="alert warn">{timeError}
                {(() => {
                  const nf = nextFreeFrom(selectedStartTime ?? nowMinutes());
                  return nf != null ? (
                    <button type="button" className="preset-btn ml8" onClick={() => setSelectedStartTime(nf)}>
                      ใช้ {minutesToTime(nf)}
                    </button>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {validPick && (
            <div className="summary-box">
              {/* ไม่ซ้ำ: ชื่อหมอ = hint หัวการ์ด · เวลารวม = แถบ "จบ … · รวม …" ใต้ตัวเลือกเวลา
                  → ใบสรุปเหลือแต่แถวรายการ + ราคา */}
              {chained.map((p, i) => (
                <div key={p.key} className="r"><span>{i + 1}. {p.serviceName}</span><b>{clockTime(p.start)} – {clockTime(p.end)}</b></div>
              ))}
              <div className="r"><span>ราคา</span><b>฿ {subtotal.toLocaleString()}</b></div>
            </div>
          )}

          <div className="stepnav stepnav-3">
            <button className="btn btn-ghost fg09" onClick={() => setStep(customerType === 'booking' ? 3 : (looping ? 2 : 3))}>← กลับ</button>
            <button
              className="btn btn-ghost fg1"
              onClick={() => {
                if (customerType === 'booking') { setErr(''); resetServicePick(); setStep(2); return; }
                setErr(''); setLooping(true); resetServicePick(); setStep(1);
              }}
            >
              <Plus size={16} /> เพิ่มรายการ
            </button>
            <button className="btn btn-primary fg11" onClick={() => setStep(5)} disabled={!validPick}>
              เช็คบิล →
            </button>
          </div>
        </Card>
      )}

      {/* STEP 5: ตรวจสอบ */}
      {step === 5 && (
        <div className="pos-grid">
          <Card>
            <CardHead
              title="รายการในบิล"
              hint={`${pickedServices.length} บริการ · ${activeTherapistName}`}
              right={<button className="btn btn-ghost btn-sm" onClick={() => setStep(customerType === 'booking' ? 2 : 1)}>+ เพิ่มบริการ</button>}
            />
            {pickedServices.length === 0 && <EmptyState title="ยังไม่มีบริการ" subtitle="กด '+ เพิ่มบริการ' เพื่อเริ่ม" />}
            {chained.map((p, idx) => (
              <div key={p.key} className="tline">
                <span className="q">{idx + 1}</span>
                <span className="tt">
                  <b>{p.serviceName}</b>
                  <small>{clockTime(p.start)}–{clockTime(p.end)}{(p.addons || []).length ? ` · +${p.addons.map((a) => `${a.name} ${a.minutes}น`).join(', ')}` : ''}</small>
                </span>
                <span className="qty">
                  <button onClick={() => removePickedService(p.key)} aria-label={`ลบบริการ ${p.serviceName}`}><Trash2 size={14} strokeWidth={1.9} /></button>
                </span>
                <b className="num">฿ {p.price.toLocaleString()}</b>
              </div>
            ))}
          </Card>

          {pickedServices.length > 0 && (
            <Card className="pos-side">
              <div className="field mb8">
                <label>โปรโมชันส่วนลด</label>
                {promosActive.length > 0 ? (
                  <div className="preset-row mt0">
                    {promosActive.map((p) => (
                      <button key={p.id} type="button" className={`preset-btn${promoId === p.id ? ' on' : ''}`} aria-pressed={promoId === p.id} onClick={() => selectPromo(p)}>{p.name} −฿ {p.amount.toLocaleString()}</button>
                    ))}
                    {promoId && <button type="button" className="preset-btn" onClick={() => { setPromoId(''); setDiscount(''); }}>ไม่ใช้โปร</button>}
                  </div>
                ) : (
                  <p className="muted">ยังไม่มีโปรโมชัน</p>
                )}
              </div>
              <div className="summary-box">
                {customerType === 'booking' ? (
                  <>
                    <div className="r"><span>ลูกค้า</span><b>คุณ{customerName.trim() || '—'}</b></div>
                    <div className="r"><span>วันที่ให้บริการ</span><b>{dayChipLabel(bizDate)}</b></div>
                    <div className="r"><span>รับจองโดย</span><b>{bookerName.trim() || '—'}</b></div>
                    <div className="r"><span>หมอ</span><b>ยังไม่ระบุ — ตั้งหมอเมื่อลูกค้าถึงร้าน</b></div>
                  </>
                ) : (
                  <div className="r"><span>หมอ</span><b>{activeTherapistName}{therapistType === 'visiting' ? ' (หมอวิ่ง)' : ''}</b></div>
                )}
                <div className="r"><span>รวมย่อย</span><b>฿ {subtotal.toLocaleString()}</b></div>
                <div className="r"><span>ส่วนลด{promoName ? ` (${promoName})` : ''}</span><b>−฿ {discVal.toLocaleString()}</b></div>
                <div className="r grand"><span><b>สุทธิ</b></span><b className="grand-total">฿ {total.toLocaleString()}</b></div>
                {customerType !== 'booking' && therapistType === 'visiting' && (
                  <button type="button" className={`fuel-check${fuelChecked ? ' on' : ''}`} onClick={() => setFuelChecked(!fuelChecked)} aria-pressed={fuelChecked} aria-label="ค่าน้ำมันหมอวิ่ง 30 บาทต่อรอบ">
                    <span className="fuel-ic"><Fuel size={17} strokeWidth={1.9} /></span>
                    <span className="fuel-tx">ค่าน้ำมันหมอวิ่ง <b>+฿ 30/รอบ</b><small className="muted">รายจ่ายร้าน ไม่บวกในบิล</small></span>
                    <span className={`fuel-toggle${fuelChecked ? ' on' : ''}`} aria-hidden="true"><i /></span>
                  </button>
                )}
              </div>
              <button className="btn btn-primary btn-block mt4" onClick={openDraftBill} disabled={creating} aria-busy={creating}>
                <ReceiptText size={18} /> {creating ? 'กำลังเปิดบิล…' : `${customerType === 'booking' ? 'เปิดบิลจอง' : 'เปิดบิล'} · ฿ ${total.toLocaleString()}`}
              </button>
            </Card>
          )}
        </div>
      )}

    </div>
  );
}
