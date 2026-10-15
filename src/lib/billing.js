// ตรรกะคำนวณบิล/ค่าแรง — ไม่เปลี่ยนสูตร
import { CATEGORY_EN } from '../data/defaults';
import { bizDateOf, bkkNow } from '../utils/bkk';
import { nextExpenseId } from './ids';
import { deleteExpenseFromCloud } from '../data/cloudSync';

/* ชื่อแสดงผล — สร้างจากหมวด + ระยะเวลา (แทน field name ที่ตัดออก) */
export function svcLabel(s) {
  if (!s || s.duration == null) return s?.category || '';
  const m = s.duration;
  if (m < 60) return `${s.category} ${m} นาที`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (r === 0) return `${s.category} ${h} ชม`;
  if (r === 30) return `${s.category} ${h}.5 ชม`;
  return `${s.category} ${h} ชม ${r} นาที`;
}

// ผูกเวลาเริ่ม–จบให้หลายบริการต่อกัน (พักห้องคั่นระหว่างรายการ)
export function chainTimes(startMin, durations, breakMin) {
  const out = [];
  let t = startMin;
  durations.forEach((d, i) => {
    out.push({ start: t, end: t + d });
    if (i < durations.length - 1) t = t + d + (breakMin || 0);
    else t = t + d;
  });
  return out;
}

// ชื่อหมอวิ่งสำหรับแสดงผล — ตัด prefix เทคนิค (EXT-VIS-/EXT-) เหลือแค่ชื่อ
export function freelanceDisplayName(tid) {
  const s = String(tid || '').replace(/^EXT-VIS-/, '').replace(/^EXT-/, '').trim();
  return s || 'ไม่ระบุ';
}

// M4: ตัวเช็กหมอวิ่งมาตรฐานที่เดียว — หมอวิ่ง = รหัสไม่อยู่ในทะเบียนพนักงานปัจจุบัน
// (แทนที่การเช็ก 3 แบบ: staffIds.has / stats[tid] / startsWith('EXT-'))
// tid ว่าง/ไม่ระบุ → ถือเป็นหมอวิ่ง (ตรงพฤติกรรมเดิมของ Dashboard/MonthStatement)
export function isFreelance(tid, therapists) {
  if (tid == null || tid === '') return true;
  return !(therapists || []).some((t) => String(t.id) === String(tid));
}

// ค่าแรงคงที่ (บาท) ของแถวบริการ — ใช้ flatAmount ถ้ามี ไม่งั้นคำนวณจาก flatRate เดิม
export function commBaht(s) {
  if (!s) return 0;
  if (s.flatAmount != null) return s.flatAmount;
  return Math.round((s.price || 0) * (s.flatRate || 0));
}

/* ลำดับหมวดบริการ (รายการ) — source of truth คือ data.serviceCategoryOrder
 * (sync ผ่าน app_settings key 'service_category_order', ดู cloudSync.js)
 * tolerant ข้อมูลเก่า: ชื่อไหนหลุดจาก order ที่เซฟให้ต่อท้ายตามตัวอักษรไทย,
 * ถ้าไม่มี order เลยคืนตามตัวอักษร (ตรงพฤติกรรมเดิมที่ cloud .order('name'))
 * คืนเฉพาะชื่อที่มีอยู่จริง (ตัดชื่อผีใน order ทิ้ง) — ไม่ลบข้อมูลใดๆ */
export function serviceCategoryOrder(data) {
  const d = data || {};
  const rawCats = Array.isArray(d.serviceCategories) ? d.serviceCategories : [];
  const base = rawCats.length
    ? [...new Set(rawCats.filter((c) => typeof c === 'string' && c))]
    : [...new Set((d.services || []).map((s) => s && s.category).filter(Boolean))];
  const raw = Array.isArray(d.serviceCategoryOrder) ? d.serviceCategoryOrder : [];
  const byTh = (a, b) => String(a).localeCompare(String(b), 'th');
  if (raw.length === 0) return [...base].sort(byTh);
  const inBase = new Set(base);
  const seen = new Set();
  const ordered = [];
  for (const c of raw) {
    if (typeof c !== 'string' || !c || seen.has(c) || !inBase.has(c)) continue;
    seen.add(c);
    ordered.push(c);
  }
  const missing = base.filter((c) => !seen.has(c)).sort(byTh);
  return [...ordered, ...missing];
}

