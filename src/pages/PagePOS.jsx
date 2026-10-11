import { useState, useMemo, useEffect, useRef } from 'react';
import { ReceiptText, Plus, Search, TriangleAlert, Trash2, ChevronDown, Check } from 'lucide-react';
import { Card, CardHead, EmptyState, formatDuration } from '../components/ui';
import { generateBillId, chainTimes } from '../data/demoData';

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

  // Step: 1=รายการ, 2=ระยะเวลา, 3=หมอ, 4=เวลา, 5=ตรวจสอบ
  const [step, setStep] = useState(1);

  // Step 1-2: บริการที่หยิบไว้ (หลายบริการได้ หมอคนเดียวทั้งบิล)
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [pickedServices, setPickedServices] = useState([]);

  // Step 3: หมอคนเดียวทั้งบิล
  const [selectedTherapist, setSelectedTherapist] = useState(null);
  // Step 4: เวลาเริ่มเดียวทั้งบิล (รายการถัดไปต่อคิวอัตโนมัติ)
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

  // Step 5
  const [paymentMethod] = useState('เงินสด');
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
      if (b.status === 'cancelled') return;
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

  // เข้าขั้น 4 แล้วเวลาชนคิว → ขยับไปช่วงว่างถัดไปให้เลย
  const snapGuard = useMemo(() => ({ doneFor: null }), []);
  useEffect(() => {
    if (step !== 4 || pickedServices.length === 0 || selectedStartTime == null) return;
    if (!timeError) return;
    const key = `${activeTherapistId}-${selectedStartTime}-${billMinutes}`;
    if (snapGuard.doneFor === key) return;
    snapGuard.doneFor = key;
    const next = nextFreeFrom(selectedStartTime);
    // eslint-disable-next-line no-use-before-define
    if (next != null) setSelectedStartTime(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

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
    setErr('');
  };

  // หยิบบริการที่เลือกเข้าบิล (หมอ/เวลาเลือกทีหลังครั้งเดียวทั้งบิล)
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
    setStep(1);
  };

  const removePickedService = (key) => {
    setPickedServices((prev) => prev.filter((p) => p.key !== key));
  };

  const validPick = pickedServices.length > 0 && activeTherapistId && selectedStartTime != null && !timeError;

  // เปิดบิลไว้ก่อน (ยังไม่เช็คบิล) — ไม่ต้องอนุมัติผู้จัดการ, สถานะ open
  const openDraftBill = () => {
    if (pickedServices.length === 0) { setErr('เพิ่มบริการอย่างน้อย 1 รายการก่อนเปิดบิล'); return; }
    if (!activeTherapistId) { setErr('เลือกหมอนวดก่อนเปิดบิล'); return; }
    if (selectedStartTime == null || timeError) { setErr('เลือกเวลาเริ่มให้ถูกต้องก่อนเปิดบิล'); return; }
    setErr('');
    openBill();
  };

  const openBill = () => {
    const id = generateBillId();
    const now = new Date();
    const times = chainTimes(selectedStartTime, pickedServices.map((p) => p.minutes || 0), BREAK_MINUTES);
    const endMin = times.length ? times[times.length - 1].end : selectedStartTime;
    const newBill = {
      id, date: now.toISOString(), customer: '', memberNo: '',
      // โมเดลใหม่: หมอ + เวลาเริ่ม/จบ ระดับบิล
      therapistId: activeTherapistId, therapistName: activeTherapistName,
      startTime: minutesToTime(selectedStartTime),
      endTime: minutesToTime(endMin),
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
      subtotal, discount: discVal, total, paymentMethod, status: 'open', createdAt: now.toISOString(),
      promotion: promoName || '',
    };
    saveData({
      ...data,
      bills: [...(data.bills || []), newBill],
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: now.toISOString(), user: 'ระบบ POS',
        action: 'เปิดบิล (รอเช็คบิล)', detail: `฿ ${total.toLocaleString()} · ${activeTherapistName} · ${pickedServices.length} บริการ`,
        oldValue: '-', newValue: 'open', approvedBy: '-',
      }],
    });
    setPickedServices([]); setDiscount(''); setPromoId('');
    resetAll();
    setStep(1);
    if (onNavigate) onNavigate('bills');
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
        <Card>
          <CardHead title="เลือกรายการ" hint={`${visibleCats.length} รายการ`} />
          {pickedServices.length > 0 && (
            <div className="field">
              <label>บริการที่เลือก ({pickedServices.length}) — ต่อกันอัตโนมัติ</label>
              {pickedServices.map((p, idx) => (
                <div key={p.key} className="tline">
                  <span className="q">{idx + 1}</span>
                  <span className="tt">
                    <b>{p.serviceName}</b>
                    <small>{formatDuration(p.minutes)}{(p.addons || []).length ? ` · +${p.addons.map((a) => `${a.name} ${a.minutes}น`).join(', ')}` : ''}</small>
                  </span>
                  <span className="qty">
                    <button onClick={() => removePickedService(p.key)} aria-label="ลบ"><Trash2 size={13} /></button>
                  </span>
                  <b style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>฿ {p.price.toLocaleString()}</b>
                </div>
              ))}
              <button className="btn btn-ghost btn-block" style={{ marginTop: 4 }} onClick={() => { setErr(''); setStep(3); }}>เลือกหมอ →</button>
            </div>
          )}
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
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { resetServicePick(); setStep(1); }}>← กลับ</button>
            <button className="btn btn-primary" style={{ flex: 1.6 }} onClick={addPickedService} disabled={!selectedDuration}><Plus size={16} /> เพิ่มบริการ{pickedServices.length > 0 ? ` (${pickedServices.length + 1})` : ''}</button>
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
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(1)}>← กลับ</button>
            <button className="btn btn-primary" style={{ flex: 1.6 }} onClick={() => setStep(4)} disabled={therapistType === 'visiting' ? !visitingName.trim() : !selectedTherapist}>ถัดไป →</button>
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
              <div className="r"><span>หมอ</span><b>{activeTherapistName}{therapistType === 'visiting' ? ' (หมอวิ่ง)' : ''}</b></div>
              {chained.map((p, i) => (
                <div key={p.key} className="r"><span>{i + 1}. {p.serviceName}</span><b>{minutesToTime(p.start)} – {minutesToTime(p.end)}</b></div>
              ))}
              <div className="r"><span>เวลารวม</span><b>{minutesToTime(selectedStartTime)} – {billEnd != null ? minutesToTime(billEnd) : '—'} · {formatDuration(billMinutes)}</b></div>
              <div className="r"><span>ราคา</span><b>฿ {subtotal.toLocaleString()}</b></div>
            </div>
          )}

          <div className="stepnav">
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(3)}>← กลับ</button>
            <button className="btn btn-primary" style={{ flex: 1.6 }} onClick={() => setStep(5)} disabled={!validPick}>ตรวจสอบ →</button>
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
              right={<button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => setStep(1)}>+ เพิ่มบริการ</button>}
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
                  <button onClick={() => removePickedService(p.key)} aria-label="ลบ"><Trash2 size={13} /></button>
                </span>
                <b style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>฿ {p.price.toLocaleString()}</b>
              </div>
            ))}
          </Card>

          {pickedServices.length > 0 && (
            <Card className="pos-side">
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
              <div className="summary-box">
                <div className="r"><span>หมอ</span><b>{activeTherapistName}{therapistType === 'visiting' ? ' (หมอวิ่ง)' : ''}</b></div>
                <div className="r"><span>รวมย่อย</span><b>฿ {subtotal.toLocaleString()}</b></div>
                <div className="r"><span>ส่วนลด{promoName ? ` (${promoName})` : ''}</span><b>−฿ {discVal.toLocaleString()}</b></div>
                <div className="r" style={{ fontSize: 15 }}><span><b>สุทธิ</b></span><b style={{ fontSize: 24 }}>฿ {total.toLocaleString()}</b></div>
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 4 }} onClick={openDraftBill}>
                <ReceiptText size={18} /> เปิดบิลไว้ก่อน · ฿ {total.toLocaleString()}
              </button>
              <p className="muted" style={{ marginTop: 8, fontSize: 11.5, textAlign: 'center' }}>ลูกค้าเข้านวดแล้วค่อยจ่ายทีหลังที่หน้าบิล เพิ่มบริการระหว่างนวดได้ที่นั่น</p>
            </Card>
          )}
        </div>
      )}

      {/* แถบบิลลัดไปตรวจสอบ — โผล่เมื่อมีบริการในบิลแล้ว (ยกเว้นอยู่หน้าตรวจสอบ) */}
      {pickedServices.length > 0 && step !== 5 && (
        <div className="cta-float" onClick={() => setStep(5)}>
          <span className="t"><b>฿ {total.toLocaleString()} · {pickedServices.length} บริการ</b><small>แตะเพื่อตรวจสอบก่อนเปิดบิล</small></span>
          <button onClick={(e) => { e.stopPropagation(); setStep(5); }}>ตรวจสอบ →</button>
        </div>
      )}
    </div>
  );
}
