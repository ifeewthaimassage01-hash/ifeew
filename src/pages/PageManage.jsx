import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, TriangleAlert, CheckCircle2, RotateCcw, X } from 'lucide-react';
import { Card, CardHead, EmptyState, Modal, alertDialog, confirmDialog, formatDuration } from '../components/ui';
import { DEFAULT_SERVICES, DEFAULT_CATEGORIES, commBaht } from '../data/demoData';
import { bkkNow } from '../utils/bkk';

function nextId(prefix, list) {
  let max = 0;
  (list || []).forEach((x) => {
    const m = String(x.id || '').match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

function pushAudit(data, action, detail, newValue) {
  return [...(data.auditLog || []), {
    id: `A-${Date.now()}`, timestamp: bkkNow(), user: 'เจ้าของร้าน',
    action, detail, oldValue: '-', newValue, approvedBy: 'เจ้าของร้าน',
  }];
}

const EMPTY_THERAPIST = { name: '', active: true };

/* ราคาต่อชมของรายการ = ราคา 60 นาที (ถ้ามี) ไม่งั้นเฉลี่ยจากตัวสั้นสุด */
function hourlyOf(rows) {
  const timed = rows.filter((s) => s.duration != null && s.duration > 0);
  if (timed.length === 0) return 0;
  const h60 = timed.find((s) => s.duration === 60);
  if (h60) return h60.price;
  const shortest = [...timed].sort((a, b) => a.duration - b.duration)[0];
  return Math.round((shortest.price / shortest.duration) * 60);
}

export default function PageManage({ data, saveData }) {
  const [tab, setTab] = useState('staff');
  const [err, setErr] = useState('');

  const [showT, setShowT] = useState(false);
  const [editingT, setEditingT] = useState(null);
  const [tForm, setTForm] = useState(EMPTY_THERAPIST);

  // ฟอร์มรายการ (รวมราคา): ชื่อ + ราคาต่อชม + ราคาและค่าแรง(บาท)แต่ละช่วงเวลา
  const [showC, setShowC] = useState(false);
  const [editingCat, setEditingCat] = useState(null); // null = เพิ่มใหม่
  const [cForm, setCForm] = useState({ name: '', prices: {}, comms: {} });
  const [customDur, setCustomDur] = useState('');

  const therapists = data.therapists || [];
  const services = data.services || [];
  const cats = data.serviceCategories || [];
  const addons = data.addons || [];

  // ฟอร์มบริการเสริม: ชื่อ + นาทีที่เพิ่ม + ราคา
  const [showA, setShowA] = useState(false);
  const [editingA, setEditingA] = useState(null);
  const [aForm, setAForm] = useState({ name: '', minutes: '30', price: '', active: true });

  const promos = data.promotions || [];

  // ฟอร์มโปรโมชัน: ชื่อ + ยอดส่วนลด
  const [showP, setShowP] = useState(false);
  const [editingP, setEditingP] = useState(null);
  const [pForm, setPForm] = useState({ name: '', amount: '', active: true });

  const catRows = useMemo(() => {
    return cats.map((c) => {
      const rows = services.filter((s) => s.category === c);
      const timed = rows.filter((s) => s.duration != null).sort((a, b) => a.duration - b.duration);
      return { name: c, rows, timed, hourly: hourlyOf(rows) };
    });
  }, [cats, services]);

  /* ---------- therapists (เดิม) ---------- */
  const openAddT = () => { setEditingT(null); setTForm(EMPTY_THERAPIST); setErr(''); setShowT(true); };
  const openEditT = (t) => { setEditingT(t); setTForm({ name: t.name, active: t.active !== false }); setErr(''); setShowT(true); };

  const saveT = () => {
    if (!tForm.name.trim()) { setErr('กรอกชื่อพนักงาน'); return; }
    setErr('');
    if (editingT) {
      saveData({
        ...data,
        therapists: therapists.map((t) => (t.id === editingT.id ? { ...t, name: tForm.name.trim(), nickname: '', active: tForm.active } : t)),
        auditLog: pushAudit(data, 'แก้ไขพนักงาน', `${editingT.id} · ${tForm.name.trim()}`, tForm.active ? 'ใช้งาน' : 'พักงาน'),
      });
      alertDialog({ title: `แก้ไข ${tForm.name.trim()} แล้ว` });
    } else {
      const id = nextId('T', therapists);
      saveData({
        ...data,
        therapists: [...therapists, { id, name: tForm.name.trim(), nickname: '', role: 'junior', active: true }],
        auditLog: pushAudit(data, 'เพิ่มพนักงาน', `${id} · ${tForm.name.trim()}`, 'ใช้งาน'),
      });
      alertDialog({ title: `เพิ่ม ${tForm.name.trim()} แล้ว`, message: `รหัสพนักงาน ${id}` });
    }
    setShowT(false);
  };

  const toggleT = (t) => {
    saveData({
      ...data,
      therapists: therapists.map((x) => (x.id === t.id ? { ...x, active: x.active === false } : x)),
      auditLog: pushAudit(data, t.active === false ? 'เปิดใช้งานพนักงาน' : 'พักงานพนักงาน', `${t.id} · ${t.name}`, t.active === false ? 'ใช้งาน' : 'พักงาน'),
    });
  };

  const deleteT = async (t) => {
    const ok = await confirmDialog({ title: `ลบ ${t.name}?`, message: 'ประวัติบิลเดิมยังเก็บชื่อไว้', confirmLabel: 'ลบเลย', danger: true });
    if (!ok) return;
    saveData({
      ...data,
      therapists: therapists.filter((x) => x.id !== t.id),
      auditLog: pushAudit(data, 'ลบพนักงาน', `${t.id} · ${t.name}`, 'ลบออก'),
    });
    alertDialog({ title: `ลบ ${t.name} แล้ว` });
  };

  /* ---------- รายการ + ราคาต่อชม ---------- */
  const openAddC = () => {
    setEditingCat(null);
    setCForm({ name: '', prices: {}, comms: {} });
    setCustomDur('');
    setErr(''); setShowC(true);
  };

  const openEditC = (catName) => {
    const rows = services.filter((s) => s.category === catName);
    const timed = rows.filter((s) => s.duration != null);
    const prices = {};
    const comms = {};
    timed.forEach((s) => { prices[s.duration] = String(s.price); comms[s.duration] = String(commBaht(s)); });
    setEditingCat(catName);
    setCForm({ name: catName, prices, comms });
    setCustomDur('');
    setErr(''); setShowC(true);
  };

  // ถังขยะ = ลบช่วงเวลานั้นทิ้งเกลี้ยง (ราคา+ค่าแรงหาย, ตัวเลือกเวลาหายไปด้วยถ้าเป็นเวลากำหนดเอง)
  const deleteDur = (d) => {
    setCForm((f) => {
      const next = { ...f.prices };
      const nextComm = { ...f.comms };
      delete next[d];
      delete nextComm[d];
      return { ...f, prices: next, comms: nextComm };
    });
  };

  // เพิ่มช่วงเวลาเอง (เช่น 180 นาที = 3 ชม) นอกเหนือจากปุ่มมาตรฐาน
  const addCustomDur = () => {
    const d = Math.round(Number(customDur));
    if (!Number.isFinite(d) || d <= 0) { setErr('กรอกจำนวนนาทีที่จะเพิ่ม (เช่น 180)'); return; }
    if (cForm.prices[d] != null) { setErr('มีช่วงเวลานี้แล้ว'); return; }
    setErr('');
    setCForm((f) => ({
      ...f,
      prices: { ...f.prices, [d]: '' },
      comms: { ...f.comms, [d]: '' },
    }));
    setCustomDur('');
  };

  const saveC = () => {
    const name = cForm.name.trim();
    if (!name) { setErr('กรอกชื่อรายการ'); return; }
    if (!editingCat && cats.includes(name)) { setErr('มีรายการนี้แล้ว'); return; }
    if (editingCat && name !== editingCat && cats.includes(name)) { setErr('มีรายการนี้แล้ว'); return; }
    const enabled = Object.keys(cForm.prices).map(Number);
    if (enabled.length === 0) { setErr('เลือกเวลาอย่างน้อย 1 ช่วง (เช่น 60 นาที)'); return; }
    for (const d of enabled) {
      if (cForm.prices[d] === '' || !Number.isFinite(Number(cForm.prices[d])) || Number(cForm.prices[d]) < 0) { setErr(`กรอกราคาของ ${formatDuration(d)} ให้ถูกต้อง`); return; }
    }
    const durs = enabled;
    setErr('');
    // ค่าแรงเป็นบาทต่อช่วงเวลา (ค่าว่าง = 0)
    const commOf = (d) => Math.max(0, Math.round(Number(cForm.comms[d]) || 0));

    let nextServices = [...services];
    let nextCats = [...cats];
    // เปลี่ยนชื่อรายการ: ย้าย services + cats ตาม
    if (editingCat && name !== editingCat) {
      nextCats = nextCats.map((c) => (c === editingCat ? name : c));
      nextServices = nextServices.map((s) => (s.category === editingCat ? { ...s, category: name } : s));
    }
    if (!editingCat) nextCats = [...nextCats, name];

    // sync ช่วงราคาในรายการให้ตรงกับช่วงเวลาที่เลือก
    const oldCat = editingCat || name;
    nextServices = nextServices.filter((s) => !(s.category === name && s.duration != null && !durs.includes(s.duration)));
    // ลบของชื่อเก่าที่เหลือค้าง (กรณีเปลี่ยนชื่อ)
    if (editingCat && name !== editingCat) {
      nextServices = nextServices.filter((s) => s.category !== oldCat || s.duration == null);
    }
    durs.forEach((d) => {
      const price = Number(cForm.prices[d]);
      const flatAmount = commOf(d);
      const flatRate = price > 0 ? Math.round((flatAmount / price) * 1000) / 1000 : 0;
      const found = nextServices.find((s) => s.category === name && s.duration === d);
      if (found) {
        nextServices = nextServices.map((s) => (s.id === found.id ? { ...s, price, flatRate, flatAmount } : s));
      } else {
        nextServices.push({ id: nextId('S', nextServices), category: name, price, duration: d, flatRate, flatAmount, tierCategory: found?.tierCategory || 'other' });
      }
    });

    saveData({
      ...data,
      services: nextServices,
      serviceCategories: nextCats,
      auditLog: pushAudit(data, editingCat ? 'แก้ไขรายการ' : 'เพิ่มรายการ', `${name} · ${durs.length} ช่วงเวลา`, durs.map((d) => `${formatDuration(d)} ฿ ${Number(cForm.prices[d]).toLocaleString()} (ค่าแรง ฿ ${commOf(d).toLocaleString()})`).join(' · ')),
    });
    setShowC(false);
    alertDialog({ title: `${editingCat ? 'แก้ไข' : 'เพิ่ม'}รายการ ${name} แล้ว`, message: durs.map((d) => `${formatDuration(d)} ฿ ${Number(cForm.prices[d]).toLocaleString()} (ค่าแรง ฿ ${commOf(d).toLocaleString()})`).join(' · ') });
  };

  const deleteC = async (cat) => {
    const ok = await confirmDialog({ title: `ลบรายการ ${cat}?`, message: 'ราคาในช่วงเวลานี้จะหายทั้งหมด · บิลเก่าไม่หาย', confirmLabel: 'ลบเลย', danger: true });
    if (!ok) return;
    saveData({
      ...data,
      services: services.filter((s) => s.category !== cat),
      serviceCategories: cats.filter((c) => c !== cat),
      auditLog: pushAudit(data, 'ลบรายการ', cat, 'ลบออก'),
    });
    alertDialog({ title: `ลบรายการ ${cat} แล้ว` });
  };

  const resetServices = async () => {
    const ok = await confirmDialog({ title: 'รีเซ็ตบริการเป็นค่าเริ่มต้น?', message: 'นวดไทย 1 ชม 350 / 1.5 ชม 500 / 2 ชม 650 · บิลเก่าไม่หาย', confirmLabel: 'รีเซ็ตเลย' });
    if (!ok) return;
    saveData({
      ...data,
      services: DEFAULT_SERVICES.map((s) => ({ ...s })),
      serviceCategories: [...DEFAULT_CATEGORIES],
      auditLog: pushAudit(data, 'รีเซ็ตบริการ', 'กลับเป็นค่าเริ่มต้นร้าน', `${DEFAULT_SERVICES.length} รายการ`),
    });
    alertDialog({ title: 'รีเซ็ตบริการแล้ว', message: `นวดไทย 1 ชม 350 / 1.5 ชม 500 / 2 ชม 650 · รวม ${DEFAULT_SERVICES.length} รายการ` });
  };

  /* ---------- บริการเสริม ---------- */
  const openAddA = () => { setEditingA(null); setAForm({ name: '', minutes: '30', price: '', active: true }); setErr(''); setShowA(true); };
  const openEditA = (a) => { setEditingA(a); setAForm({ name: a.name, minutes: String(a.minutes ?? 30), price: String(a.price ?? ''), active: a.active !== false }); setErr(''); setShowA(true); };

  const saveA = () => {
    if (!aForm.name.trim()) { setErr('กรอกชื่อบริการเสริม'); return; }
    if (aForm.minutes === '' || Number(aForm.minutes) <= 0) { setErr('กรอกนาทีที่เพิ่มให้ถูกต้อง'); return; }
    if (aForm.price === '' || Number(aForm.price) < 0) { setErr('กรอกราคาให้ถูกต้อง'); return; }
    setErr('');
    const payload = { name: aForm.name.trim(), minutes: Number(aForm.minutes), price: Number(aForm.price), active: aForm.active };
    if (editingA) {
      saveData({
        ...data,
        addons: addons.map((a) => (a.id === editingA.id ? { ...a, ...payload } : a)),
        auditLog: pushAudit(data, 'แก้ไขบริการเสริม', `${editingA.id} · ${payload.name}`, `+${payload.minutes}น ฿ ${payload.price.toLocaleString()}`),
      });
      alertDialog({ title: `แก้ไข ${payload.name} แล้ว` });
    } else {
      const id = nextId('A', addons);
      saveData({
        ...data,
        addons: [...addons, { id, ...payload }],
        auditLog: pushAudit(data, 'เพิ่มบริการเสริม', `${id} · ${payload.name}`, `+${payload.minutes}น ฿ ${payload.price.toLocaleString()}`),
      });
      alertDialog({ title: `เพิ่ม ${payload.name} แล้ว` });
    }
    setShowA(false);
  };

  const toggleA = (a) => {
    saveData({
      ...data,
      addons: addons.map((x) => (x.id === a.id ? { ...x, active: x.active === false } : x)),
      auditLog: pushAudit(data, a.active === false ? 'เปิดใช้บริการเสริม' : 'พักบริการเสริม', `${a.id} · ${a.name}`, a.active === false ? 'ใช้งาน' : 'พัก'),
    });
  };

  const deleteA = async (a) => {
    const ok = await confirmDialog({ title: `ลบ ${a.name}?`, message: 'บิลเก่าไม่หาย', confirmLabel: 'ลบเลย', danger: true });
    if (!ok) return;
    saveData({
      ...data,
      addons: addons.filter((x) => x.id !== a.id),
      auditLog: pushAudit(data, 'ลบบริการเสริม', `${a.id} · ${a.name}`, 'ลบออก'),
    });
    alertDialog({ title: `ลบ ${a.name} แล้ว` });
  };

  /* ---------- promotions ---------- */
  const openAddP = () => { setEditingP(null); setPForm({ name: '', amount: '', active: true }); setErr(''); setShowP(true); };
  const openEditP = (p) => { setEditingP(p); setPForm({ name: p.name, amount: String(p.amount ?? ''), active: p.active !== false }); setErr(''); setShowP(true); };

  const saveP = () => {
    if (!pForm.name.trim()) { setErr('กรอกชื่อโปรโมชัน'); return; }
    if (pForm.amount === '' || Number(pForm.amount) <= 0) { setErr('กรอกยอดส่วนลดให้ถูกต้อง'); return; }
    setErr('');
    const payload = { name: pForm.name.trim(), amount: Number(pForm.amount), active: pForm.active };
    if (editingP) {
      saveData({
        ...data,
        promotions: promos.map((p) => (p.id === editingP.id ? { ...p, ...payload } : p)),
        auditLog: pushAudit(data, 'แก้ไขโปรโมชัน', `${editingP.id} · ${payload.name}`, `−฿ ${payload.amount.toLocaleString()}`),
      });
      alertDialog({ title: `แก้ไข ${payload.name} แล้ว` });
    } else {
      const id = nextId('P', promos);
      saveData({
        ...data,
        promotions: [...promos, { id, ...payload }],
        auditLog: pushAudit(data, 'เพิ่มโปรโมชัน', `${id} · ${payload.name}`, `−฿ ${payload.amount.toLocaleString()}`),
      });
      alertDialog({ title: `เพิ่ม ${payload.name} แล้ว` });
    }
    setShowP(false);
  };

  const toggleP = (p) => {
    saveData({
      ...data,
      promotions: promos.map((x) => (x.id === p.id ? { ...x, active: x.active === false } : x)),
      auditLog: pushAudit(data, p.active === false ? 'เปิดใช้โปรโมชัน' : 'พักโปรโมชัน', `${p.id} · ${p.name}`, p.active === false ? 'ใช้งาน' : 'พัก'),
    });
  };

  const deleteP = async (p) => {
    const ok = await confirmDialog({ title: `ลบ ${p.name}?`, message: 'บิลเก่าไม่หาย', confirmLabel: 'ลบเลย', danger: true });
    if (!ok) return;
    saveData({
      ...data,
      promotions: promos.filter((x) => x.id !== p.id),
      auditLog: pushAudit(data, 'ลบโปรโมชัน', `${p.id} · ${p.name}`, 'ลบออก'),
    });
    alertDialog({ title: `ลบ ${p.name} แล้ว` });
  };

  // ช่วงเวลาในฟอร์ม = เฉพาะที่ผู้ใช้เพิ่มแล้ว เรียงน้อยไปมาก (ไม่โชว์ล่วงหน้า)
  const allDurs = Object.keys(cForm.prices).map(Number)
    .filter((d) => Number.isFinite(d) && d > 0)
    .sort((a, b) => a - b);

  return (
    <div>
      <div className="seg" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <button onClick={() => setTab('staff')} className={tab === 'staff' ? 'on' : ''}>พนักงาน ({therapists.length})</button>
        <button onClick={() => setTab('services')} className={tab === 'services' ? 'on' : ''}>รายการ ({cats.length})</button>
        <button onClick={() => setTab('promos')} className={tab === 'promos' ? 'on' : ''}>โปร ({promos.length})</button>
      </div>

      {err && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}

      {tab === 'staff' && (
        <Card>
          <CardHead title="รายชื่อพนักงาน" right={<button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddT}><Plus size={15} /> เพิ่มพนักงาน</button>} />
          {therapists.map((t) => (
            <div key={t.id} className="mrow">
              <span className="thera-ava" style={{ width: 42, height: 42, fontSize: 19 }}>{(t.name || '?').charAt(0)}</span>
              <span className="grow">
                <b style={{ fontSize: 13.5 }}>{t.name}</b>
                <span style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                  <span className={`badge ${t.active === false ? 'void' : 'neutral'}`}>{t.active === false ? 'พักงาน' : 'ใช้งาน'}</span>
                </span>
              </span>
              <button className={`toggle${t.active === false ? '' : ' on'}`} onClick={() => toggleT(t)} title="สลับสถานะ">{t.active === false ? 'พัก' : 'ใช้'}</button>
              <button className="icon-btn" onClick={() => openEditT(t)} aria-label={`แก้ไข ${t.name}`}><Pencil size={15} /></button>
              <button className="icon-btn danger" onClick={() => deleteT(t)} aria-label={`ลบ ${t.name}`}><Trash2 size={15} /></button>
            </div>
          ))}
          {therapists.length === 0 && <EmptyState title="ยังไม่มีพนักงาน" subtitle="กดเพิ่มพนักงาน" />}
          <p className="muted" style={{ marginTop: 10 }}>พนักงานที่พักงานจะไม่ขึ้นให้เลือกใน POS · ลบแล้วประวัติบิลเดิมยังเก็บชื่อไว้</p>
        </Card>
      )}

      {tab === 'services' && (
        <Card>
          <CardHead
            title="รายการ + ราคาต่อชม"
            hint="1 รายการ = หลายช่วงเวลา"
            right={<span style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={resetServices} title="กลับเป็นค่าเริ่มต้นร้าน"><RotateCcw size={15} /> รีเซ็ต</button>
              <button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddC}><Plus size={15} /> เพิ่มรายการ</button>
            </span>}
          />
          <p className="muted" style={{ marginBottom: 8 }}>ตั้ง<b>ราคาต่อชม</b>ครั้งเดียว ระบบเติมราคา 45/60/90/120 นาทีให้ แก้เองได้ทีหลัง · POS ดึงราคาจริงตามช่วงเวลา</p>
          {catRows.map(({ name, timed, hourly }) => (
            <div key={name} className="mcat-card">
              <div className="mcat-head">
                <b className="mcat-name">{name}</b>
                <span className="mcat-hourly">฿ {hourly.toLocaleString()}/ชม</span>
                <span className="mcat-actions">
                  <button className="icon-btn" onClick={() => openEditC(name)} aria-label={`แก้ไข ${name}`}><Pencil size={15} /></button>
                  <button className="icon-btn danger" onClick={() => deleteC(name)} aria-label={`ลบ ${name}`}><Trash2 size={15} /></button>
                </span>
              </div>
              {timed.length > 0 ? (
                <div className="mcat-grid">
                  <div className="mcat-row mcat-grid-head"><span>เวลา</span><span>ราคา</span><span>ค่าแรง</span></div>
                  {timed.map((s) => (
                    <div key={s.id} className="mcat-row">
                      <span>{formatDuration(s.duration)}</span>
                      <span>฿ {s.price.toLocaleString()}</span>
                      <span className="muted">฿ {commBaht(s).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <small className="muted">ยังไม่ตั้งราคา</small>
              )}
            </div>
          ))}
          {cats.length === 0 && <EmptyState title="ยังไม่มีรายการ" subtitle="กดเพิ่มรายการ" />}
        </Card>
      )}

      {tab === 'services' && (
        <Card>
          <CardHead
            title="บริการเสริม"
            hint="POS ขั้นระยะเวลา · +เงิน +เวลา"
            right={<button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddA}><Plus size={15} /> เพิ่มเสริม</button>}
          />
          <p className="muted" style={{ marginBottom: 8 }}>เช่น ประคบสมุนไพร +30 นาที ฿ 350 · เลือกได้หลายอย่างต่อลูกค้า 1 คน</p>
          {addons.map((a) => (
            <div key={a.id} className="mrow">
              <span className="grow">
                <b style={{ fontSize: 13.5 }}>{a.name}</b>
                <small className="muted" style={{ display: 'block' }}>+{a.minutes} นาที</small>
              </span>
              <b style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>+฿ {(a.price || 0).toLocaleString()}</b>
              <button className={`switch${a.active === false ? '' : ' on'}`} onClick={() => toggleA(a)} title={a.active === false ? 'แตะเพื่อเปิดใช้' : 'แตะเพื่อปิด'} aria-label={`สลับเปิดปิด ${a.name}`}><i /><span>{a.active === false ? 'ปิด' : 'เปิด'}</span></button>
              <button className="icon-btn" onClick={() => openEditA(a)} aria-label={`แก้ไข ${a.name}`}><Pencil size={15} /></button>
              <button className="icon-btn danger" onClick={() => deleteA(a)} aria-label={`ลบ ${a.name}`}><Trash2 size={15} /></button>
            </div>
          ))}
          {addons.length === 0 && <EmptyState title="ยังไม่มีบริการเสริม" subtitle="กดเพิ่มเสริม" />}
        </Card>
      )}

      {tab === 'promos' && (
        <Card>
          <CardHead
            title="โปรโมชันส่วนลด"
            hint="POS + แก้ไขบิล · เลือกแทนกรอกมือ"
            right={<button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddP}><Plus size={15} /> เพิ่มโปร</button>}
          />
          <p className="muted" style={{ marginBottom: 8 }}>เช่น โปรวันเกิด −฿ 500 · โปร 10 ครั้ง −฿ 300 · แตะ 1 โปรต่อ 1 บิล</p>
          {promos.map((p) => (
            <div key={p.id} className="mrow">
              <span className="grow">
                <b style={{ fontSize: 13.5 }}>{p.name}</b>
              </span>
              <b style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>−฿ {(p.amount || 0).toLocaleString()}</b>
              <button className={`toggle${p.active === false ? '' : ' on'}`} onClick={() => toggleP(p)} title="สลับสถานะ">{p.active === false ? 'พัก' : 'ใช้'}</button>
              <button className="icon-btn" onClick={() => openEditP(p)} aria-label={`แก้ไข ${p.name}`}><Pencil size={15} /></button>
              <button className="icon-btn danger" onClick={() => deleteP(p)} aria-label={`ลบ ${p.name}`}><Trash2 size={15} /></button>
            </div>
          ))}
          {promos.length === 0 && <EmptyState title="ยังไม่มีโปรโมชัน" subtitle="กดเพิ่มโปร" />}
        </Card>
      )}

      {showT && (
        <Modal onClose={() => { setShowT(false); setErr(''); }}>
          <button className="modal-x" onClick={() => { setShowT(false); setErr(''); }} aria-label="ปิด"><X size={16} /></button>
          <h3>{editingT ? `แก้ไข ${editingT.name}` : 'เพิ่มพนักงาน'}</h3>
          {err && <div className="err-banner" style={{ marginTop: 10 }}><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}
          <div className="field" style={{ marginTop: 12 }}><label>ชื่อ *</label><input value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder="เช่น คุณนิด" className="input" /></div>
          <div className="field"><label>สถานะ</label>
            <select value={tForm.active ? 'on' : 'off'} onChange={(e) => setTForm({ ...tForm, active: e.target.value === 'on' })} className="input">
              <option value="on">ใช้งาน</option><option value="off">พักงาน</option>
            </select>
          </div>
          <div className="modal-row">
            <button onClick={saveT} className="btn btn-primary" style={{ width: '100%' }}><CheckCircle2 size={16} /> บันทึก</button>
          </div>
        </Modal>
      )}

      {showC && (
        <Modal onClose={() => { setShowC(false); setErr(''); }}>
          <button className="modal-x" onClick={() => { setShowC(false); setErr(''); }} aria-label="ปิด"><X size={16} /></button>
          <h3>{editingCat ? `แก้ไข ${editingCat}` : 'เพิ่มรายการ'}</h3>
          {err && <div className="err-banner" style={{ marginTop: 10 }}><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}
          <div className="field" style={{ marginTop: 12 }}><label>ชื่อรายการ *</label><input value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} placeholder="เช่น นวดไทย" className="input" /></div>
          <div className="field"><label>เพิ่มช่วงเวลา (นาที) เช่น 3 ชม = 180</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min="1" value={customDur} onChange={(e) => setCustomDur(e.target.value)} placeholder="นาทีอื่น เช่น 180" className="input" style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="btn btn-ghost" style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '11px 14px' }} onClick={addCustomDur}><Plus size={15} /> เพิ่มเวลา</button>
            </div>
          </div>
          <div className="field"><label>ช่วงเวลาที่ขาย + ราคา + ค่าแรง (บาท)</label>
            {allDurs.length === 0 && <p className="muted" style={{ marginBottom: 8 }}>ยังไม่เพิ่มช่วงเวลา — กดปุ่มด้านบนหรือกรอกนาทีเอง</p>}
            {allDurs.map((d) => {
              return (
                <div key={d} className="dur-edit">
                  <div className="dur-edit-top">
                    <span className="toggle on">{formatDuration(d)}</span>
                    <button type="button" className="icon-btn danger" onClick={() => deleteDur(d)} aria-label={`ลบ ${formatDuration(d)}`}><Trash2 size={15} /></button>
                  </div>
                  <div className="dur-edit-grid">
                    <div className="field" style={{ marginBottom: 0 }}><label>ราคา (฿) *</label><input type="number" min="0" value={cForm.prices[d] ?? ''} onChange={(e) => setCForm({ ...cForm, prices: { ...cForm.prices, [d]: e.target.value } })} placeholder="เช่น 350" className="input" /></div>
                    <div className="field" style={{ marginBottom: 0 }}><label>ค่าแรง (฿)</label><input type="number" min="0" value={cForm.comms[d] ?? ''} onChange={(e) => setCForm({ ...cForm, comms: { ...cForm.comms, [d]: e.target.value } })} placeholder="0" className="input" /></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="modal-row">
            <button onClick={saveC} className="btn btn-primary" style={{ width: '100%' }}><CheckCircle2 size={16} /> บันทึก</button>
          </div>
        </Modal>
      )}
      {showA && (
        <Modal onClose={() => { setShowA(false); setErr(''); }}>
          <button className="modal-x" onClick={() => { setShowA(false); setErr(''); }} aria-label="ปิด"><X size={16} /></button>
          <h3>{editingA ? `แก้ไข ${editingA.name}` : 'เพิ่มบริการเสริม'}</h3>
          {err && <div className="err-banner" style={{ marginTop: 10 }}><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}
          <div className="field" style={{ marginTop: 12 }}><label>ชื่อบริการเสริม *</label><input value={aForm.name} onChange={(e) => setAForm({ ...aForm, name: e.target.value })} placeholder="เช่น ประคบสมุนไพร" className="input" /></div>
          <div className="f2">
            <div className="field"><label>เวลาที่เพิ่ม (นาที) *</label><input type="number" min="1" value={aForm.minutes} onChange={(e) => setAForm({ ...aForm, minutes: e.target.value })} placeholder="30" className="input" /></div>
            <div className="field"><label>ราคาที่บวก (฿) *</label><input type="number" min="0" value={aForm.price} onChange={(e) => setAForm({ ...aForm, price: e.target.value })} placeholder="350" className="input" /></div>
          </div>
          <div className="preset-row" style={{ marginTop: 0, marginBottom: 12 }}>
            {[10, 15, 20, 30, 45].map((m) => (
              <button key={m} type="button" className="preset-btn" onClick={() => setAForm((f) => ({ ...f, minutes: String(m) }))}>+{m} นาที</button>
            ))}
          </div>
          <div className="field"><label>สถานะ</label>
            <select value={aForm.active ? 'on' : 'off'} onChange={(e) => setAForm({ ...aForm, active: e.target.value === 'on' })} className="input">
              <option value="on">ใช้งาน</option><option value="off">พัก</option>
            </select>
          </div>
          <div className="modal-row">
            <button onClick={saveA} className="btn btn-primary" style={{ width: '100%' }}><CheckCircle2 size={16} /> บันทึก</button>
          </div>
        </Modal>
      )}
      {showP && (
        <Modal onClose={() => { setShowP(false); setErr(''); }}>
          <button className="modal-x" onClick={() => { setShowP(false); setErr(''); }} aria-label="ปิด"><X size={16} /></button>
          <h3>{editingP ? `แก้ไข ${editingP.name}` : 'เพิ่มโปรโมชัน'}</h3>
          {err && <div className="err-banner" style={{ marginTop: 10 }}><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}
          <div className="field" style={{ marginTop: 12 }}><label>ชื่อโปรโมชัน *</label><input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} placeholder="เช่น โปรวันเกิด" className="input" /></div>
          <div className="f2">
            <div className="field"><label>ยอดส่วนลด (฿) *</label><input type="number" min="1" value={pForm.amount} onChange={(e) => setPForm({ ...pForm, amount: e.target.value })} placeholder="500" className="input" /></div>
            <div className="field"><label>สถานะ</label>
              <select value={pForm.active ? 'on' : 'off'} onChange={(e) => setPForm({ ...pForm, active: e.target.value === 'on' })} className="input">
                <option value="on">ใช้งาน</option><option value="off">พัก</option>
              </select>
            </div>
          </div>
          <div className="preset-row" style={{ marginTop: 0, marginBottom: 12 }}>
            {[100, 200, 300, 500].map((m) => (
              <button key={m} type="button" className="preset-btn" onClick={() => setPForm((f) => ({ ...f, amount: String(m) }))}>฿ {m}</button>
            ))}
          </div>
          <div className="modal-row">
            <button onClick={saveP} className="btn btn-primary" style={{ width: '100%' }}><CheckCircle2 size={16} /> บันทึก</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
