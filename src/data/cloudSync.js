// Cloud-only data layer — Supabase เป็นแหล่งข้อมูลจริงเพียงที่เดียว ไม่มี cache/fallback อื่น
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { bkkNow } from '../utils/bkk';

export const cloudStatus = { mode: 'cloud', lastError: '' };

// ผู้ฟังสถานะ sync — App ใช้โชว์ banner เตือนเมื่ออัปโหลดล้ม (แทน console เงียบๆ)
const syncListeners = new Set();
function notifySync() {
  const snap = { mode: cloudStatus.mode, error: cloudStatus.lastError };
  syncListeners.forEach((cb) => { try { cb(snap); } catch { /* ignore */ } });
}
export function subscribeSyncStatus(cb) {
  syncListeners.add(cb);
  cb({ mode: cloudStatus.mode, error: cloudStatus.lastError });
  return () => { syncListeners.delete(cb); };
}
function setCloudStatus(mode, error) {
  cloudStatus.mode = mode;
  cloudStatus.lastError = error || '';
  notifySync();
}

// M1 — เตือนให้รัน migration เมื่อ DB ยังไม่มีคอลัมน์ใหม่ (ไม่ตัดคอลัมน์เงียบ)
const MIGRATION_MSG = 'ฐานข้อมูลยังไม่มีคอลัมน์ใหม่ — รัน supabase/migration_bill_fields.sql (+ migration_cloudinary_branch.sql) ใน Supabase SQL Editor แล้ว reload';
let migrationWarning = '';
function flagMigration() {
  if (!migrationWarning) {
    migrationWarning = MIGRATION_MSG;
    setCloudStatus('error', MIGRATION_MSG);
  }
}

// โครงข้อมูลว่างขั้นต่ำ — ใช้เป็นโครงตอน cloud ว่างเปล่าเท่านั้น ไม่ใช่ cache
export function emptyCloudData() {
  return {
    therapists: [],
    services: [],
    serviceCategories: [],
    serviceCategoryEn: {},
    serviceCategoryOrder: [],
    addons: [],
    promotions: [],
    bills: [],
    cashDrawer: {},
    expenses: [],
    auditLog: [],
    eodStatus: {},
    commissionSettings: { mode: 'flat', flatRates: {} },
  };
}

// ---------- mapping บิล/รายการ (C1: ครบทุกรายการ, ทน DB เก่าที่คอลัมน์ยังไม่มี) ----------
function toBillRow(b) {
  return {
    id: b.id,
    date: b.date || null,
    customer: b.customer || '',
    member_no: b.memberNo || '',
    payment_method: b.paymentMethod || '',
    status: b.status || 'open',
    discount: b.discount || 0,
    slip_url: b.slip || '',
    paid_at: b.paidAt || null,
    branch_id: b.branchId || 'main',
    fuel: b.fuel || 0,
    therapist_id: b.therapistId || '',
    therapist_name: b.therapistName || '',
    start_time: b.startTime || '',
    end_time: b.endTime || '',
    promotion: b.promotion || '',
    subtotal: b.subtotal ?? 0,
    total: b.total ?? 0,
    updated_at: b.updatedAt || bkkNow(),
  };
}

function parseAddons(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}

function fromItemRow(i) {
  return {
    serviceId: i.service_id,
    serviceName: i.service_name || '',
    category: i.category || '',
    therapistId: i.therapist_id,
    therapistName: i.therapist_name || '',
    qty: i.qty,
    price: i.price,
    discount: i.discount,
    net: i.net,
    duration: i.duration ?? i.total_minutes ?? null,
    totalMinutes: i.total_minutes ?? i.duration ?? null,
    startTime: i.start_time || '',
    endTime: i.end_time || '',
    addons: parseAddons(i.addons),
  };
}

function fromBillRow(r, itemsByBill) {
  const items = (itemsByBill[r.id] || []).map(fromItemRow);
  // DB เก่าไม่มี subtotal/total: คำนวณจากรายการกันหาย (ไม่ทิ้งเป็น 0)
  const sub = r.subtotal ?? items.reduce((s, i) => s + (i.net ?? i.price ?? 0), 0);
  return {
    id: r.id,
    date: r.date,
    customer: r.customer || '',
    memberNo: r.member_no || '',
    paymentMethod: r.payment_method || '',
    status: r.status || 'open',
    discount: r.discount || 0,
    slip: r.slip_url || '',
    paidAt: r.paid_at || null,
    branchId: r.branch_id || 'main',
    fuel: r.fuel || 0,
    therapistId: r.therapist_id || '',
    therapistName: r.therapist_name || '',
    startTime: r.start_time || '',
    endTime: r.end_time || '',
    promotion: r.promotion || '',
    subtotal: sub,
    total: r.total ?? (sub - (r.discount || 0)),
    updatedAt: r.updated_at || r.created_at || r.date || null,
    createdAt: r.created_at || r.date,
    items,
  };
}

