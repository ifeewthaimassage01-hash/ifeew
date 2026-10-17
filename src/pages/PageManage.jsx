import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Plus, Pencil, Trash2, TriangleAlert, CheckCircle2, X, ChevronUp, ChevronDown, ArrowUpDown, GripVertical, KeyRound, Users, LayoutGrid, Tag, ShieldCheck, Bell, BellOff } from 'lucide-react';
import { Card, CardHead, EmptyState, Modal, alertDialog, confirmDialog, formatDuration } from '../components/ui';
import { commBaht, categoryEn, serviceCategoryOrder, guaranteeAmountOf } from '../lib/billing';
import { getOwnerPass } from '../lib/auth';
import { bkkNow } from '../utils/bkk';
import { isPushSupported, getSubscription, subscribeOwner, unsubscribeOwner } from '../lib/push';
import { deleteCategoryFromCloud, deleteTherapistFromCloud, deleteAddonFromCloud, deletePromoFromCloud, syncState } from '../data/cloudSync';

// ลบใน cloud ไม่สำเร็จ = ของจะโผล่กลับมาตอนโหลดใหม่ จึงต้องเตือนให้รู้
// คืน true ถ้าลบสำเร็จ / false ถ้าล้ม (caller ใช้ตัดสินใจ rollback — ไม่ saveData ต่อ)
async function mustDeleteCloud(fn, label) {
  try {
    await fn();
    return true;
  } catch {
    alertDialog({ title: `ลบในเครื่องแล้ว แต่ลบใน cloud ไม่สำเร็จ`, message: `${label} อาจโผล่กลับมา — เช็กเน็ตแล้วลบอีกครั้ง` });
    return false;
  }
}

// C4-delrace: ลบ cloud ก่อน (กัน realtime ทับด้วย syncState.pending) แล้วค่อย saveData local —
// ล้มให้ rollback (คง state เดิม) + คง alert เดิมผ่าน mustDeleteCloud
async function deleteCloudFirst(deleteFn, label, applyLocal, successMsg) {
  syncState.pending += 1;
  try {
    const ok = await mustDeleteCloud(deleteFn, label);
    if (!ok) return; // rollback: ไม่แตะ state เดิม
    applyLocal();
    if (successMsg) alertDialog(successMsg);
  } finally {
    syncState.pending -= 1;
    syncState.lastDone = Date.now();
  }
}

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

