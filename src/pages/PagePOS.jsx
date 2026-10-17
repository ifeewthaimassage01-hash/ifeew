import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { ReceiptText, Plus, Search, TriangleAlert, Trash2, ChevronDown, Check, Fuel } from 'lucide-react';
import { Card, CardHead, EmptyState, formatDuration, alertDialog } from '../components/ui';
import { chainTimes, categoryEn, serviceCategoryOrder } from '../lib/billing';
import { generateBillId } from '../lib/ids';
import { bkkNow, bkkMinutes } from '../utils/bkk';

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

/* เวลาปัจจุบันไทย (นาที) ปัดขึ้นเป็น 15 นาที — ตรงกับ grid เลือกเวลา */
function nowMinutes() {
  const m = bkkMinutes();
  return Math.ceil(m / 15) * 15;
}

function snap15(m) {
  return Math.round(m / 15) * 15;
}

const OPEN_MIN = 12 * 60;
const CLOSE_MIN = 23 * 60;
const GRID_STEP = 15;

/* Dropdown เวลาใบใหญ่ — ตัวเลขใหญ่ + ป้ายชั่วโมง/นาที เข้าธีมร้าน
   รองรับคีย์บอร์ด: ↓/↑ เปิดเมนู, Esc ปิด, ลูกศรเลื่อน + Enter เลือก */