/* คืนชื่ออังกฤษของหมวดไทย — ใช้ค่าที่ร้านตั้งเอง (overrides) ก่อน แล้วค่อย fallback map กลาง */
export function categoryEn(th, overrides) {
  if (overrides && typeof overrides === 'object' && overrides[th]) return overrides[th];
  return CATEGORY_EN[th] || '';
}

/* ---------- GUARANTEE — ประกันมือหมอประจำ 400 บาท/วัน (data layer) ---------- */
// หมวดรายจ่ายของเงินประกันมือ — กันนับซ้ำ: หักออกจาก expenseSum แล้วบวกเข้า regComm (ดู PageDashboard/MonthStatement)
export const GUARANTEE_CATEGORY = 'ค่าประกันมือหมอ';
export const DEFAULT_GUARANTEE_AMOUNT = 400;

/* ยอดประกันมือ/วัน — ตัวเลขเท่านั้น ไม่ใช่/ไม่มี = 400 */
export function guaranteeAmountOf(data) {
  const v = Number(data && data.guaranteeAmount);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_GUARANTEE_AMOUNT;
}

/* คำนวณส่วนต่างประกันมือของวันนั้น — pure (ไม่แตะ state/DB)
 * @param {object} data — cloud data ทั้งก้อน (therapists/services/bills/attendance/guaranteeAmount)
 * @param {string} dateStr — 'YYYY-MM-DD' (วันที่ธุรกิจ)
 * @returns {Array<{therapistId, name, earned, shortfall}>}
 * เงื่อนไข: หมอประจำเท่านั้น (isFreelance false + active !== false) + มีชื่อใน attendance[dateStr]
 *   + earned < guaranteeAmount โดย earned = ผลรวม commBaht(svc)*qty จาก bill items ของบิล status paid
 *   ที่ bizDateOf(bill.date||createdAt) === dateStr (นับแบบเดียวกับ PageCommission: bill.items||bill.customers,
 *   therapistId = itm.therapistId||bill.therapistId, svc หาไม่เจอ comm=0) */
export function guaranteeTopups(data, dateStr) {
  if (!dateStr) return [];
  const d = data || {};
  const gAmt = guaranteeAmountOf(d);
  const dayAtt = (d.attendance || {})[dateStr];
  if (!dayAtt || typeof dayAtt !== 'object' || Array.isArray(dayAtt)) return [];
  const therapists = d.therapists || [];
  const svcById = new Map(((d.services || [])).map((s) => [String(s && s.id), s]));
  // earned ต่อหมอ — นับเฉพาะงานหมอประจำ (ข้ามงานหมอวิ่งตั้งแต่ตอนสะสม ตรงกับ PageCommission)
  const earned = {};
  for (const b of d.bills || []) {
    if (!b || b.status !== 'paid') continue;
    if (bizDateOf(b.date || b.createdAt) !== dateStr) continue;
    for (const itm of b.items || b.customers || []) {
      const tid = (itm && itm.therapistId) || b.therapistId;
      if (tid == null || tid === '') continue;
      if (isFreelance(tid, therapists)) continue;
      const svc = svcById.get(String(itm.serviceId));
      const comm = svc ? commBaht(svc) * ((itm && itm.qty) || 1) : 0;
      const k = String(tid);
      earned[k] = (earned[k] || 0) + comm;
    }
  }
  const out = [];
  for (const t of therapists) {
    if (!t || t.active === false) continue;
    if (isFreelance(t.id, therapists)) continue;
    if (dayAtt[t.id] == null && dayAtt[String(t.id)] == null) continue;
    const e = earned[String(t.id)] || 0;
    if (e < gAmt) out.push({ therapistId: t.id, name: t.name, earned: e, shortfall: gAmt - e });
  }
  return out;
}