// คอลัมน์ใหม่ที่ tolerantUpsert ยอมตัดเมื่อ DB ยังไม่รัน migration (ตัดแล้วขึ้น banner ผ่าน flagMigration)
const BILL_DROP_KEYS = ['slip_url', 'paid_at', 'branch_id', 'fuel',
  'therapist_id', 'therapist_name', 'start_time', 'end_time', 'promotion', 'subtotal', 'total', 'updated_at'];
const ITEM_DROP_KEYS = ['service_name', 'category', 'therapist_name', 'start_time', 'end_time',
  'duration', 'total_minutes', 'addons'];

// ---------- utils ----------
const chunk = (arr, size = 200) => {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// M2 — retry 1 ครั้ง ครอบทั้ง throw และ {error} (supabase คืน {error} ไม่ throw)
async function withRetryOnce(fn, delayMs = 400) {
  try {
    const r = await fn();
    if (r && r.error) {
      await sleep(delayMs);
      return await fn();
    }
    return r;
  } catch {
    await sleep(delayMs);
    return await fn();
  }
}

// C4 — ดึงทุกหน้าด้วย range (order desc ให้บิลใหม่อยู่ก่อน กันถูกตัดทิ้งแบบ limit+asc เดิม)
async function fetchAll(table, orderCol, { ascending = false, pageSize = 1000, tiebreak = null } = {}) {
  const rows = [];
  let from = 0;
  for (;;) {
    const build = () => {
      let q = supabase.from(table).select('*').order(orderCol, { ascending });
      if (tiebreak) q = q.order(tiebreak, { ascending: true });
      return q.range(from, from + pageSize - 1);
    };
    const { data, error } = await withRetryOnce(build);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function fetchSmall(table, orderCol) {
  const { data, error } = await withRetryOnce(() =>
    supabase.from(table).select('*').order(orderCol).limit(5000));
  if (error) throw error;
  return data || [];
}

// ---------- C3: จำ snapshot ล่าสุด — sync อัปโหลดเฉพาะ entity ที่เปลี่ยนในเครื่องนี้ (กัน 2 เครื่องทับกัน) ----------
function normAddon(a) {
  if (a && typeof a === 'object') return [a.id ?? '', a.name ?? '', a.minutes ?? 0, a.price ?? 0].join(':');
  return String(a ?? '');
}
const itemFp = (r) => [
  r.service_id, r.service_name || '', r.category || '', r.therapist_id, r.therapist_name || '',
  r.qty, r.price, r.discount, r.net, r.start_time || '', r.end_time || '',
  r.duration ?? '', r.total_minutes ?? '',
  (Array.isArray(r.addons) ? r.addons : parseAddons(r.addons)).map(normAddon).join(','),
].join('|');

function stableBillFp(b) {
  const { updated_at: _u, ...row } = toBillRow(b); // ไม่เอา updated_at เข้า fp (เปลี่ยนทุก sync)
  return `${JSON.stringify(row)}||${toItemRows(b).map(itemFp).join(';')}`;
}

const lastKnownBillFp = new Map(); // billId -> fp
const lastKnownSettings = new Map(); // key -> json
function rememberBills(bills) {
  lastKnownBillFp.clear();
  for (const b of bills || []) {
    try { lastKnownBillFp.set(b.id, stableBillFp(b)); } catch { /* ignore */ }
  }
}
function settingsEntriesOf(o) {
  return [
    { key: 'cash_drawer', value: o.cashDrawer ?? {} },
    { key: 'eod_status', value: o.eodStatus ?? {} },
    { key: 'commission_settings', value: o.commissionSettings ?? { mode: 'flat', flatRates: {} } },
    { key: 'service_category_en', value: o.serviceCategoryEn ?? {} },
    { key: 'service_category_order', value: o.serviceCategoryOrder ?? [] },
  ];
}
function rememberSettingsFrom(o) {
  if (!o) return;
  for (const { key, value } of settingsEntriesOf(o)) {
    try { lastKnownSettings.set(key, JSON.stringify(value)); } catch { /* ignore */ }
  }
}

// ---------- C5: คิวกันหาย (outbox) — localStorage เก็บเฉพาะงานเขียนที่ยังไม่ขึ้น cloud ไม่ใช่ cache อ่าน ----------
// เก็บเฉพาะบิลที่เปลี่ยนเทียบกับ snapshot ล่าสุด (diff) ไม่ใช่ทั้งก้อน
const OUTBOX_KEY = 'ifeew_pos_outbox_v1';
function readOutbox() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && Array.isArray(o.bills) ? o : null;
  } catch { return null; }
}
function writeOutbox(bills) {
  try {
    if (!bills || bills.length === 0) localStorage.removeItem(OUTBOX_KEY);
    else localStorage.setItem(OUTBOX_KEY, JSON.stringify({ v: 1, ts: Date.now(), bills }));
  } catch { /* เต็ม/ใช้ไม่ได้ก็ข้าม — sync หลักยังวิ่งต่อ */ }
}
export function getPendingBills() {
  const o = readOutbox();
  return o ? o.bills : [];
}
export function clearOutbox() {
  try { localStorage.removeItem(OUTBOX_KEY); } catch { /* ignore */ }
}
function queueOutbox(data) {
  if (!data || !Array.isArray(data.bills)) return;
  try {
    const pending = data.bills.filter((b) => stableBillFp(b) !== lastKnownBillFp.get(b.id));
    writeOutbox(pending);
  } catch { /* ignore */ }
}

export async function loadCloudData(opts) {
  const quiet = !!(opts && opts.quiet); // M9: realtime reload ส่ง {quiet:true} ได้ — ห้ามแตะ cloudStatus/notify
  const setStatus = (mode, err) => { if (!quiet) setCloudStatus(mode, err); };
  if (!isSupabaseConfigured || !supabase) {
    const msg = 'ต้องตั้งค่า Supabase (.env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) แล้ว restart';
    setStatus('error', msg);
    throw new Error(msg);
  }
  try {
    // ฝั่ง multi-branch ในอนาคตเติม .eq('branch_id', branchId) ที่ bills/expenses/bill_items
    const [therapists, services, cats, addons, promos, bills, items, expenses, audit, settings] = await Promise.all([
      fetchSmall('therapists', 'id'),
      fetchSmall('services', 'id'),
      fetchSmall('service_categories', 'name'),
      fetchSmall('addons', 'id'),
      fetchSmall('promotions', 'id'),
      fetchAll('bills', 'created_at', { ascending: false }),
      fetchAll('bill_items', 'bill_id', { ascending: true, tiebreak: 'id' }),
      fetchAll('expenses', 'date', { ascending: false, tiebreak: 'id' }),
      fetchAll('audit_log', 'timestamp', { ascending: false }),
      (async () => {
        const { data, error } = await withRetryOnce(() => supabase.from('app_settings').select('*').limit(100));
        if (error) throw error;
        return data || [];
      })(),
    ]);

    const isEmpty = therapists.length === 0 && bills.length === 0 && services.length === 0;

    // Cloud ว่างเปล่าจริง = คืนชุดว่างปกติ (mode cloud)
    if (isEmpty) {
      const empty = emptyCloudData();
      rememberBills(empty.bills);
      rememberSettingsFrom(empty);
      // C5: cloud ว่างแต่มีบิลค้าง outbox (สร้างตอนเน็ตหลุด) — เอากลับมาแสดง กันหาย
      const pendingEmpty = readOutbox();
      if (pendingEmpty && pendingEmpty.bills.length > 0) {
        empty.bills = pendingEmpty.bills.filter((b) => b && b.id);
      }
      setStatus(migrationWarning ? 'error' : 'cloud', migrationWarning || '');
      return empty;
    }

    const itemsByBill = {};
    for (const i of items) {
      (itemsByBill[i.bill_id] ||= []).push(i);
    }
    const settingsMap = {};
    for (const s of settings) settingsMap[s.key] = s.value;

    const mappedBills = bills.map((r) => fromBillRow(r, itemsByBill));
    const result = {
      therapists: therapists.map((t) => ({
        id: t.id, name: t.name, nickname: t.nickname, role: t.role, active: t.active,
      })),
      services: services.map((s) => ({
        id: s.id, category: s.category, price: s.price, duration: s.duration,
        flatRate: Number(s.flat_rate || 0), flatAmount: s.flat_amount,
        tierCategory: s.tier_category,
      })),
      serviceCategories: cats.map((c) => c.name),
      addons: addons.map((a) => ({
        id: a.id, name: a.name, minutes: a.minutes, price: a.price, active: a.active,
      })),
      promotions: promos.map((p) => ({
        id: p.id, name: p.name, amount: p.amount, active: p.active,
      })),
      bills: mappedBills,
      expenses: expenses.map((e) => ({
        id: e.id, date: e.date, category: e.category, item: e.item,
        amount: e.amount, method: e.method, approvedBy: e.approved_by,
        receiptUrl: e.receipt_url, notes: e.notes, branchId: e.branch_id || 'main',
      })),
      auditLog: audit.map((a) => ({
        id: a.id, timestamp: a.timestamp, user: a.user_name, action: a.action,
        detail: a.detail, oldValue: a.old_value, newValue: a.new_value,
        approvedBy: a.approved_by,
      })),
      cashDrawer: settingsMap.cash_drawer || {},
      eodStatus: settingsMap.eod_status || {},
      commissionSettings: settingsMap.commission_settings || { mode: 'flat', flatRates: {} },
      // ชื่ออังกฤษหมวดบริการ — เก็บใน app_settings JSON, ข้อมูลเก่าไม่มี = {} (fallback map กลาง)
      serviceCategoryEn: settingsMap.service_category_en || {},
      // ลำดับหมวดบริการ — เก็บใน app_settings JSON array ชื่อไทย, ข้อมูลเก่าไม่มี = [] (helper เรียงตัวอักษรให้)
      serviceCategoryOrder: Array.isArray(settingsMap.service_category_order)
        ? settingsMap.service_category_order.filter((c) => typeof c === 'string' && c)
        : [],
    };

    // จำ snapshot ฝั่ง cloud ก่อน overlay (C3) — outbox ที่ overlay ทับยังถือว่า "ยังไม่ sync"
    rememberBills(result.bills);
    rememberSettingsFrom(result);

    // C5-recover: เอาบิลค้าง outbox (เช่น เน็ตหลุด+refresh) วางทับ — อันไหน cloud ใหม่กว่าก็ให้ cloud ชนะ
    const outbox = readOutbox();
    if (outbox && outbox.bills.length > 0) {
      const byId = new Map(result.bills.map((b) => [b.id, b]));
      for (const pb of outbox.bills) {
        if (!pb || !pb.id) continue;
        const cur = byId.get(pb.id);
        if (!cur) byId.set(pb.id, pb);
        else {
          const pt = pb.updatedAt || pb.createdAt || pb.date || '';
          const ct = cur.updatedAt || cur.createdAt || cur.date || '';
          if (!ct || (pt && pt >= ct)) byId.set(pb.id, pb);
        }
      }
      result.bills = [...byId.values()];
    }

    if (migrationWarning) setStatus('error', migrationWarning);
    else setStatus('cloud', '');
    return result;
  } catch (err) {
    console.error('[supabase] load failed:', err);
    setStatus('error', err.message || String(err));
    return null;
  }
}

let syncTimer = null;
let syncScheduled = false;
export const syncState = { pending: 0, lastDone: 0 };
export function scheduleSync(data) {
  if (!isSupabaseConfigured || !supabase) return;
  queueOutbox(data); // C5: จำคิวทันที (ไม่รอ debounce 800ms)
  // M6: pending ตั้งทันทีตอน schedule (ของเดิมตั้งใน setTimeout ช้า 800ms)
  if (!syncScheduled) {
    syncScheduled = true;
    syncState.pending += 1;
  }
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncDataToCloud(data)
      .then(() => { syncState.lastDone = Date.now(); }) // M6: lastDone เฉพาะสำเร็จ
      .catch((e) => console.error('[supabase] sync failed:', e))
      .finally(() => {
        syncScheduled = false;
        syncState.pending = Math.max(0, syncState.pending - 1);
      });
  }, 800);
}