/* การ์ดแจ้งเตือนแอดมิน (Web Push) — หน้านี้ owner-only อยู่แล้ว ไม่ต้อง gate เพิ่ม */
function PushAdminCard() {
  const supported = isPushSupported();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let alive = true;
    getSubscription().then((s) => { if (alive) setOn(!!s); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const enable = async () => {
    setBusy(true); setMsg('');
    try {
      await subscribeOwner();
      setOn(true);
      setMsg('เปิดแจ้งเตือนแล้ว เครื่องนี้จะได้รับบิลใหม่ + สรุปรายวัน');
    } catch (e) {
      setMsg(e?.message || 'เปิดแจ้งเตือนไม่สำเร็จ');
    } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true); setMsg('');
    try {
      await unsubscribeOwner();
      setOn(false);
      setMsg('ปิดแจ้งเตือนของเครื่องนี้แล้ว');
    } catch (e) {
      setMsg(e?.message || 'ปิดแจ้งเตือนไม่สำเร็จ');
    } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHead
        title="แจ้งเตือนแอดมิน"
        right={supported
          ? (on ? <span className="badge paid">เปิดอยู่</span> : <span className="badge neutral">ปิดอยู่</span>)
          : <span className="badge void">ไม่รองรับ</span>}
      />
      <p className="muted" style={{ margin: '0 0 10px' }}>
        {supported
          ? (on ? 'เครื่องนี้รับแจ้งเตือนบิลใหม่ + สรุปรายวันแล้ว' : 'เปิดไว้เพื่อรับแจ้งเตือนบิลใหม่ + สรุปรายวันบนเครื่องนี้')
          : 'เบราว์เซอร์นี้ไม่รองรับ Push (ลอง Chrome / Edge / Safari ล่าสุด)'}
      </p>
      {supported && (
        on
          ? <button onClick={disable} disabled={busy} className="btn btn-ghost btn-block"><BellOff size={16} /> {busy ? 'กำลังปิด…' : 'ปิดแจ้งเตือนเครื่องนี้'}</button>
          : <button onClick={enable} disabled={busy} className="btn btn-primary btn-block"><Bell size={16} /> {busy ? 'กำลังเปิด…' : 'เปิดแจ้งเตือน'}</button>
      )}
      {msg && <p className="muted" style={{ margin: '8px 0 0' }}>{msg}</p>}
      <p className="muted" style={{ margin: '8px 0 0' }}>iOS ต้องติดตั้งแอปลงหน้าจอหลักก่อน</p>
    </Card>
  );
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
  const [cForm, setCForm] = useState({ name: '', nameEn: '', prices: {}, comms: {} });
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

  // ฟอร์มเปลี่ยนรหัสเจ้าของร้าน — เก็บใน app_settings ผ่าน saveData ปกติ
  const [ownerForm, setOwnerForm] = useState({ cur: '', next: '', confirm: '' });

  // ยอดประกันมือหมอประจำ/วัน — number input บันทึกผ่าน saveData + audit (owner only ทั้งหน้า)
  const [gAmt, setGAmt] = useState('');
  const saveGuarantee = () => {
    const n = Math.round(Number(gAmt));
    if (!Number.isFinite(n) || n <= 0) { setErr('กรอกยอดประกันมือให้ถูกต้อง (ต้องมากกว่า 0)'); return; }
    setErr('');
    saveData({
      ...data,
      guaranteeAmount: n,
      auditLog: pushAudit(data, 'เปลี่ยนยอดประกันมือ', `ยอดประกันมือ/วัน`, `฿ ${guaranteeAmountOf(data).toLocaleString()} → ฿ ${n.toLocaleString()}`),
    });
    setGAmt('');
    alertDialog({ title: 'เปลี่ยนยอดประกันมือแล้ว', message: `เช็กชื่อ = ได้ครบ ฿ ${n.toLocaleString()}/วัน` });
  };

  const saveOwnerPass = () => {
    const real = getOwnerPass(data.ownerPass);
    if (ownerForm.cur !== real) { setErr('รหัสเจ้าของร้านปัจจุบันไม่ถูกต้อง'); return; }
    if (!ownerForm.next || ownerForm.next.length < 4) { setErr('รหัสใหม่ต้องยาวอย่างน้อย 4 ตัว'); return; }
    if (ownerForm.next !== ownerForm.confirm) { setErr('รหัสใหม่กับยืนยันไม่ตรงกัน'); return; }
    setErr('');
    saveData({
      ...data,
      ownerPass: ownerForm.next,
      auditLog: pushAudit(data, 'เปลี่ยนรหัสเจ้าของร้าน', 'เปลี่ยนรหัสเข้าใช้งาน', 'เปลี่ยนแล้ว'),
    });
    setOwnerForm({ cur: '', next: '', confirm: '' });
    alertDialog({ title: 'เปลี่ยนรหัสเจ้าของร้านแล้ว', message: 'มีผลทันทีทุกเครื่องที่ต่อ cloud' });
  };

  // มุมมองย่อย "จัดลำดับ": ลากวางใน modal เก็บเป็น draft แล้วกดบันทึกครั้งเดียว (data model เดิม serviceCategoryOrder)
  const [showOrder, setShowOrder] = useState(false);
  const [draft, setDraft] = useState([]);
  const [drag, setDrag] = useState(null); // { cat, y, over, h, grab, left, width } หรือ null
  const listRef = useRef(null);
  const rowRefs = useRef({});
  const dragRef = useRef(null);

  // ลำดับแสดงผล = order ที่เซฟไว้ (serviceCategoryOrder) ชื่อหลุดต่อท้ายตามตัวอักษร — ไม่ใช่ลำดับตัวอักษรจาก cloud
  const orderedCats = useMemo(
    () => serviceCategoryOrder(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cats, data.serviceCategoryOrder, services],
  );

  const catRows = useMemo(() => {
    return orderedCats.map((c) => {
      const rows = services.filter((s) => s.category === c);
      const timed = rows.filter((s) => s.duration != null).sort((a, b) => a.duration - b.duration);
      return { name: c, en: categoryEn(c, data.serviceCategoryEn), rows, timed, hourly: hourlyOf(rows) };
    });
  }, [orderedCats, services, data.serviceCategoryEn]);

  /* ---------- therapists (เดิม) ---------- */
  const openAddT = () => { setEditingT(null); setTForm(EMPTY_THERAPIST); setErr(''); setShowT(true); };
  const openEditT = (t) => { setEditingT(t); setTForm({ name: t.name, active: t.active !== false }); setErr(''); setShowT(true); };

  const saveT = () => {
    if (!tForm.name.trim()) { setErr('กรอกชื่อพนักงาน'); return; }
    setErr('');
    if (editingT) {
      saveData({
        ...data,
        // BUG-5: ไม่ hardcode nickname ทับ — ให้ ...t คงค่าเดิมไว้
        therapists: therapists.map((t) => (t.id === editingT.id ? { ...t, name: tForm.name.trim(), active: tForm.active } : t)),
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
    await deleteCloudFirst(
      () => deleteTherapistFromCloud(t.id),
      `พนักงาน “${t.name}”`,
      () => saveData({
        ...data,
        therapists: therapists.filter((x) => x.id !== t.id),
        auditLog: pushAudit(data, 'ลบพนักงาน', `${t.id} · ${t.name}`, 'ลบออก'),
      }),
      { title: `ลบ ${t.name} แล้ว` },
    );
  };

  /* ---------- รายการ + ราคาต่อชม ---------- */
  const openAddC = () => {
    setEditingCat(null);
    setCForm({ name: '', nameEn: '', prices: {}, comms: {} });
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
    setCForm({ name: catName, nameEn: categoryEn(catName, data.serviceCategoryEn), prices, comms });
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
    // BUG-9: ค่าแรงต้องเป็นตัวเลข ≥ 0 (ค่าว่าง = 0 ได้) — อย่า clamp ค่าติดลบ/NaN เงียบๆ
    for (const d of enabled) {
      const cv = cForm.comms[d];
      if (cv !== '' && cv != null && (!Number.isFinite(Number(cv)) || Number(cv) < 0)) { setErr(`กรอกค่าแรงของ ${formatDuration(d)} ให้ถูกต้อง`); return; }
    }
    const durs = enabled;
    setErr('');
    // ค่าแรงเป็นบาทต่อช่วงเวลา (ค่าว่าง = 0)
    const commOf = (d) => Math.max(0, Math.round(Number(cForm.comms[d]) || 0));

    let nextServices = [...services];
    // BUG-6: seed จาก orderedCats (ไม่ใช่ cats) — กันหมวดที่โผล่จาก services แต่หายจาก nextOrder filter ตอน cats ว่าง
    let nextCats = [...orderedCats];
    // เปลี่ยนชื่อรายการ: ย้าย services + cats ตาม
    if (editingCat && name !== editingCat) {
      nextCats = nextCats.map((c) => (c === editingCat ? name : c));
      nextServices = nextServices.map((s) => (s.category === editingCat ? { ...s, category: name } : s));
    }
    if (!editingCat) nextCats = [...nextCats, name];

    // BUG-1: เก็บ id แถวบริการที่จะถูกตัดออก — cloud sync เป็น upsert-only จึงต้องลบเอง
    const removedServiceIds = nextServices
      .filter((s) => s.category === name && s.duration != null && !durs.includes(s.duration))
      .map((s) => s.id);
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
        nextServices.push({ id: nextId('S', nextServices), category: name, price, duration: d, flatRate, flatAmount, tierCategory: 'other' });
      }
    });

    // ชื่ออังกฤษ (sub): เปลี่ยนชื่อไทยย้าย key ตาม, ว่าง = ลบ key (fallback map กลาง)
    const nextEn = { ...(data.serviceCategoryEn || {}) };
    const enVal = (cForm.nameEn || '').trim();
    if (editingCat && name !== editingCat) {
      const oldEn = nextEn[editingCat];
      delete nextEn[editingCat];
      if (enVal) nextEn[name] = enVal;
      else if (oldEn) nextEn[name] = oldEn;
    } else if (enVal) {
      nextEn[name] = enVal;
    } else {
      delete nextEn[name];
    }

    // ลำดับหมวด: เปลี่ยนชื่อย้ายที่เดิม, เพิ่มใหม่ต่อท้าย, แก้ไขไม่ย้าย — sync ผ่าน app_settings (serviceCategoryOrder)
    const curOrder = serviceCategoryOrder(data);
    let nextOrder;
    if (editingCat && name !== editingCat) nextOrder = curOrder.map((c) => (c === editingCat ? name : c));
    else if (!curOrder.includes(name)) nextOrder = [...curOrder, name];
    else nextOrder = [...curOrder];
    nextCats.forEach((c) => { if (!nextOrder.includes(c)) nextOrder.push(c); });
    nextOrder = nextOrder.filter((c) => nextCats.includes(c));

    saveData({
      ...data,
      services: nextServices,
      serviceCategories: nextOrder,
      serviceCategoryEn: nextEn,
      serviceCategoryOrder: nextOrder,
      auditLog: pushAudit(data, editingCat ? 'แก้ไขรายการ' : 'เพิ่มรายการ', `${name} · ${durs.length} ช่วงเวลา`, durs.map((d) => `${formatDuration(d)} ฿ ${Number(cForm.prices[d]).toLocaleString()} (ค่าแรง ฿ ${commOf(d).toLocaleString()})`).join(' · ')),
    });
    // เปลี่ยนชื่อ: ลบแถวชื่อเก่าใน cloud (upsert ลบให้ไม่ได้ ไม่งั้นชื่อเก่าโผล่กลับมาซ้ำ)
    const renamedFrom = editingCat && name !== editingCat ? editingCat : null;
    setShowC(false);
    alertDialog({ title: `${editingCat ? 'แก้ไข' : 'เพิ่ม'}รายการ ${name} แล้ว`, message: durs.map((d) => `${formatDuration(d)} ฿ ${Number(cForm.prices[d]).toLocaleString()} (ค่าแรง ฿ ${commOf(d).toLocaleString()})`).join(' · ') });
    // BUG-1: ลบช่วงเวลาที่ถูกตัดใน cloud (ส่ง name ว่าง = ลบเฉพาะ service ids ไม่แตะหมวดที่ยังใช้อยู่)
    if (removedServiceIds.length > 0) mustDeleteCloud(() => deleteCategoryFromCloud('', removedServiceIds), `ช่วงเวลาที่ลบจาก “${name}”`);
    if (renamedFrom) mustDeleteCloud(() => deleteCategoryFromCloud(renamedFrom, []), `ชื่อเก่า “${renamedFrom}”`);
  };

  const deleteC = async (cat) => {
    const ok = await confirmDialog({ title: `ลบรายการ ${cat}?`, message: 'ราคาในช่วงเวลานี้จะหายทั้งหมด · บิลเก่าไม่หาย', confirmLabel: 'ลบเลย', danger: true });
    if (!ok) return;
    const removedIds = services.filter((s) => s.category === cat).map((s) => s.id);
    const nextEn = { ...(data.serviceCategoryEn || {}) };
    delete nextEn[cat];
    const nextOrder = serviceCategoryOrder(data).filter((c) => c !== cat);
    await deleteCloudFirst(
      () => deleteCategoryFromCloud(cat, removedIds),
      `รายการ “${cat}”`,
      () => saveData({
        ...data,
        services: services.filter((s) => s.category !== cat),
        serviceCategories: nextOrder,
        serviceCategoryEn: nextEn,
        serviceCategoryOrder: nextOrder,
        auditLog: pushAudit(data, 'ลบรายการ', cat, 'ลบออก'),
      }),
      { title: `ลบรายการ ${cat} แล้ว` },
    );
  };

  /* ---------- จัดลำดับแบบลากวาง (modal ย่อย, Pointer Events ล้วน — ไม่ใช้ lib ภายนอก) ---------- */
  const openOrder = () => {
    rowRefs.current = {};
    dragRef.current = null;
    setDrag(null);
    setDraft([...orderedCats]);
    setShowOrder(true);
  };

  // ↑/↓ ในมุมมองจัดลำดับ = ขยับ draft เฉยๆ (ยังไม่เซฟ — รอกด "บันทึกลำดับ" ทีเดียว)
  const moveDraft = (cat, dir) => {
    setDraft((d) => {
      const i = d.indexOf(cat);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const orderDirty = showOrder && (draft.length !== orderedCats.length || draft.some((c, i) => c !== orderedCats[i]));

  // บันทึกครั้งเดียวแบบชัดๆ (ไม่ใช่ auto-save): เขียน serviceCategories + serviceCategoryOrder ชุดเดียวกัน — POS อ่านผ่าน serviceCategoryOrder เดิม
  const saveOrder = () => {
    detachDragListeners();
    if (orderDirty) {
      saveData({
        ...data,
        serviceCategories: [...draft],
        serviceCategoryOrder: [...draft],
        auditLog: pushAudit(data, 'จัดลำดับรายการ (ลากวาง)', draft.map((c, i) => `${i + 1}.${c}`).join(' · '), `${draft.length} รายการ`),
      });
    }
    dragRef.current = null;
    setDrag(null);
    setShowOrder(false);
  };

  const closeOrder = () => {
    detachDragListeners();
    dragRef.current = null;
    setDrag(null);
    setShowOrder(false);
  };

  // นับแถวอ้างอิง (ไม่รวมตัวที่ลาก) ที่จุดกึ่งกลางอยู่เหนือปลายนิ้ว = ตำแหน่งที่จะวาง (0..n)
  const countAbove = (clientY, others) => {
    let n = 0;
    for (const c of others) {
      const r = rowRefs.current[c]?.getBoundingClientRect();
      if (r && clientY > r.top + r.height / 2) n += 1;
    }
    return n;
  };

  // ฟัง move/up ที่ window ระดับเดียว — ไม่พึ่ง pointer capture หรือ element ใต้ปลายนิ้ว
  // (capture หลุด / handler บนแถวโดน re-render ฆ่าระหว่างลาก คือสาเหตุที่ลากได้ไม่สุด)
  // callbacks พวกนี้stable (useCallback ว่าง) ใช้ได้กับ add/removeEventListener ทุก render
  const onDragMoveCb = useCallback((e) => {
    const st = dragRef.current;
    if (!st) return;
    if (e.cancelable) e.preventDefault();
    const over = countAbove(e.clientY, st.list);
    // auto-scroll เบาๆ ชิดขอบลิสต์ (throttle กันกระตุก) แล้วค่อยวัดตำแหน่งกล่องผีใหม่
    const el = listRef.current;
    const now = Date.now();
    if (el && now - (st.scrollAt || 0) > 60) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + 64) { el.scrollTop -= 14; st.scrollAt = now; }
      else if (e.clientY > r.bottom - 64) { el.scrollTop += 14; st.scrollAt = now; }
    }
    if (el) {
      const lr = el.getBoundingClientRect();
      const rawGy = e.clientY - lr.top + el.scrollTop - st.grab;
      st.gy = Math.max(-8, Math.min(rawGy, el.scrollHeight - 40));
    }
    if (over !== st.over) {
      st.over = over;
      try { navigator.vibrate?.(8); } catch { /* ข้าม */ }
    }
    st.y = e.clientY;
    setDrag({ ...st });
  }, []);

  // วาง = ย้ายลง draft (ยังไม่เซฟ รอกดบันทึก)
  const onDragEndCb = useCallback(() => {
    const st = dragRef.current;
    detachDragListeners();
    dragRef.current = null;
    setDrag(null);
    if (!st) return;
    const at = Math.max(0, Math.min(st.over, st.list.length));
    setDraft((d) => {
      const next = d.filter((c) => c !== st.cat);
      next.splice(Math.max(0, Math.min(at, next.length)), 0, st.cat);
      return next;
    });
  }, []);

  // ลากถูกยกเลิกกลางคัน (เช่น สายเรียกเข้า) = ทิ้ง ไม่ย้าย
  const onDragCancelCb = useCallback(() => {
    detachDragListeners();
    dragRef.current = null;
    setDrag(null);
  }, []);

  function detachDragListeners() {
    window.removeEventListener('pointermove', onDragMoveCb);
    window.removeEventListener('pointerup', onDragEndCb);
    window.removeEventListener('pointercancel', onDragCancelCb);
  }

  // เริ่มลากจาก handle ⋮⋮ — snapshot รายการอื่นไว้ แล้วฟังต่อที่ window
  // (handle มี touch-action: none เลยไม่ scroll เพี้ยนตั้งแต่แตะ)
  // ตำแหน่งกล่องผี (gy) คิดเทียบกับกล่องลิสต์ ไม่ใช่เทียบจอ — บนมือถือพิกัดนิ้วกับ fixed-viewport เหลื่อมกัน
  const onGripDown = (e, cat) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const listEl = listRef.current;
    const lrect = listEl?.getBoundingClientRect();
    const row = rowRefs.current[cat]?.getBoundingClientRect();
    const list = draft.filter((c) => c !== cat);
    const grab = row ? e.clientY - row.top : 32;
    // กล่องผีอยู่ใน .ord-list (absolute) จึงคิดเทียบกับลิสต์ + กันล้นขอบ
    const rawGy = e.clientY - (lrect?.top || 0) + (listEl?.scrollTop || 0) - grab;
    const st = {
      cat,
      list,
      y: e.clientY,
      over: countAbove(e.clientY, list),
      h: row?.height || 64,
      grab,
      gy: listEl ? Math.max(-8, Math.min(rawGy, listEl.scrollHeight - 40)) : rawGy,
      scrollAt: 0,
    };
    dragRef.current = st;
    setDrag({ ...st });
    try { navigator.vibrate?.(10); } catch { /* ไม่รองรับก็ข้าม */ }
    window.addEventListener('pointermove', onDragMoveCb, { passive: false });
    window.addEventListener('pointerup', onDragEndCb);
    window.addEventListener('pointercancel', onDragCancelCb);
  };

  /* ---------- บริการเสริม ---------- */
  const openAddA = () => { setEditingA(null); setAForm({ name: '', minutes: '30', price: '', active: true }); setErr(''); setShowA(true); };
  const openEditA = (a) => { setEditingA(a); setAForm({ name: a.name, minutes: String(a.minutes ?? 30), price: String(a.price ?? ''), active: a.active !== false }); setErr(''); setShowA(true); };

  const saveA = () => {
    if (!aForm.name.trim()) { setErr('กรอกชื่อบริการเสริม'); return; }
    // BUG-7: ต้องเช็ก Number.isFinite ไม่งั้น NaN ผ่านการเทียบ <= 0 / < 0 ได้
    if (aForm.minutes === '' || !Number.isFinite(Number(aForm.minutes)) || Number(aForm.minutes) <= 0) { setErr('กรอกนาทีที่เพิ่มให้ถูกต้อง'); return; }
    if (aForm.price === '' || !Number.isFinite(Number(aForm.price)) || Number(aForm.price) < 0) { setErr('กรอกราคาให้ถูกต้อง'); return; }
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
    await deleteCloudFirst(
      () => deleteAddonFromCloud(a.id),
      `บริการเสริม “${a.name}”`,
      () => saveData({
        ...data,
        addons: addons.filter((x) => x.id !== a.id),
        auditLog: pushAudit(data, 'ลบบริการเสริม', `${a.id} · ${a.name}`, 'ลบออก'),
      }),
      { title: `ลบ ${a.name} แล้ว` },
    );
  };

  /* ---------- promotions ---------- */
  const openAddP = () => { setEditingP(null); setPForm({ name: '', amount: '', active: true }); setErr(''); setShowP(true); };
  const openEditP = (p) => { setEditingP(p); setPForm({ name: p.name, amount: String(p.amount ?? ''), active: p.active !== false }); setErr(''); setShowP(true); };

  const saveP = () => {
    if (!pForm.name.trim()) { setErr('กรอกชื่อโปรโมชัน'); return; }
    // BUG-7: ต้องเช็ก Number.isFinite ไม่งั้น NaN ผ่านการเทียบ <= 0 ได้
    if (pForm.amount === '' || !Number.isFinite(Number(pForm.amount)) || Number(pForm.amount) <= 0) { setErr('กรอกยอดส่วนลดให้ถูกต้อง'); return; }
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
    await deleteCloudFirst(
      () => deletePromoFromCloud(p.id),
      `โปรโมชัน “${p.name}”`,
      () => saveData({
        ...data,
        promotions: promos.filter((x) => x.id !== p.id),
        auditLog: pushAudit(data, 'ลบโปรโมชัน', `${p.id} · ${p.name}`, 'ลบออก'),
      }),
      { title: `ลบ ${p.name} แล้ว` },
    );
  };

  // ช่วงเวลาในฟอร์ม = เฉพาะที่ผู้ใช้เพิ่มแล้ว เรียงน้อยไปมาก (ไม่โชว์ล่วงหน้า)
  const allDurs = Object.keys(cForm.prices).map(Number)
    .filter((d) => Number.isFinite(d) && d > 0)
    .sort((a, b) => a - b);

  return (
    <div>
      <PushAdminCard />
      <div className="seg seg-icons" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr' }}>
        <button onClick={() => setTab('staff')} className={tab === 'staff' ? 'on' : ''} aria-label={`พนักงาน ${therapists.length} คน`}><Users size={17} strokeWidth={1.9} /><span>พนักงาน {therapists.length}</span></button>
        {/* BUG-6: นับจาก orderedCats ให้ตรงกับแถวที่เรนเดอร์จริง (cats อาจว่างแต่ services มีหมวด) */}
        <button onClick={() => setTab('services')} className={tab === 'services' ? 'on' : ''} aria-label={`รายการ ${orderedCats.length} รายการ`}><LayoutGrid size={17} strokeWidth={1.9} /><span>รายการ {orderedCats.length}</span></button>
        <button onClick={() => setTab('promos')} className={tab === 'promos' ? 'on' : ''} aria-label={`โปรโมชัน ${promos.length} รายการ`}><Tag size={17} strokeWidth={1.9} /><span>โปร {promos.length}</span></button>
        <button onClick={() => setTab('guarantee')} className={tab === 'guarantee' ? 'on' : ''} aria-label="ประกันมือ"><ShieldCheck size={17} strokeWidth={1.9} /><span>ประกันมือ</span></button>
        <button onClick={() => setTab('pass')} className={tab === 'pass' ? 'on' : ''} aria-label="รหัส"><KeyRound size={17} strokeWidth={1.9} /><span>รหัส</span></button>
      </div>

      {err && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}

      {tab === 'staff' && (
        <Card>
          <CardHead title="รายชื่อพนักงาน" right={<button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddT} title="เพิ่มพนักงาน" aria-label="เพิ่มพนักงาน"><Plus size={15} /> <span className="btn-t">เพิ่มพนักงาน</span></button>} />
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
        </Card>
      )}

      {tab === 'services' && (
        <Card>
          <CardHead
            title="รายการ + ราคา"
            right={<span style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openOrder} disabled={orderedCats.length < 2} title="ลากสลับลำดับรายการ" aria-label="จัดลำดับรายการ"><ArrowUpDown size={15} /> <span className="btn-t">จัดลำดับ</span></button>
              <button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddC} title="เพิ่มรายการ" aria-label="เพิ่มรายการ"><Plus size={15} /> <span className="btn-t">เพิ่มรายการ</span></button>
            </span>}
          />
          {catRows.map(({ name, en, timed, hourly }, idx) => (
            <div key={name} className="mcat-card">
              <div className="mcat-head">
                <b className="mcat-name">{name}{en ? <small className="muted"> ({en})</small> : null}</b>
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
          {/* BUG-6: เช็กจาก orderedCats ให้ตรงกับแถวที่เรนเดอร์จริง */}
          {orderedCats.length === 0 && <EmptyState title="ยังไม่มีรายการ" subtitle="กดเพิ่มรายการ" />}
        </Card>
      )}

      {tab === 'services' && (
        <Card>
          <CardHead
            title="บริการเสริม"
            right={<button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddA} title="เพิ่มบริการเสริม" aria-label="เพิ่มบริการเสริม"><Plus size={15} /> <span className="btn-t">เพิ่มเสริม</span></button>}
          />
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
            title="โปรโมชัน"
            right={<button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddP} title="เพิ่มโปรโมชัน" aria-label="เพิ่มโปรโมชัน"><Plus size={15} /> <span className="btn-t">เพิ่มโปร</span></button>}
          />
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

      {tab === 'guarantee' && (
        <Card>
          <CardHead
            title="ประกันมือ"
            right={<span className="badge info">฿ {guaranteeAmountOf(data).toLocaleString()}/วัน</span>}
          />
          <div className="field"><label>ยอดใหม่ (฿)</label><input type="number" min="1" value={gAmt} onChange={(e) => setGAmt(e.target.value)} placeholder={`ปัจจุบัน ฿ ${guaranteeAmountOf(data).toLocaleString()} — กรอกยอดใหม่`} className="input" style={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums' }} /></div>
          <button onClick={saveGuarantee} className="btn btn-primary btn-block"><CheckCircle2 size={16} /> บันทึก</button>
        </Card>
      )}

      {tab === 'pass' && (
        <Card>
          <CardHead title="รหัสเจ้าของร้าน" right={data.ownerPass ? <span className="badge paid">ตั้งเองแล้ว</span> : <span className="badge neutral">เริ่มต้น 123123</span>} />
          <div className="field"><label>รหัสปัจจุบัน *</label><input type="password" value={ownerForm.cur} onChange={(e) => setOwnerForm({ ...ownerForm, cur: e.target.value })} placeholder="กรอกรหัสปัจจุบัน" className="input" autoComplete="current-password" /></div>
          <div className="f2">
            <div className="field"><label>รหัสใหม่ (≥ 4 ตัว) *</label><input type="password" value={ownerForm.next} onChange={(e) => setOwnerForm({ ...ownerForm, next: e.target.value })} placeholder="รหัสใหม่" className="input" autoComplete="new-password" /></div>
            <div className="field"><label>ยืนยันรหัสใหม่ *</label><input type="password" value={ownerForm.confirm} onChange={(e) => setOwnerForm({ ...ownerForm, confirm: e.target.value })} placeholder="กรอกอีกครั้ง" className="input" autoComplete="new-password" /></div>
          </div>
          <button onClick={saveOwnerPass} className="btn btn-primary btn-block"><KeyRound size={16} /> เปลี่ยนรหัส</button>
        </Card>
      )}

      {showOrder && (
        <Modal onClose={closeOrder}>
          <button className="modal-x" onClick={closeOrder} aria-label="ปิด (ยกเลิก ไม่บันทึก)"><X size={16} /></button>
          <h3>จัดลำดับรายการ</h3>
          <div ref={listRef} className={`ord-list${drag ? ' ord-live' : ''}`} role="list" aria-label="ลำดับหมวดบริการ">
            {(() => {
              // ลำดับพรีวิวขณะลาก: เสียบแถวที่ลากไว้ตรงตำแหน่งที่จะวาง (แถวนั้นซ่อนไว้แต่ไม่ถอดออกจาก DOM
              // เพื่อไม่ให้ pointer capture หลุด — นั่นคือสาเหตุที่ลากไม่ได้)
              const order = drag
                ? (() => { const o = draft.filter((c) => c !== drag.cat); o.splice(Math.max(0, Math.min(drag.over, o.length)), 0, drag.cat); return o; })()
                : draft;
              const nodes = [];
              const pushRow = (c, k) => {
                const i = draft.indexOf(c);
                const hidden = drag?.cat === c;
                const en = categoryEn(c, data.serviceCategoryEn);
                const n = services.filter((s) => s.category === c && s.duration != null).length;
                nodes.push(
                  <div
                    key={c}
                    ref={(el) => { if (el) rowRefs.current[c] = el; else delete rowRefs.current[c]; }}
                    className={`ord-row${hidden ? ' ord-drag-src' : ''}`}
                    role="listitem"
                    aria-posinset={k + 1}
                    aria-setsize={draft.length}
                    aria-label={`ลำดับที่ ${k + 1} ${c}`}
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.target !== ev.currentTarget) return;
                      if (ev.key === 'ArrowUp') { ev.preventDefault(); moveDraft(c, -1); }
                      else if (ev.key === 'ArrowDown') { ev.preventDefault(); moveDraft(c, 1); }
                    }}
                  >
                    <span className="ord-pos num">{k + 1}</span>
                    <span
                      className="ord-grip"
                      aria-label={`กดค้างแล้วลาก ${c} เพื่อย้ายลำดับ`}
                      title="กดค้างแล้วลาก"
                      onPointerDown={(ev) => onGripDown(ev, c)}
                      onContextMenu={(ev) => ev.preventDefault()}
                    ><GripVertical size={18} /></span>
                    <span className="ord-grow">
                      <b>{c}{en ? <small className="muted"> ({en})</small> : null}</b>
                      <small className="muted" style={{ display: 'block' }}>{n} ช่วงเวลา</small>
                    </span>
                    <span className="ord-btns">
                      <button className="icon-btn" onClick={() => moveDraft(c, -1)} disabled={i === 0} aria-label={`ย้าย ${c} ขึ้น`} title="ย้ายขึ้น"><ChevronUp size={15} /></button>
                      <button className="icon-btn" onClick={() => moveDraft(c, 1)} disabled={i === draft.length - 1} aria-label={`ย้าย ${c} ลง`} title="ย้ายลง"><ChevronDown size={15} /></button>
                    </span>
                  </div>,
                );
              };
              order.forEach((c, k) => pushRow(c, k));
              return nodes;
            })()}
            {drag && (
              <div className="ord-ghost" style={{ top: drag.gy }} aria-hidden="true">
                <GripVertical size={18} />
                <b>{drag.cat}</b>
                <span className="ord-pos num">{drag.over + 1}</span>
              </div>
            )}
          </div>
          <div className="modal-row">
            <button onClick={closeOrder} className="btn btn-ghost">ยกเลิก</button>
            <button onClick={saveOrder} className="btn btn-primary"><CheckCircle2 size={16} /> บันทึกลำดับ</button>
          </div>
        </Modal>
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
          <div className="field"><label>ชื่อภาษาอังกฤษ (sub)</label><input value={cForm.nameEn} onChange={(e) => setCForm({ ...cForm, nameEn: e.target.value })} placeholder="เช่น Thai Massage" className="input" /></div>
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