/* ลายเซ็นข้อมูลที่ ensure เคยประมวลผลแล้ว — กัน double-invoke (StrictMode) เซฟซ้ำ
 * อ่าน att/bills/expenses จาก d ล้วน (ไม่พึ่ง haveGKeys ภายนอก กันอ่านค่าตัวเก่า) */
export function guaranteeSigOf(d, dateStr) {
  const dd = d || {};
  const att = Object.keys(((dd.attendance || {})[dateStr]) || {}).sort().join(',');
  const dayBills = (dd.bills || []).filter((b) => b && b.status === 'paid' && bizDateOf(b.date || b.createdAt) === dateStr).map((b) => b.id).sort().join(',');
  const dayG = ((dd.expenses || []).map((e) => e && e.notes).filter((n) => typeof n === 'string' && n.startsWith('guarantee:'))).filter((k) => k.endsWith(`:${dateStr}`)).sort().join(',');
  return `${dateStr}|${att}|${dayBills}|${dayG}`;
}

/* สร้าง expense rows ประกันมือให้ทุกคนใน guaranteeTopups ที่ยังไม่มีของคู่นั้น
 * dedupe ด้วย notes === `guarantee:{tid}:{dateStr}` (เช็กของเดิม + กันซ้ำใน batch เดียวกัน)
 * row: {id, date: dateStr, category: 'ค่าประกันมือหมอ', item: `ประกันมือ {name} {dateStr}`,
 *   amount: shortfall, method: 'เงินสด', approvedBy: 'ระบบอัตโนมัติ', notes: key, branchId: 'main'}
 * + audit entries action 'ประกันมืออัตโนมัติ'
 * @returns {{data, created}} — created=0 คืน data เดิม (ไม่สร้าง object ใหม่ กัน re-render ฟรี) */
export function ensureGuaranteeEntries(data, dateStr) {
  if (!data || !dateStr) return { data, created: 0 };
  const tops = guaranteeTopups(data, dateStr);
  if (tops.length === 0) return { data, created: 0 };
  const seen = new Set(
    (data.expenses || []).map((e) => e && e.notes).filter((n) => typeof n === 'string' && n),
  );
  const ts = bkkNow();
  const base = Date.now();
  const newExpenses = [];
  const newAudits = [];
  tops.forEach((t, i) => {
    const key = `guarantee:${t.therapistId}:${dateStr}`;
    if (seen.has(key)) return;
    if (!Number.isFinite(t.shortfall) || t.shortfall <= 0) return;
    seen.add(key);
    newExpenses.push({
      id: nextExpenseId(data.expenses),
      date: dateStr,
      category: GUARANTEE_CATEGORY,
      item: `ประกันมือ ${t.name} ${dateStr}`,
      amount: t.shortfall,
      method: 'เงินสด',
      approvedBy: 'ระบบอัตโนมัติ',
      notes: key,
      branchId: 'main',
    });
    newAudits.push({
      id: `A-${base}-${i}-${Math.floor(Math.random() * 1000)}`,
      timestamp: ts,
      user: 'ระบบอัตโนมัติ',
      action: 'ประกันมืออัตโนมัติ',
      detail: `${t.therapistId} · ${t.name} · ${dateStr}`,
      oldValue: `฿ ${t.earned}`,
      newValue: `฿ ${t.shortfall}`,
      approvedBy: 'ระบบอัตโนมัติ',
    });
  });
  if (newExpenses.length === 0) return { data, created: 0 };
  return {
    data: {
      ...data,
      expenses: [...(data.expenses || []), ...newExpenses],
      auditLog: [...(data.auditLog || []), ...newAudits],
    },
    created: newExpenses.length,
    // added: รายชื่อที่สร้างรอบนี้ (ให้ UI โชว์ข้อความ — สัญญากลางเดิม {data, created} ยังครบ)
    added: tops
      .filter((t) => seen.has(`guarantee:${t.therapistId}:${dateStr}`)
        && newExpenses.some((e) => e.notes === `guarantee:${t.therapistId}:${dateStr}`))
      .map((t) => ({ therapistId: t.therapistId, name: t.name, shortfall: t.shortfall })),
  };
}