function TimeDropdown({ value, options, onChange, label, sub }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();
  const current = options.find((o) => o.v === value);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // เปิดเมนูทีไร ไฮไลต์ค่าปัจจุบัน + ย้ายโฟกัสเข้าเมนูเพื่อกดลูกศรต่อได้เลย
  useEffect(() => {
    if (open) {
      setHi(Math.max(0, options.findIndex((o) => o.v === value)));
      menuRef.current?.focus();
    }
  }, [open, options, value]);

  const pick = (v) => {
    onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  };

  const move = (d) => {
    const n = Math.min(options.length - 1, Math.max(0, hi + d));
    setHi(n);
    itemRefs.current[n]?.scrollIntoView({ block: 'nearest' });
  };

  const onMenuKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0); itemRefs.current[0]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'End') { e.preventDefault(); const n = options.length - 1; setHi(n); itemRefs.current[n]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[hi]) pick(options[hi].v); }
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
        <span className="timepick-val">{current?.l ?? '--'}</span>
        <span className="timepick-sub">{sub}</span>
        <ChevronDown size={16} strokeWidth={1.9} className="dd-caret" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="dropdown-menu time-menu"
          role="listbox"
          aria-label={label}
          aria-activedescendant={options[hi] ? `${menuId}-opt-${hi}` : undefined}
          tabIndex={-1}
          onKeyDown={onMenuKey}
        >
          {options.map((o, i) => (
            <button
              key={o.v}
              id={`${menuId}-opt-${i}`}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="option"
              aria-selected={value === o.v}
              className={`dropdown-item${value === o.v ? ' on' : ''}${hi === i ? ' hi' : ''}`}
              onClick={() => pick(o.v)}
              onMouseEnter={() => setHi(i)}
              onFocus={() => setHi(i)}
            >
              {o.l}
              {value === o.v && <Check size={14} strokeWidth={1.9} className="dd-check" aria-hidden="true" />}
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
  const wizardGuardRef = useRef(false);

  // บอก App ว่ากำลังเลือกหมอ/เวลา/ตรวจสอบบิล — realtime จะได้ไม่โหลดทับกลางคัน
  useEffect(() => {
    const isWizardActive = step >= 3 && step <= 5;
    const prev = wizardGuardRef.current;
    wizardGuardRef.current = isWizardActive;
    if (prev !== isWizardActive) {
      window.dispatchEvent(new CustomEvent('ifeew-modal', { detail: { open: isWizardActive ? 1 : 0 } }));
    }
  }, [step]);

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

  const bookedSlots = useMemo(() => {
    if (!activeTherapistId) return [];
    const slots = [];
    (data.bills || []).forEach((b) => {
      // ตรวจเฉพาะบิลที่ยังเปิดอยู่ (status = open) — ไม่นับบิลที่เช็คแล้ว (paid) หรือยกเลิก (cancelled)
      if (b.status !== 'open') return;
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
    return slots;
  }, [data.bills, activeTherapistId]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  // ตรวจเวลาที่ pick: อยู่ในเวลาเปิดร้าน + ไม่ชนคิว (รวมพัก) — ทั้งบิลก้อนเดียว
  const timeError = useMemo(() => {
    if (selectedStartTime == null || pickedServices.length === 0) return '';
    if (selectedStartTime < OPEN_MIN) return `ร้านเปิด ${minutesToTime(OPEN_MIN)} — เลือกเวลาหลังจากนั้น`;
    if (billEnd != null && billEnd > CLOSE_MIN) return `เวลานี้จบเกิน ${minutesToTime(CLOSE_MIN)} — ร้านปิดแล้ว`;
    const clash = bookedSlots.some((s) => selectedStartTime < s.end && (billEnd ?? selectedStartTime) > s.start);
    if (clash) return 'เวลานี้ชนกับคิวที่จองแล้ว ลองขยับเวลา';
    return '';
  }, [selectedStartTime, pickedServices.length, billEnd, bookedSlots]);

  // สถานะของ 1 ช่องเวลา: ว่าง / ชนคิว / เกินเวลาร้าน
  const slotState = (t) => {
    if (pickedServices.length === 0) return 'oob';
    if (t < OPEN_MIN || t + billMinutes > CLOSE_MIN) return 'oob';
    const clash = bookedSlots.some((s) => t < s.end && t + billMinutes > s.start);
    return clash ? 'clash' : 'free';
  };

  // ช่วงว่างถัดไป (ละเอียด 15 นาที) นับจากเวลาฐาน — ใช้กับปุ่มแนะนำ + auto-snap
  const nextFreeFrom = (base) => {
    if (pickedServices.length === 0) return null;
    const start = Math.max(snap15(base ?? nowMinutes()), OPEN_MIN);
    for (let t = start; t + billMinutes <= CLOSE_MIN; t += GRID_STEP) {
      if (slotState(t) === 'free') return t;
    }
    return null;
  };

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
  }, [step, pickedServices.length, selectedStartTime, timeError, activeTherapistId, billMinutes, bookedSlots]);

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
  };

  const handleSelectCategory = (cat) => {
    if (selectedCategory !== cat) {
      setSelectedCategory(cat);
      setSelectedDuration(null);
      setSelectedAddons([]);
      // default เวลาเริ่ม = เวลาปัจจุบัน (ตั้งครั้งแรกครั้งเดียว ไม่ทับที่เลือกไว้)
      if (selectedStartTime == null) {
        setSelectedStartTime(Math.min(Math.max(nowMinutes(), OPEN_MIN), CLOSE_MIN - 30));
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
    setStep(looping ? 4 : 3);
  };

  const removePickedService = (key) => {
    setPickedServices((prev) => prev.filter((p) => p.key !== key));
  };

  const validPick = pickedServices.length > 0 && activeTherapistId && selectedStartTime != null && !timeError;

  // เปิดบิลไว้ก่อน (ยังไม่เช็คบิล) — ไม่ต้องอนุมัติเจ้าของร้าน, สถานะ open
  const openDraftBill = () => {
    if (creating) return;
    if (pickedServices.length === 0) { setErr('เพิ่มบริการอย่างน้อย 1 รายการก่อนเปิดบิล'); return; }
    if (!activeTherapistId) { setErr('เลือกหมอนวดก่อนเปิดบิล'); return; }
    if (selectedStartTime == null || timeError) { setErr('เลือกเวลาเริ่มให้ถูกต้องก่อนเปิดบิล'); return; }
    setErr('');
    openBill();
  };

  const openBill = async () => {
    if (creating) return;
    // ตรวจซ้ำก่อนเซฟ: กันเครื่องอื่นจองช่วงเวลาเดียวกันเข้าไปก่อนแล้ว
    const clash = bookedSlots.some((s) => selectedStartTime < s.end && (billEnd ?? selectedStartTime) > s.start);
    if (clash) {
      setErr('เวลานี้ชนกับคิวที่จองแล้ว (มีผู้ใช้งานคนอื่นจองไปก่อน) ลองเลือกเวลาว่างถัดไป');
      return;
    }
    setCreating(true);
    try {
    const id = generateBillId(data.bills);
    const stamp = bkkNow();
    const times = chainTimes(selectedStartTime, pickedServices.map((p) => p.minutes || 0), BREAK_MINUTES);
    const endMin = times.length ? times[times.length - 1].end : selectedStartTime;
    const newBill = {
      id, date: stamp, customer: '', memberNo: '',
      // โมเดลใหม่: หมอ + เวลาเริ่ม/จบ ระดับบิล
      therapistId: activeTherapistId, therapistName: activeTherapistName,
      startTime: minutesToTime(selectedStartTime),
      endTime: minutesToTime(endMin),
      // ค่าน้ำมันหมอวิ่ง ฿30/รอบ — รายจ่ายร้าน ไม่บวกยอดลูกค้า
      fuel: therapistType === 'visiting' && fuelChecked ? 30 : 0,
      items: pickedServices.map((p, i) => ({
        serviceId: p.serviceId,
        serviceName: (p.addons || []).length ? `${p.serviceName} + ${(p.addons || []).map((a) => a.name).join(', ')}` : p.serviceName,
        category: p.category,
        therapistId: activeTherapistId, therapistName: activeTherapistName,
        qty: 1, price: p.price, discount: 0, net: p.price,
        duration: p.minutes, totalMinutes: p.minutes,
        startTime: minutesToTime(times[i].start),
        endTime: minutesToTime(times[i].end),
      })),
      subtotal, discount: discVal, total, paymentMethod, status: 'open', createdAt: stamp,
      promotion: promoName || '',
    };
    saveData({
      ...data,
      bills: [...(data.bills || []), newBill],
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: stamp, user: 'ระบบ POS',
        action: 'เปิดบิล (รอเช็คบิล)', detail: `฿ ${total.toLocaleString()} · ${activeTherapistName} · ${pickedServices.length} บริการ`,
        oldValue: '-', newValue: 'open', approvedBy: '-',
      }],
    });
    setPickedServices([]); setDiscount(''); setPromoId('');
    resetAll();
    setStep(1);
    await alertDialog({
      title: 'เปิดบิลแล้ว',
      message: `${newBill.items.map((i) => i.serviceName).join(' · ')} · ${activeTherapistName} · ฿ ${total.toLocaleString()}`,
    });
    if (onNavigate) onNavigate('bills');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {err && <div className="err-banner"><TriangleAlert size={16} strokeWidth={1.9} className="eic" /> {err}</div>}

      <div className="steps">
        {[
          { n: 1, label: 'รายการ' },
          { n: 2, label: 'ระยะเวลา' },
          { n: 3, label: 'หมอนวด' },
          { n: 4, label: 'เวลา' },
          { n: 5, label: `ตรวจสอบ${pickedServices.length > 0 ? ` (${pickedServices.length})` : ''}` },
        ].map((s, i) => (
          <div key={s.n} className={`step${step === s.n ? ' cur' : ''}${step > s.n ? ' done' : ''}`}>
            <span className="step-dot">{step > s.n ? '✓' : s.n}</span>
            <span className="st"><b>{s.label}</b><small>ขั้น {s.n}/5</small></span>
            {i < 4 && <span className={`step-link${step > s.n ? ' done' : ''}`} />}
          </div>
        ))}
      </div>

      {/* STEP 1: รายการล้วน */}
      {step === 1 && (
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
          <div className="cat-grid">
            {visibleCats.map((c) => {
              const durs = durationsForCat(c);
              if (durs.length === 0) return null;
              const prices = durs.map((d) => d.price);
              const min = Math.min(...prices);
              const max = Math.max(...prices);
              return (
                <button key={c} type="button" aria-pressed={selectedCategory === c} className={`cat-card${selectedCategory === c ? ' on' : ''}`} onClick={() => handleSelectCategory(c)}>
                  <span className="cat-card-main">
                    <b>{c}</b>
                    {categoryEn(c, data.serviceCategoryEn) ? <small className="cat-en">{categoryEn(c, data.serviceCategoryEn)}</small> : null}
                    <span className="cat-price num">฿ {min.toLocaleString()}{max !== min ? ` – ${max.toLocaleString()}` : ''}</span>
                  </span>
                  <span className="cat-card-arrow" aria-hidden="true">{selectedCategory === c ? '✓' : '›'}</span>
                </button>
              );
            })}
          </div>
          {visibleCats.length === 0 && <EmptyState title="ยังไม่มีรายการ" subtitle="เพิ่มรายการในหน้าจัดการร้าน" />}
          {selectedCategory && (
          <div className="stepnav">
            <button className="btn btn-primary btn-block" onClick={() => setStep(2)}>ถัดไป →</button>
          </div>
          )}
        </Card>
        </>
      )}

      {/* STEP 2: ระยะเวลา */}
      {step === 2 && selectedCategory && (
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
            <button className="btn btn-ghost fg1" onClick={() => { resetServicePick(); setStep(1); }}>← กลับ</button>
            <button className="btn btn-primary fg16" onClick={addPickedService} disabled={!selectedDuration}>ถัดไป →</button>
          </div>
        </Card>
      )}

      {/* STEP 3: หมอนวด (คนเดียวทั้งบิล) */}
      {step === 3 && pickedServices.length > 0 && (
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

      {/* STEP 4: เวลาเริ่มเดียวทั้งบิล */}
      {step === 4 && pickedServices.length > 0 && activeTherapistId && (
        <Card>
          <CardHead
            title="เลือกเวลาเริ่ม"
            hint={`${pickedServices.length} บริการ · ${activeTherapistName}`}
          />
          <div className="field">
            <label>เวลาเริ่ม</label>
            <div className="timepick-row">
              <TimeDropdown
                label="ชั่วโมง"
                sub="ชั่วโมง"
                value={selectedStartTime != null ? Math.floor(selectedStartTime / 60) : null}
                onChange={(h) => {
                  const curMin = selectedStartTime != null ? selectedStartTime % 60 : 0;
                  setSelectedStartTime(h * 60 + curMin);
                  setErr('');
                }}
                options={Array.from({ length: Math.floor(CLOSE_MIN / 60) - Math.floor(OPEN_MIN / 60) + 1 }, (_, i) => Math.floor(OPEN_MIN / 60) + i).map((h) => ({ v: h, l: String(h).padStart(2, '0') }))}
              />
              <span className="timepick-colon">:</span>
              <TimeDropdown
                label="นาที"
                sub="นาที"
                value={selectedStartTime != null ? selectedStartTime % 60 : 0}
                onChange={(m) => {
                  const curH = selectedStartTime != null ? Math.floor(selectedStartTime / 60) : Math.floor(OPEN_MIN / 60);
                  setSelectedStartTime(curH * 60 + m);
                  setErr('');
                }}
                options={(() => {
                  const cur = selectedStartTime != null ? selectedStartTime % 60 : 0;
                  const steps = Array.from({ length: 12 }, (_, i) => i * 5);
                  const opts = steps.includes(cur) ? steps : [...steps, cur].sort((a, b) => a - b);
                  return opts.map((m) => ({ v: m, l: String(m).padStart(2, '0') }));
                })()}
              />
            </div>
            {selectedStartTime != null && (
              <div className="tend-box full">จบ {billEnd != null ? minutesToTime(billEnd) : '—'} · รวม {formatDuration(billMinutes)}</div>
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
              <div className="r"><span>หมอ</span><b>{activeTherapistName}{therapistType === 'visiting' ? ' (หมอวิ่ง)' : ''}</b></div>
              {chained.map((p, i) => (
                <div key={p.key} className="r"><span>{i + 1}. {p.serviceName}</span><b>{minutesToTime(p.start)} – {minutesToTime(p.end)}</b></div>
              ))}
              <div className="r"><span>เวลารวม</span><b>{minutesToTime(selectedStartTime)} – {billEnd != null ? minutesToTime(billEnd) : '—'} · {formatDuration(billMinutes)}</b></div>
              <div className="r"><span>ราคา</span><b>฿ {subtotal.toLocaleString()}</b></div>
            </div>
          )}

          <div className="stepnav stepnav-3">
            <button className="btn btn-ghost fg09" onClick={() => setStep(looping ? 2 : 3)}>← กลับ</button>
            <button className="btn btn-ghost fg1" onClick={() => { setErr(''); setLooping(true); resetServicePick(); setStep(1); }}>
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
              right={<button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>+ เพิ่มบริการ</button>}
            />
            {pickedServices.length === 0 && <EmptyState title="ยังไม่มีบริการ" subtitle="กด '+ เพิ่มบริการ' เพื่อเริ่ม" />}
            {chained.map((p, idx) => (
              <div key={p.key} className="tline">
                <span className="q">{idx + 1}</span>
                <span className="tt">
                  <b>{p.serviceName}</b>
                  <small>{minutesToTime(p.start)}–{minutesToTime(p.end)}{(p.addons || []).length ? ` · +${p.addons.map((a) => `${a.name} ${a.minutes}น`).join(', ')}` : ''}</small>
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
                <div className="r"><span>หมอ</span><b>{activeTherapistName}{therapistType === 'visiting' ? ' (หมอวิ่ง)' : ''}</b></div>
                <div className="r"><span>รวมย่อย</span><b>฿ {subtotal.toLocaleString()}</b></div>
                <div className="r"><span>ส่วนลด{promoName ? ` (${promoName})` : ''}</span><b>−฿ {discVal.toLocaleString()}</b></div>
                <div className="r grand"><span><b>สุทธิ</b></span><b className="grand-total">฿ {total.toLocaleString()}</b></div>
                {therapistType === 'visiting' && (
                  <button type="button" className={`fuel-check${fuelChecked ? ' on' : ''}`} onClick={() => setFuelChecked(!fuelChecked)} aria-pressed={fuelChecked} aria-label="ค่าน้ำมันหมอวิ่ง 30 บาทต่อรอบ">
                    <span className="fuel-ic"><Fuel size={17} strokeWidth={1.9} /></span>
                    <span className="fuel-tx">ค่าน้ำมันหมอวิ่ง <b>+฿ 30/รอบ</b><small className="muted">รายจ่ายร้าน ไม่บวกในบิล</small></span>
                    <span className={`fuel-toggle${fuelChecked ? ' on' : ''}`} aria-hidden="true"><i /></span>
                  </button>
                )}
              </div>
              <button className="btn btn-primary btn-block mt4" onClick={openDraftBill} disabled={creating} aria-busy={creating}>
                <ReceiptText size={18} /> {creating ? 'กำลังเปิดบิล…' : `เปิดบิล · ฿ ${total.toLocaleString()}`}
              </button>
            </Card>
          )}
        </div>
      )}

    </div>
  );
}