// Upsert that tolerates a not-yet-migrated table: if PostgREST complains about
// a missing column (migration*.sql not run yet), retry without it + ขึ้น banner
// so saving never breaks — new fields activate once the migration is applied.
async function tolerantUpsert(table, rows, dropKeys) {
  if (!rows || rows.length === 0) return { data: [], error: null };
  const first = await supabase.from(table).upsert(rows);
  if (first.error && /could not find .* column/i.test(first.error.message || '')) {
    flagMigration(); // M1: อย่าตัดเงียบ
    const stripped = rows.map((r) => {
      const c = { ...r };
      (dropKeys || []).forEach((k) => delete c[k]);
      return c;
    });
    return supabase.from(table).upsert(stripped);
  }
  return first;
}

function toItemRows(b) {
  const rows = [];
  for (const it of b.items || b.customers || []) {
    rows.push({
      bill_id: b.id,
      service_id: it.serviceId || null,
      therapist_id: it.therapistId || null,
      qty: it.qty || 1,
      price: it.price || 0,
      discount: it.discount || 0,
      net: it.net ?? it.price ?? 0,
      service_name: it.serviceName || '',
      category: it.category || '',
      therapist_name: it.therapistName || '',
      start_time: it.startTime || '',
      end_time: it.endTime || '',
      duration: it.duration ?? it.totalMinutes ?? null,
      total_minutes: it.totalMinutes ?? it.duration ?? null,
      addons: Array.isArray(it.addons) ? it.addons : [],
    });
  }
  return rows;
}

