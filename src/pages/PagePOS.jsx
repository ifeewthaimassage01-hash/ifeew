import { useState, useMemo, useEffect, useRef } from 'react';
import { ReceiptText, Plus, ShieldAlert, Banknote, QrCode, CheckCircle2, Search, TriangleAlert, Pencil, Trash2, ChevronDown, Check, X } from 'lucide-react';
import { Card, CardHead, EmptyState, Modal, formatDuration } from '../components/ui';
import { generateBillId } from '../data/demoData';

const PAY_METHODS = [
  { label: 'เงินสด', icon: Banknote },
  { label: 'QR Code / โอนเงิน', icon: QrCode },
];

const MGR_KEY = 'ifeew_mgr_ok';
const BREAK_MINUTES = 15;

function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/* เวลาปัจจุบัน (นาที) ปัดขึ้นเป็น 15 นาที — ตรงกับ grid เลือกเวลา */
function nowMinutes() {
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  return Math.ceil(m / 15) * 15;
}

function snap15(m) {
  return Math.round(m / 15) * 15;
}

const OPEN_MIN = 12 * 60;
const CLOSE_MIN = 23 * 60;
const GRID_STEP = 15;

/* Dropdown เวลาใบใหญ่ — ตัวเลขใหญ่ + ป้ายชั่วโมง/นาที เข้าธีมร้าน */
function TimeDropdown({ value, options, onChange, label, sub }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find((o) => o.v === value);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`dropdown timepick-dd${open ? ' open' : ''}`} ref={ref}>
      <button className="dropdown-btn timepick-btn" onClick={() => setOpen(!open)} type="button" aria-label={label}>
        <span className="timepick-val">{current?.l ?? '--'}</span>
        <span className="timepick-sub">{sub}</span>
        <ChevronDown size={16} className="dd-caret" />
      </button>
      {open && (
        <div className="dropdown-menu time-menu">
          {options.map((o) => (
            <button key={o.v} type="button" className={`dropdown-item${value === o.v ? ' on' : ''}`} onClick={() => { onChange(o.v); setOpen(false); }}>
              {o.l}
              {value === o.v && <Check size={14} className="dd-check" />}
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

  // Step: 1=รายการ, 2=เวลา+หมอ, 3=ยืนยัน
  const [step, setStep] = useState(1);

  // Step 1: รายการ (ไม่มีรายการย่อยแล้ว)
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Step 2: ระยะเวลา + หมอ + เวลา
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  const [selectedStartTime, setSelectedStartTime] = useState(null);
  const [therapistType, setTherapistType] = useState('resident'); // resident | visiting
  // หมอวิ่ง = พิมพ์ชื่อใช้เลย ไม่ต้องเพิ่มเข้าทะเบียน
  const [visitingName, setVisitingName] = useState('');
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

  // Step 3
  const [customers, setCustomers] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('เงินสด');
  const [customer, setCustomer] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [discount, setDiscount] = useState('');
  const [promoId, setPromoId] = useState('');
  const promosActive = (data.promotions || []).filter((p) => p.active !== false);
  const promoName = promosActive.find((p) => p.id === promoId)?.name || '';
  const selectPromo = (p) => {
    if (promoId === p.id) { setPromoId(''); setDiscount(''); }
    else { setPromoId(p.id); setDiscount(String(p.amount)); }
    setErr('');
  };

  const [showAuth, setShowAuth] = useState(false);
  const [authPass, setAuthPass] = useState('');
  const [authReason, setAuthReason] = useState('');
  const [rememberMgr, setRememberMgr] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [err, setErr] = useState('');
  const [successBill, setSuccessBill] = useState(null);

  // รายการที่จองได้ = มีบริการแบบมีระยะเวลา
  const bookableCats = useMemo(() => {
    const base = data.serviceCategories?.length ? data.serviceCategories : [...new Set(services.map((s) => s.category))];
    return base.filter((c) => services.some((s) => s.category === c && s.duration != null));
  }, [services, data.serviceCategories]);

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
  const addonMinutes = selectedAddons.reduce((s, id) => s + (addonsActive.find((a) => a.id === id)?.minutes || 0), 0);
  const addonPrice = selectedAddons.reduce((s, id) => s + (addonsActive.find((a) => a.id === id)?.price || 0), 0);
  const totalMinutes = (selectedDuration || 0) + addonMinutes;

  const bookedSlots = useMemo(() => {
    if (!activeTherapistId) return [];
    const slots = [];
    (data.bills || []).forEach((b) => {
      if (b.status === 'cancelled') return;
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

  // ตรวจเวลาที่ pick: อยู่ในเวลาเปิดร้าน + ไม่ชนคิว (รวมพัก)
  const timeError = useMemo(() => {
    if (selectedStartTime == null || !selectedDuration) return '';
    if (selectedStartTime < OPEN_MIN) return `ร้านเปิด ${minutesToTime(OPEN_MIN)} — เลือกเวลาหลังจากนั้น`;
    if (selectedStartTime + totalMinutes > CLOSE_MIN) return `เวลานี้จบเกิน ${minutesToTime(CLOSE_MIN)} — ร้านปิดแล้ว`;
    const clash = bookedSlots.some((s) => selectedStartTime < s.end && selectedStartTime + totalMinutes > s.start);
    if (clash) return 'เวลานี้ชนกับคิวที่จองแล้ว ลองขยับเวลา';
    return '';
  }, [selectedStartTime, selectedDuration, totalMinutes, bookedSlots]);

  // สถานะของ 1 ช่องเวลา: ว่าง / ชนคิว / เกินเวลาร้าน
  const slotState = (t) => {
    if (!selectedDuration) return 'oob';
    if (t < OPEN_MIN || t + totalMinutes > CLOSE_MIN) return 'oob';
    const clash = bookedSlots.some((s) => t < s.end && t + totalMinutes > s.start);
    return clash ? 'clash' : 'free';
  };

  // ช่วงว่างถัดไป (ละเอียด 15 นาที) นับจากเวลาฐาน — ใช้กับปุ่มแนะนำ + auto-snap
  const nextFreeFrom = (base) => {
    if (!selectedDuration) return null;
    const start = Math.max(snap15(base ?? nowMinutes()), OPEN_MIN);
    for (let t = start; t + totalMinutes <= CLOSE_MIN; t += GRID_STEP) {
      if (slotState(t) === 'free') return t;
    }
    return null;
  };

  // เข้าขั้น 4 โหมดเพิ่มใหม่แล้วเวลาชนคิว → ขยับไปช่วงว่างถัดไปให้เลย (โหมดแก้ไขไม่แตะค่าเดิม)
  const snapGuard = useMemo(() => ({ doneFor: null }), []);
  useEffect(() => {
    if (step !== 4 || editingIdx != null || !selectedDuration || selectedStartTime == null) return;
    if (!timeError) return;
    const key = `${activeTherapistId}-${selectedStartTime}-${totalMinutes}`;
    if (snapGuard.doneFor === key) return;
    snapGuard.doneFor = key;
    const next = nextFreeFrom(selectedStartTime);
    // eslint-disable-next-line no-use-before-define
    if (next != null) setSelectedStartTime(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const subtotal = customers.reduce((s, c) => s + c.price, 0);
  const discVal = Math.max(0, Math.min(subtotal, Number(discount) || 0));
  const total = subtotal - discVal;

  const resetPick = () => {
    setSelectedCategory(null);
    setSelectedDuration(null);
    setSelectedTherapist(null);
    setSelectedStartTime(null);
    setSelectedAddons([]);
    setVisitingName('');
    setTherapistType('resident');
  };

  const handleSelectCategory = (cat) => {
    if (selectedCategory !== cat) {
      setSelectedCategory(cat);
      setSelectedDuration(null);
      setSelectedTherapist(null);
      setSelectedAddons([]);
      // default = เวลาปัจจุบัน (clamp ในเวลาเปิดร้าน)
      setSelectedStartTime(Math.min(Math.max(nowMinutes(), OPEN_MIN), CLOSE_MIN - 30));
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
    setErr('');
  };

  const buildCustomer = () => {
    const matched = svcFor(selectedDuration);
    const pickedAddons = selectedAddons
      .map((id) => addonsActive.find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => ({ id: a.id, name: a.name, minutes: a.minutes, price: a.price }));
    const extraMin = pickedAddons.reduce((s, a) => s + (a.minutes || 0), 0);
    const extraPrice = pickedAddons.reduce((s, a) => s + (a.price || 0), 0);
    const mins = (selectedDuration || 0) + extraMin;
    return {
      id: Date.now(),
      serviceId: matched?.id || `${selectedCategory}-${selectedDuration}`,
      serviceName: `${selectedCategory} ${formatDuration(selectedDuration)}`,
      category: selectedCategory,
      duration: selectedDuration,
      addons: pickedAddons,
      addonMinutes: extraMin,
      totalMinutes: mins,
      startTime: minutesToTime(selectedStartTime),
      endTime: minutesToTime(selectedStartTime + mins),
      therapistId: activeTherapistId,
      therapistName: activeTherapistName,
      price: priceFor(selectedDuration) + extraPrice,
    };
  };

  const validPick = selectedCategory && selectedDuration && activeTherapistId && selectedStartTime != null && !timeError;

  const handleAddCustomer = () => {
    if (!validPick) { setErr('เลือกรายการ ระยะเวลา หมอ และเวลาให้ครบ'); return; }
    setErr('');
    setCustomers([...customers, buildCustomer()]);
    resetPick();
    setStep(1);
  };

  const handleAddAndCheckout = () => {
    if (!validPick) { setErr('เลือกรายการ ระยะเวลา หมอ และเวลาให้ครบ'); return; }
    setErr('');
    setCustomers([...customers, buildCustomer()]);
    resetPick();
    setStep(5);
  };

  const handleEditCustomer = (idx) => {
    const c = customers[idx];
    const isVisiting = c.therapistId && String(c.therapistId).startsWith('EXT-');
    setTherapistType(isVisiting ? 'visiting' : 'resident');
    setVisitingName(isVisiting ? (c.therapistName || '') : '');
    setSelectedCategory(c.category);
    setSelectedDuration(c.duration);
    setSelectedTherapist(c.therapistId);
    setSelectedStartTime(timeToMinutes(c.startTime));
    setSelectedAddons((c.addons || []).map((a) => a.id));
    setEditingIdx(idx);
    setStep(2);
  };

  const handleUpdateCustomer = () => {
    if (!validPick) { setErr('เลือกรายการ ระยะเวลา หมอ และเวลาให้ครบ'); return; }
    setErr('');
    const next = [...customers];
    next[editingIdx] = { ...buildCustomer(), id: customers[editingIdx].id };
    setCustomers(next);
    setEditingIdx(null);
    resetPick();
    setStep(5);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    resetPick();
    setStep(5);
  };

  const handleRemoveCustomer = (idx) => {
    setCustomers(customers.filter((_, i) => i !== idx));
  };

  const startCheckout = () => {
    if (customers.length === 0) { setErr('เพิ่มลูกค้าอย่างน้อย 1 คนก่อนเปิดบิล'); return; }
    setErr('');
    try {
      if (sessionStorage.getItem(MGR_KEY) === '1') { openBill('จำรหัสในกะนี้', 'paid'); return; }
    } catch { /* ignore */ }
    setAuthErr('');
    setShowAuth(true);
  };

  // เปิดบิลไว้ก่อน (ยังไม่เช็คบิล) — ไม่ต้องอนุมัติผู้จัดการ, สถานะ open
  const openDraftBill = () => {
    if (customers.length === 0) { setErr('เพิ่มลูกค้าอย่างน้อย 1 คนก่อนเปิดบิล'); return; }
    setErr('');
    openBill('เปิดบิลรอเช็คบิล', 'open');
  };

  const openBill = (reason, status = 'paid') => {
    const id = generateBillId();
    const now = new Date();
    const isOpen = status === 'open';
    const newBill = {
      id, date: now.toISOString(), customer, memberNo,
      customers: customers.map((c) => ({ ...c })),
      // mirror ให้หน้ารายงานเก่า (ประวัติ/ปิดวัน/ค่าแรง) ที่อ่าน b.items ทำงานได้
      items: customers.map((c) => ({
        serviceId: c.serviceId,
        serviceName: (c.addons || []).length ? `${c.serviceName} + ${(c.addons || []).map((a) => a.name).join(', ')}` : c.serviceName,
        category: c.category,
        therapistId: c.therapistId, therapistName: c.therapistName,
        qty: 1, price: c.price, discount: 0, net: c.price,
        duration: c.totalMinutes || c.duration, startTime: c.startTime,
      })),
      subtotal, discount: discVal, total, paymentMethod, status, createdAt: now.toISOString(),
      promotion: promoName || '',
    };
    saveData({
      ...data,
      bills: [...(data.bills || []), newBill],
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: now.toISOString(), user: 'ระบบ POS',
        action: isOpen ? 'เปิดบิล (รอเช็คบิล)' : 'สร้างบิล', detail: `${customer || 'ลูกค้าหน้าร้าน'} · ฿ ${total.toLocaleString()} · ${isOpen ? 'ยังไม่ชำระ' : paymentMethod} · ${customers.length} ลูกค้า`,
        oldValue: '-', newValue: status, approvedBy: isOpen ? '-' : (reason || '-'),
      }],
    });
    setSuccessBill({ total, count: customers.length, status, customer });
    setCustomers([]); setCustomer(''); setMemberNo(''); setDiscount(''); setPromoId('');
    resetPick();
    setEditingIdx(null); setStep(1);
    setShowAuth(false); setAuthPass(''); setAuthReason(''); setAuthErr(''); setRememberMgr(false);
  };

  const confirmAuth = () => {
    if (authPass !== '123123') { setAuthErr('รหัสไม่ถูกต้อง (ตัวอย่าง: 123123)'); return; }
    if (!authReason.trim()) { setAuthErr('กรุณาระบุเหตุผลสั้น ๆ'); return; }
    if (rememberMgr) { try { sessionStorage.setItem(MGR_KEY, '1'); } catch { /* ignore */ } }
    openBill(authReason, 'paid');
  };

  return (
    <div>
      {err && <div className="err-banner"><TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {err}</div>}

      <div className="steps">
        {[
          { n: 1, label: 'รายการ' },
          { n: 2, label: 'ระยะเวลา' },
          { n: 3, label: 'หมอนวด' },
          { n: 4, label: 'เวลา' },
          { n: 5, label: `ตรวจสอบ${customers.length > 0 ? ` (${customers.length})` : ''}` },
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
                <button key={c} className={`cat-card${selectedCategory === c ? ' on' : ''}`} onClick={() => handleSelectCategory(c)}>
                  <span className="cat-card-main">
                    <b>{c}</b>
                    <small>{durs.map((d) => formatDuration(d.duration)).join(' · ')} · ฿ {min.toLocaleString()}{max !== min ? `–${max.toLocaleString()}` : ''}</small>
                  </span>
                  <span className="cat-card-arrow">{selectedCategory === c ? '✓' : '›'}</span>
                </button>
              );
            })}
          </div>
          {visibleCats.length === 0 && <EmptyState title="ยังไม่มีรายการ" subtitle="เพิ่มรายการในหน้าจัดการร้าน" />}
          <div className="stepnav">
            <button className="btn btn-primary btn-block" onClick={() => setStep(2)} disabled={!selectedCategory}>ถัดไป →</button>
          </div>
        </Card>
      )}

      {/* STEP 2: ระยะเวลา */}
      {step === 2 && selectedCategory && (
        <Card>
          <CardHead
            title={editingIdx != null ? 'แก้ไขรายการ' : selectedCategory}
            hint="เลือกระยะเวลา"
            right={editingIdx != null ? (<button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={cancelEdit}>ยกเลิก</button>) : null}
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
            <div className="field" style={{ marginTop: 12 }}>
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
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { editingIdx != null ? cancelEdit() : (resetPick(), setStep(1)); }}>← กลับ</button>
            <button className="btn btn-primary" style={{ flex: 1.6 }} onClick={() => setStep(3)} disabled={!selectedDuration}>ถัดไป →</button>
          </div>
        </Card>
      )}

      {/* STEP 3: หมอนวด */}
      {step === 3 && selectedCategory && (
        <Card>
          <CardHead
            title="เลือกหมอนวด"
            hint={`${selectedCategory} · ${selectedDuration ? formatDuration(selectedDuration) : ''}`}
            right={editingIdx != null ? (<button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={cancelEdit}>ยกเลิก</button>) : null}
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
                      <span className="thera-ava">{(th.nickname || th.name || '?').charAt(0)}</span>
                      <span><b>{th.name}</b><small>{th.nickname} · {th.role === 'senior' ? 'อาวุโส' : 'รุ่นใหม่'}</small></span>
                      <span className="pick">{active ? '✓ เลือกแล้ว' : 'แตะเลือก'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="field" style={{ marginBottom: 0 }}>
                <div className="search-wrap">
                  <Search size={16} />
                  <input
                    value={visitingName}
                    onChange={(e) => { setVisitingName(e.target.value); setErr(''); }}
                    placeholder="พิมพ์ชื่อหมอวิ่ง… เช่น หมอนิด"
                    className="input"
                  />
                </div>
                <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>พิมพ์ชื่อแล้วกดถัดไปได้เลย ไม่ต้องเพิ่มเข้าทะเบียน</p>
              </div>
            )}
          <div className="stepnav">
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { editingIdx != null ? cancelEdit() : setStep(2); }}>← กลับ</button>
            <button className="btn btn-primary" style={{ flex: 1.6 }} onClick={() => setStep(4)} disabled={therapistType === 'visiting' ? !visitingName.trim() : !selectedTherapist}>ถัดไป →</button>
          </div>
        </Card>
      )}

      {/* STEP 4: เวลาเริ่ม */}
      {step === 4 && selectedCategory && selectedDuration && activeTherapistId && (
        <Card>
          <CardHead
            title={editingIdx != null ? 'แก้ไขรายการ' : 'เลือกเวลาเริ่ม'}
            hint={`${selectedCategory} · ${formatDuration(selectedDuration)} · ${activeTherapistName}`}
            right={editingIdx != null ? (<button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={cancelEdit}>ยกเลิก</button>) : null}
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
              <div className="tend-box full">จบ {minutesToTime(selectedStartTime + totalMinutes)} · รวม {formatDuration(totalMinutes)}</div>
            )}
            {timeError ? (
              <div className="alert warn" style={{ marginTop: 8 }}>{timeError}
                {(() => {
                  const nf = nextFreeFrom(selectedStartTime ?? nowMinutes());
                  return nf != null ? (
                    <button type="button" className="preset-btn" style={{ marginLeft: 8 }} onClick={() => setSelectedStartTime(nf)}>
                      ใช้ {minutesToTime(nf)}
                    </button>
                  ) : null;
                })()}
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>พักเตรียมห้อง {BREAK_MINUTES} นาทีหลังจบงานโดยอัตโนมัติ</p>
            )}
          </div>

          {validPick && (
            <div className="summary-box">
              <div className="r"><span>บริการ</span><b>{selectedCategory} {formatDuration(selectedDuration)}</b></div>
              {(selectedAddons.map((id) => addonsActive.find((a) => a.id === id)).filter(Boolean)).map((a) => (
                <div key={a.id} className="r"><span>+ {a.name} (+{a.minutes} นาที)</span><b>+฿ {a.price.toLocaleString()}</b></div>
              ))}
              <div className="r"><span>หมอ</span><b>{activeTherapistName}{therapistType === 'visiting' ? ' (หมอวิ่ง)' : ''}</b></div>
              <div className="r"><span>เวลา</span><b>{minutesToTime(selectedStartTime)} – {minutesToTime(selectedStartTime + totalMinutes)} · รวม {formatDuration(totalMinutes)}</b></div>
              <div className="r"><span>ราคา</span><b>฿ {(priceFor(selectedDuration) + addonPrice).toLocaleString()}</b></div>
            </div>
          )}

          <div className="stepnav stepnav-3">
            <button className="btn btn-ghost" style={{ flex: 0.9 }} onClick={() => { editingIdx != null ? cancelEdit() : setStep(3); }}>← กลับ</button>
            {editingIdx != null ? (
              <button className="btn btn-primary" style={{ flex: 1.6 }} onClick={handleUpdateCustomer}>อัปเดตรายการ</button>
            ) : (
              <>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleAddCustomer} disabled={!validPick}>
                  <Plus size={16} /> เพิ่ม
                </button>
                <button className="btn btn-primary" style={{ flex: 1.1 }} onClick={handleAddAndCheckout} disabled={!validPick}>
                  เปิดบิล →
                </button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* STEP 5: ตรวจสอบ + ชำระเงิน */}
      {step === 5 && (
        <div className="pos-grid">
          <Card>
            <CardHead
              title="รายการในบิล"
              hint={`${customers.length} ลูกค้า`}
              right={<button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => setStep(1)}>+ เพิ่มลูกค้า</button>}
            />
            {customers.length === 0 && <EmptyState title="ยังไม่มีลูกค้า" subtitle="กด '+ เพิ่มลูกค้า' เพื่อเริ่ม" />}
            {customers.map((c, idx) => (
              <div key={c.id} className="tline">
                <span className="q">{idx + 1}</span>
                <span className="tt">
                  <b>{c.serviceName}</b>
                  <small>{c.therapistName} · {c.startTime}–{c.endTime}{(c.addons || []).length ? ` · +${c.addons.map((a) => `${a.name} ${a.minutes}น`).join(', ')}` : ''}</small>
                </span>
                <span className="qty">
                  <button onClick={() => handleEditCustomer(idx)} aria-label="แก้ไข"><Pencil size={13} /></button>
                  <button onClick={() => handleRemoveCustomer(idx)} aria-label="ลบ"><Trash2 size={13} /></button>
                </span>
                <b style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>฿ {c.price.toLocaleString()}</b>
              </div>
            ))}
          </Card>

          {customers.length > 0 && (
            <Card className="pos-side">
              <div className="f2">
                <div className="field" style={{ marginBottom: 8 }}><label>ชื่อลูกค้า</label><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="ไม่บังคับ" className="input" /></div>
                <div className="field" style={{ marginBottom: 8 }}><label>สมาชิก</label><input value={memberNo} onChange={(e) => setMemberNo(e.target.value)} placeholder="M-xxxx" className="input" /></div>
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>โปรโมชันส่วนลด</label>
                {promosActive.length > 0 ? (
                  <div className="preset-row" style={{ marginTop: 0 }}>
                    {promosActive.map((p) => (
                      <button key={p.id} type="button" className={`preset-btn${promoId === p.id ? ' on' : ''}`} style={promoId === p.id ? { background: 'var(--brown-950)', color: '#fff', borderColor: 'var(--brown-950)' } : null} onClick={() => selectPromo(p)}>{p.name} −฿ {p.amount.toLocaleString()}</button>
                    ))}
                    {promoId && <button type="button" className="preset-btn" onClick={() => { setPromoId(''); setDiscount(''); }}>ไม่ใช้โปร</button>}
                  </div>
                ) : (
                  <p className="muted">ยังไม่มีโปรโมชัน — เพิ่มได้ในหน้าจัดการร้าน</p>
                )}
              </div>
              <div className="field"><label>ชำระโดย <span className="muted">(ใช้ตอนเช็คบิล — ถ้าเปิดบิลไว้ก่อนยังไม่ต้องเลือกก็ได้)</span></label>
                <div className="pay-grid">
                  {PAY_METHODS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button key={m.label} onClick={() => setPaymentMethod(m.label)} className={`pay-card${paymentMethod === m.label ? ' on' : ''}`}>
                        <Icon size={17} /><span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="summary-box">
                <div className="r"><span>รวมย่อย</span><b>฿ {subtotal.toLocaleString()}</b></div>
                <div className="r"><span>ส่วนลด{promoName ? ` (${promoName})` : ''}</span><b>−฿ {discVal.toLocaleString()}</b></div>
                <div className="r" style={{ fontSize: 15 }}><span><b>สุทธิ</b></span><b style={{ fontSize: 24 }}>฿ {total.toLocaleString()}</b></div>
              </div>
              <div className="modal-row" style={{ marginTop: 4 }}>
                <button className="btn btn-ghost" style={{ width: '100%' }} onClick={openDraftBill}>
                  <ReceiptText size={18} /> เปิดบิลไว้ก่อน
                </button>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={startCheckout}>
                  เช็คบิลเลย · ฿ {total.toLocaleString()}
                </button>
              </div>
              <p className="muted" style={{ marginTop: 8, fontSize: 11.5, textAlign: 'center' }}>เปิดบิลไว้ก่อน = ลูกค้าเข้านวดแล้วค่อยจ่ายทีหลัง เพิ่มบริการระหว่างนวดได้ที่หน้าประวัติบิล</p>
            </Card>
          )}
        </div>
      )}

      {/* แถบบิลลัดไปตรวจสอบ — โผล่เมื่อมีลูกค้าในบิลแล้ว (ยกเว้นอยู่หน้าตรวจสอบ) */}
      {customers.length > 0 && step !== 5 && !showAuth && !successBill && (
        <div className="cta-float" onClick={() => setStep(5)}>
          <span className="t"><b>฿ {total.toLocaleString()} · {customers.length} ลูกค้า</b><small>แตะเพื่อตรวจสอบ + ชำระเงิน</small></span>
          <button onClick={(e) => { e.stopPropagation(); setStep(5); }}>ตรวจสอบ →</button>
        </div>
      )}

      {showAuth && (
        <Modal onClose={() => { setShowAuth(false); setAuthPass(''); setAuthReason(''); setAuthErr(''); }}>
          <button className="modal-x" onClick={() => { setShowAuth(false); setAuthPass(''); setAuthReason(''); setAuthErr(''); }} aria-label="ปิด"><X size={16} /></button>
          <div className="pagehead-main" style={{ marginBottom: 8 }}>
            <div className="pagehead-icon"><ShieldAlert size={22} /></div>
            <div><h3>ยืนยันเปิดบิล</h3><p className="muted">ยอด ฿ {total.toLocaleString()} · {paymentMethod} · {customers.length} ลูกค้า</p></div>
          </div>
          {authErr && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {authErr}</div>}
          <div className="field"><label>รหัสผ่านผู้จัดการ</label><input type="password" value={authPass} onChange={(e) => { setAuthPass(e.target.value); setAuthErr(''); }} placeholder="123123" className="input" /></div>
          <div className="field"><label>หมายเหตุ (บังคับ)</label><textarea value={authReason} onChange={(e) => { setAuthReason(e.target.value); setAuthErr(''); }} placeholder="เช่น รับเงินสดครบถ้วน" className="input" rows={2} /></div>
          <label className="mgr-remember"><input type="checkbox" checked={rememberMgr} onChange={(e) => setRememberMgr(e.target.checked)} /> จำรหัสในกะนี้</label>
          <div className="modal-row">
            <button onClick={confirmAuth} disabled={!authReason.trim() || !authPass} className="btn btn-primary" style={{ width: '100%' }}>ยืนยันเปิดบิล</button>
          </div>
        </Modal>
      )}

      {successBill && (
        <Modal onClose={() => setSuccessBill(null)}>
          <button className="modal-x" onClick={() => setSuccessBill(null)} aria-label="ปิด"><X size={16} /></button>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div className="empty-ic" style={{ background: '#f7f0e5', color: '#b0885f', width: 66, height: 66 }}><CheckCircle2 size={32} /></div>
            <h3 style={{ fontSize: 27 }}>{successBill.status === 'open' ? 'เปิดบิลไว้แล้ว' : 'เช็คบิลสำเร็จ'}</h3>
            <div className="muted" style={{ marginTop: 4 }}>{successBill.customer || 'ลูกค้าหน้าร้าน'}</div>
            <div style={{ fontSize: 44, color: 'var(--brown)', fontVariantNumeric: 'tabular-nums' }}>฿ {successBill.total.toLocaleString()}</div>
            <div className="muted" style={{ marginTop: 4 }}>{successBill.count} ลูกค้า{successBill.status === 'open' ? ' · รอเช็คบิลหลังนวดเสร็จ' : ''}</div>
            <div className="modal-row">
              <button onClick={() => setSuccessBill(null)} className="btn btn-ghost" style={{ width: '100%' }}>เปิดบิลต่อ</button>
              <button onClick={() => { setSuccessBill(null); onNavigate && onNavigate('bills'); }} className="btn btn-primary" style={{ width: '100%' }}>{successBill.status === 'open' ? 'ดูบิลที่เปิดอยู่' : 'ดูบิล'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