/* ปรับลดยอดประกันมือของวันนั้นให้ตรง shortfall ปัจจุบัน (reconcile) — pure + คืน id ที่ต้องลบใน cloud
 * หลักการ: หา expense หมวดประกัน (GUARANTEE_CATEGORY) ของวันนั้นทุกแถวที่มี notes key
 *   `guarantee:{tid}:{dateStr}` จับกลุ่มตาม key แล้วเทียบยอดรวมของกลุ่มกับ shortfall ปัจจุบัน
 *   จาก guaranteeTopups — คนที่ไม่ติดลิสต์ = shortfall 0 (ถอนชื่อแล้ว / นวดเกินแล้ว / บิลจ่ายทีหลัง)
 *   ถ้ายอดรวมของ key เกิน shortfall → ลบแถวเก่าทั้งกลุ่มทิ้ง แล้วสร้างแถวเดียวที่ยอดถูกต้อง
 *   (ถ้า shortfall = 0 คือลบอย่างเดียว ไม่สร้าง) + audit 'ปรับลดประกันมือ' ต่อ key ที่แก้
 *   ยอดรวมไม่เกิน shortfall (ขาด/พอดี) → ไม่แตะ (หน้าที่เติมเป็นของ ensure)
 * @param {object} data — cloud data ทั้งก้อน
 * @param {string} dateStr — 'YYYY-MM-DD'
 * @returns {{data, changed, removedIds, summary}} — changed=false คืน data object เดิม (reference เดิม) */
export function reconcileGuaranteeEntries(data, dateStr) {
  const emptySummary = { checked: 0, adjusted: 0, revoked: 0, removed: 0, created: 0, fixed: [] };
  // aliases ระดับบน (created/removed/updated) — ให้ boot hook ใน App.jsx ที่เช็ก
  // `r.created > 0 || r.removed > 0 || r.updated > 0` ทำงานได้โดยไม่ต้องแตะ App.jsx
  const noChange = { data, changed: false, removedIds: [], summary: emptySummary, created: 0, removed: 0, updated: 0 };
  if (!data || !dateStr) return noChange;
  const expenses = data.expenses || [];
  const suffix = `:${dateStr}`;
  const byKey = new Map(); // notes key -> { rows, sum }
  for (const e of expenses) {
    if (!e || e.category !== GUARANTEE_CATEGORY) continue;
    const n = e && e.notes;
    if (typeof n !== 'string' || !n.startsWith('guarantee:') || !n.endsWith(suffix)) continue;
    let g = byKey.get(n);
    if (!g) { g = { rows: [], sum: 0 }; byKey.set(n, g); }
    g.rows.push(e);
    g.sum += Number(e.amount) || 0;
  }
  if (byKey.size === 0) return noChange;
  const tops = guaranteeTopups(data, dateStr);
  const shortByKey = new Map();
  const nameByTid = new Map();
  for (const t of tops) {
    shortByKey.set(`guarantee:${t.therapistId}:${dateStr}`, t.shortfall);
    nameByTid.set(String(t.therapistId), t.name);
  }
  const thById = new Map(
    (data.therapists || []).map((t) => [String(t && t.id), (t && t.name) || String((t && t.id) || '')]),
  );
  const removeIds = new Set();
  const newExpenses = [];
  const newAudits = [];
  const fixed = [];
  const ts = bkkNow();
  const base = Date.now();
  let idx = 0;
  for (const [key, g] of byKey) {
    const short = shortByKey.has(key) ? shortByKey.get(key) : 0;
    if (!(g.sum > short)) continue; // เกินเท่านั้นถึงแก้ — ขาด/พอดีไม่แตะ
    for (const r of g.rows) {
      if (r && r.id != null) removeIds.add(r.id);
    }
    const tid = key.slice('guarantee:'.length, -(dateStr.length + 1));
    const nm = nameByTid.get(String(tid)) ?? thById.get(String(tid)) ?? String(tid);
    const to = Number.isFinite(short) && short > 0 ? short : 0;
    if (to > 0) {
      newExpenses.push({
        id: nextExpenseId(expenses),
        date: dateStr,
        category: GUARANTEE_CATEGORY,
        item: `ประกันมือ ${nm} ${dateStr}`,
        amount: to,
        method: 'เงินสด',
        approvedBy: 'ระบบอัตโนมัติ',
        notes: key,
        branchId: 'main',
      });
    }
    newAudits.push({
      id: `A-${base}-rc-${idx}-${Math.floor(Math.random() * 1000)}`,
      timestamp: ts,
      user: 'ระบบอัตโนมัติ',
      action: 'ปรับลดประกันมือ',
      detail: `${tid} · ${nm} · ${dateStr}`,
      oldValue: `฿ ${g.sum}`,
      newValue: `฿ ${to}`,
      approvedBy: 'ระบบอัตโนมัติ',
    });
    fixed.push({ key, therapistId: tid, name: nm, from: g.sum, to });
    idx += 1;
  }
  if (removeIds.size === 0) return noChange;
  const rm = new Set(removeIds);
  const kept = expenses.filter((e) => !(e && rm.has(e.id)));
  const summary = {
    checked: byKey.size,
    adjusted: fixed.length,
    revoked: fixed.filter((f) => f.to === 0).length,
    removed: rm.size,
    created: newExpenses.length,
    fixed,
  };
  return {
    data: {
      ...data,
      expenses: [...kept, ...newExpenses],
      auditLog: [...(data.auditLog || []), ...newAudits],
    },
    changed: true,
    removedIds: [...rm],
    summary,
    // aliases ระดับบนสำหรับ boot hook ใน App.jsx (ดูข้างบน)
    created: newExpenses.length,
    removed: rm.size,
    updated: fixed.filter((f) => f.to > 0).length,
  };
}