// C2 — replace รายการทั้งบิล: ลอง RPC transaction (atomic) ก่อน,
// ถ้า server ยังไม่มี function (ยังไม่รัน migration) ค่อย fallback เป็น delete+insert
async function replaceBillItems(billId, wantRows) {
  let rpcMissing = false;
  try {
    const { error: rpcErr } = await supabase.rpc('sync_bill_items', { p_bill_id: billId, p_items: wantRows });
    if (!rpcErr) return;
    if (/could not find|does not exist/i.test(rpcErr.message || '')) rpcMissing = true;
    else throw rpcErr;
  } catch (e) {
    if (e && /could not find|does not exist/i.test(e.message || '')) rpcMissing = true;
    else throw e;
  }
  if (!rpcMissing) return;
  const { error: delErr } = await supabase.from('bill_items').delete().eq('bill_id', billId);
  if (delErr) throw delErr;
  if (wantRows.length > 0) {
    for (const part of chunk(wantRows, 500)) {
      const res = await tolerantUpsert('bill_items', part, ITEM_DROP_KEYS);
      if (res.error) throw res.error;
    }
  }
}

export async function syncDataToCloud(d) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    // C3 — อัปโหลดเฉพาะบิล/ตั้งค่าที่เปลี่ยนในเครื่องนี้ บิลอื่นไม่โดนทับ (กัน last-write-wins ทั้งก้อน)
    const changedBills = (d.bills || []).filter((b) => {
      try { return stableBillFp(b) !== lastKnownBillFp.get(b.id); }
      catch { return true; }
    });
    const changedSettings = settingsEntriesOf(d || {}).filter(({ key, value }) => {
      try { return JSON.stringify(value) !== lastKnownSettings.get(key); }
      catch { return true; }
    });

    const tasks = [];
    if (d.therapists) tasks.push(withRetryOnce(() => supabase.from('therapists').upsert(d.therapists.map((t) => ({
      id: t.id, name: t.name, nickname: t.nickname, role: t.role, active: t.active !== false,
    })))));
    if (d.services) tasks.push(withRetryOnce(() => supabase.from('services').upsert(d.services.map((s) => ({
      id: s.id, category: s.category, price: s.price, duration: s.duration,
      flat_rate: s.flatRate || 0, flat_amount: s.flatAmount ?? null,
      tier_category: s.tierCategory || 'other',
    })))));
    if (d.serviceCategories) tasks.push(withRetryOnce(() => supabase.from('service_categories').upsert(
      d.serviceCategories.map((name) => ({ name })), { onConflict: 'name' },
    )));
    if (d.addons) tasks.push(withRetryOnce(() => supabase.from('addons').upsert(d.addons.map((a) => ({
      id: a.id, name: a.name, minutes: a.minutes, price: a.price, active: a.active !== false,
    })))));
    if (d.promotions) tasks.push(withRetryOnce(() => supabase.from('promotions').upsert(d.promotions.map((p) => ({
      id: p.id, name: p.name, amount: p.amount, active: p.active !== false,
    })))));
    if (d.expenses) tasks.push(withRetryOnce(() => tolerantUpsert('expenses', d.expenses.map((e) => ({
      id: e.id, date: e.date || null, category: e.category || 'ทั่วไป', item: e.item || '',
      amount: e.amount || 0, method: e.method || '', approved_by: e.approvedBy || '',
      receipt_url: e.receiptUrl || '', notes: e.notes || '', branch_id: e.branchId || 'main',
    })), ['branch_id'])));
    if (d.auditLog) {
      // audit log only grows — upsert last 200 to bound payload
      const tail = d.auditLog.slice(-200);
      tasks.push(withRetryOnce(() => supabase.from('audit_log').upsert(tail.map((a) => ({
        id: a.id, timestamp: a.timestamp || bkkNow(),
        user_name: a.user || '', action: a.action || '', detail: a.detail || '',
        old_value: String(a.oldValue ?? ''), new_value: String(a.newValue ?? ''),
        approved_by: a.approvedBy || '',
      })))));
    }
    if (changedBills.length > 0) {
      tasks.push(withRetryOnce(() => tolerantUpsert('bills',
        changedBills.map((b) => ({ ...toBillRow(b), updated_at: bkkNow() })), BILL_DROP_KEYS)));
    }
    const results = await Promise.all(tasks);
    const err = results.find((r) => r && r.error)?.error;
    if (err) throw err;

    // bill_items: upsert รายบิล + ลบเฉพาะรายการที่หายไป (ไม่ wipe ทั้งชุด)
    // เหตุผล: bill_items.id เป็น uuid สุ่มฝั่ง DB จึงไม่มี unique key ให้ upsert ตรง ๆ
    // เลยใช้ diff ระดับบิล — ข้ามบิลที่ items ไม่เปลี่ยน, บิลที่เปลี่ยนค่อย replace เฉพาะบิลนั้น
    // (atomic ระดับบิลผ่าน RPC + retry 1 ครั้ง; C2: เก็บบิลล้มไว้ sync บิลอื่นต่อ ค่อย throw รวมท้าย)
    if (d.bills && d.bills.length > 0) {
      const billIds = d.bills.map((b) => b.id);
      const existingByBill = {};
      for (const part of chunk(billIds, 200)) { // M5: .in() แบ่ง batch
        let from = 0;
        const PAGE = 1000;
        for (;;) {
          const { data: page, error: selErr } = await withRetryOnce(() =>
            supabase.from('bill_items').select('*').in('bill_id', part)
              .order('bill_id').order('id').range(from, from + PAGE - 1));
          if (selErr) throw selErr;
          for (const row of page || []) {
            (existingByBill[row.bill_id] ||= []).push(row);
          }
          if ((page || []).length < PAGE) break;
          from += PAGE;
        }
      }
      const billErrors = [];
      for (const b of d.bills) {
        try {
          const want = toItemRows(b);
          const have = existingByBill[b.id] || [];
          // เปรียบเทียบแบบ multiset ผ่าน fingerprint (รองรับแถวซ้ำกัน)
          const countOf = (arr) => {
            const m = new Map();
            for (const r of arr) {
              const k = itemFp(r);
              m.set(k, (m.get(k) || 0) + 1);
            }
            return m;
          };
          const w = countOf(want);
          const h = countOf(have);
          let same = w.size === h.size;
          if (same) for (const [k, v] of w) if (h.get(k) !== v) { same = false; break; }
          if (same) continue; // ไม่เปลี่ยน -> ข้าม ไม่แตะ DB
          await withRetryOnce(() => replaceBillItems(b.id, want));
        } catch (billErr) {
          // C2: ไม่ให้บิลเดียวล้มทั้ง sync — เก็บไว้ sync บิลอื่นต่อ ค่อย throw รวมท้าย
          billErrors.push(`${b.id}: ${billErr?.message || billErr}`);
        }
      }
      if (billErrors.length > 0) {
        throw new Error(`bill_items sync ล้มเหลว ${billErrors.length} บิล — ${billErrors.join(' | ')}`);
      }
    }

    if (changedSettings.length > 0) {
      const { error: settingsErr } = await withRetryOnce(() => supabase.from('app_settings').upsert(
        changedSettings.map(({ key, value }) => ({ key, value, updated_at: bkkNow() })),
        { onConflict: 'key' }));
      if (settingsErr) throw settingsErr;
    }

    // สำเร็จ — จำ snapshot ใหม่ + เคลียร์คิวค้าง
    if (d.bills) rememberBills(d.bills);
    rememberSettingsFrom(d);
    clearOutbox();
    if (migrationWarning) setCloudStatus('error', migrationWarning);
    else setCloudStatus('cloud', '');
  } catch (err) {
    console.error('[supabase] sync failed:', err);
    setCloudStatus('error', err.message || String(err));
    throw err;
  }
}