/* รวม ensure + reconcile เป็นรอบเดียว (async) — ให้ effect เรียกตัวนี้ตัวเดียว
 * 1) ensure (sync) เติมแถวที่ขาด → 2) reconcile หาแถวเกินของวันนั้นเทียบ shortfall ปัจจุบัน
 * 3) ลบแถวเกินใน cloud ผ่าน deleteExpenseFromCloud ทีละ id แบบ tolerant (ล้มก็กลืน —
 *    รอบหน้า reconcile จะเจอแถวค้างแล้วลบให้ใหม่ self-healing) แล้วคืน data รวม
 * @returns {Promise<{data, changed, summary}>} — changed=false คืน data object เดิม */
export async function applyGuaranteeForDate(data, dateStr) {
  const emptySummary = { created: 0, added: [], removedIds: [], adjusted: 0, revoked: 0, removed: 0, recapped: 0, fixed: [] };
  if (!data || !dateStr) return { data, changed: false, summary: emptySummary };
  const ensured = ensureGuaranteeEntries(data, dateStr);
  const base = ensured.created > 0 ? ensured.data : data;
  const rec = reconcileGuaranteeEntries(base, dateStr);
  const removedIds = rec.removedIds || [];
  if (removedIds.length > 0) {
    for (const id of removedIds) {
      try {
        await deleteExpenseFromCloud(id);
      } catch { /* tolerant — ลบ cloud ไม่ได้ รอบหน้าลองใหม่ */ }
    }
  }
  const changed = ensured.created > 0 || rec.changed;
  if (!changed) return { data, changed: false, summary: emptySummary };
  return {
    data: rec.changed ? rec.data : ensured.data,
    changed: true,
    summary: {
      created: ensured.created || 0,
      added: ensured.added || [],
      removedIds,
      adjusted: (rec.summary && rec.summary.adjusted) || 0,
      revoked: (rec.summary && rec.summary.revoked) || 0,
      removed: removedIds.length,
      recapped: (rec.summary && rec.summary.created) || 0,
      fixed: (rec.summary && rec.summary.fixed) || [],
    },
  };
}