// กด "ลองอีกครั้ง" จาก banner — sync ทันทีไม่รอ debounce
export function retrySync(data) {
  if (!isSupabaseConfigured || !supabase) return Promise.reject(new Error(cloudStatus.lastError || 'not configured'));
  clearTimeout(syncTimer);
  queueOutbox(data);
  if (!syncScheduled) {
    syncScheduled = true;
    syncState.pending += 1;
  }
  return syncDataToCloud(data)
    .then((r) => { syncState.lastDone = Date.now(); return r; }) // lastDone เฉพาะสำเร็จ
    .finally(() => {
      syncScheduled = false;
      syncState.pending = Math.max(0, syncState.pending - 1);
    });
}

// Hard delete a bill (owner only) — upsert sync can't propagate deletions,
// so remove items + header from cloud explicitly. App state is updated by caller.
export async function deleteBillFromCloud(id) {
  if (!isSupabaseConfigured || !supabase || !id) return;
  const { error: itemErr } = await withRetryOnce(() => supabase.from('bill_items').delete().eq('bill_id', id));
  if (itemErr) throw itemErr;
  const { error: billErr } = await withRetryOnce(() => supabase.from('bills').delete().eq('id', id));
  if (billErr) throw billErr;
}

// ลบค่าใช้จ่าย — upsert sync ลบให้ไม่ได้ ต้องลบใน cloud เอง ไม่งั้นของที่ลบจะโผล่กลับมาตอนโหลด/realtime reload
export async function deleteExpenseFromCloud(id) {
  if (!isSupabaseConfigured || !supabase || !id) return;
  const { error } = await withRetryOnce(() => supabase.from('expenses').delete().eq('id', id));
  if (error) throw error;
}

// ลบแถว master (พนักงาน/บริการ/หมวด/เสริม/โปร) — upsert sync ลบให้ไม่ได้
// ต้องลบใน cloud เอง ไม่งั้นของที่ลบจะโผล่กลับมาตอนโหลด/ realtime reload
async function deleteRowsFromCloud(table, col, values) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!values || values.length === 0) return;
  for (const part of chunk(values, 200)) { // M5: .in() แบ่ง batch
    const { error } = await withRetryOnce(() => supabase.from(table).delete().in(col, part));
    if (error) throw error;
  }
}

// ลบหมวดบริการ: ลบแถว services ของหมวดนั้น + แถวชื่อหมวด (ใช้ทั้งตอนลบหมวดและตอนเปลี่ยนชื่อ)
export async function deleteCategoryFromCloud(name, serviceIds) {
  if (!isSupabaseConfigured || !supabase) return;
  await deleteRowsFromCloud('services', 'id', serviceIds);
  if (name) {
    const { error } = await withRetryOnce(() => supabase.from('service_categories').delete().eq('name', name));
    if (error) throw error;
  }
}

export async function deleteTherapistFromCloud(id) {
  await deleteRowsFromCloud('therapists', 'id', [id]);
}

export async function deleteAddonFromCloud(id) {
  await deleteRowsFromCloud('addons', 'id', [id]);
}

export async function deletePromoFromCloud(id) {
  await deleteRowsFromCloud('promotions', 'id', [id]);
}

// รีเซ็ตบริการ: ลบแถว services/หมวดที่ไม่อยู่ในชุดใหม่ (กันของเก่าโผล่กลับ)
export async function pruneServicesFromCloud(keepServiceIds, keepCatNames) {
  if (!isSupabaseConfigured || !supabase) return;
  const allSvc = await fetchAll('services', 'id', { ascending: true });
  const keepSvc = new Set(keepServiceIds || []);
  await deleteRowsFromCloud('services', 'id', allSvc.map((s) => s.id).filter((id) => !keepSvc.has(id)));
  const allCats = await fetchAll('service_categories', 'name', { ascending: true });
  const keepCats = new Set(keepCatNames || []);
  await deleteRowsFromCloud('service_categories', 'name', allCats.map((c) => c.name).filter((n) => !keepCats.has(n)));
}
