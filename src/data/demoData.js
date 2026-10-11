// Demo data for I'FEEW THAIMASSAGE POS System
export const therapists = [
  { id: 'T01', name: 'คุณน้ำ', nickname: 'น้ำฝน', role: 'senior', active: true },
  { id: 'T02', name: 'คุณแป้ง', nickname: 'แป้ง', role: 'senior', active: true },
  { id: 'T03', name: 'คุณเบลล์', nickname: 'เบลล์', role: 'junior', active: true },
  { id: 'T04', name: 'คุณมิ้น', nickname: 'มิ้น', role: 'junior', active: true },
  { id: 'T05', name: 'คุณฝน', nickname: 'ฝน', role: 'senior', active: true },
];

export const serviceTypes = [
  // นวดไทย — แยกตามชั่วโมงให้ชัดเจน (1 ชม / 1.5 ชม / 2 ชม)
  { id: 'S01', category: 'นวดไทย', price: 350, duration: 60, flatRate: 0.40, tierCategory: 'massage' },
  { id: 'S02', category: 'นวดไทย', price: 500, duration: 90, flatRate: 0.40, tierCategory: 'massage' },
  { id: 'S12', category: 'นวดไทย', price: 650, duration: 120, flatRate: 0.40, tierCategory: 'massage' },
  { id: 'S03', category: 'นวดน้ำมัน', price: 600, duration: 60, flatRate: 0.35, tierCategory: 'oil' },
  { id: 'S04', category: 'นวดน้ำมัน', price: 850, duration: 90, flatRate: 0.35, tierCategory: 'oil' },
  { id: 'S13', category: 'นวดน้ำมัน', price: 1100, duration: 120, flatRate: 0.35, tierCategory: 'oil' },
  { id: 'S05', category: 'นวดเท้า', price: 300, duration: 45, flatRate: 0.40, tierCategory: 'foot' },
  { id: 'S14', category: 'นวดเท้า', price: 350, duration: 60, flatRate: 0.40, tierCategory: 'foot' },
  { id: 'S15', category: 'นวดเท้า', price: 500, duration: 90, flatRate: 0.40, tierCategory: 'foot' },
  { id: 'S06', category: 'อโรมา/สปา', price: 1200, duration: 90, flatRate: 0.30, tierCategory: 'spa' },
  { id: 'S07', category: 'ขัดผิว', price: 800, duration: 60, flatRate: 0.35, tierCategory: 'scrub' },
  { id: 'S08', category: 'แพ็กเกจ/คอร์ส', price: 3000, duration: null, flatRate: 0.30, tierCategory: 'package' },
  { id: 'S09', category: 'ขายสินค้า', price: 450, duration: null, flatRate: 0.10, tierCategory: 'product' },
  { id: 'S10', category: 'รายได้อื่น ๆ', price: 200, duration: null, flatRate: 0.25, tierCategory: 'other' },
  { id: 'S11', category: 'ทิป (Tip)', price: 0, duration: null, flatRate: 1.00, tierCategory: 'tip' },
];

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

// ค่าแรงคงที่ (บาท) ของแถวบริการ — ใช้ flatAmount ถ้ามี ไม่งั้นคำนวณจาก flatRate เดิม
export function commBaht(s) {
  if (!s) return 0;
  if (s.flatAmount != null) return s.flatAmount;
  return Math.round((s.price || 0) * (s.flatRate || 0));
}

// บริการเสริม (add-on) — เลือกเพิ่มใน POS ขั้นระยะเวลาได้หลายอย่าง
export const addonTypes = [
  { id: 'A01', name: 'ประคบสมุนไพร', minutes: 30, price: 350, active: true },
  { id: 'A02', name: 'ศีรษะและไหล่', minutes: 20, price: 250, active: true },
];
export const DEFAULT_ADDONS = addonTypes;

// โปรโมชันส่วนลดท้ายบิล — เลือกใน POS / หน้าแก้ไขบิล แทนการกรอกมือ
export const promoTypes = [
  { id: 'P01', name: 'โปรวันเกิด', amount: 500, active: true },
  { id: 'P02', name: 'โปร 10 ครั้ง', amount: 300, active: true },
];
export const DEFAULT_PROMOTIONS = promoTypes;

// ค่าเริ่มต้นสำหรับปุ่มรีเซ็ตในหน้าจัดการร้าน
export const DEFAULT_SERVICES = serviceTypes;
export const DEFAULT_CATEGORIES = [
  'นวดไทย', 'นวดน้ำมัน', 'นวดเท้า', 'อโรมา/สปา', 'ขัดผิว', 'แพ็กเกจ/คอร์ส', 'ขายสินค้า', 'รายได้อื่น ๆ', 'ทิป (Tip)'
];

export const categories = [
  'นวดไทย', 'นวดน้ำมัน', 'นวดเท้า', 'อโรมา/สปา', 'ขัดผิว', 'แพ็กเกจ/คอร์ส', 'ขายสินค้า', 'รายได้อื่น ๆ', 'ทิป (Tip)'
];

export const tierRates = [
  { min: 0, max: 30000, rate: 0.30 },
  { min: 30001, max: 50000, rate: 0.35 },
  { min: 50001, max: 80000, rate: 0.40 },
  { min: 80001, max: Infinity, rate: 0.45 },
];

export function generateBillId() {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const count = Math.floor(Math.random() * 900 + 1).toString().padStart(3, '0');
  return `INV-${ymd}-${count}`;
}

function buildSeed() {
  return {
      therapists,
      services: serviceTypes,
      serviceCategories: [...categories],
      addons: addonTypes.map((a) => ({ ...a })),
      promotions: promoTypes.map((p) => ({ ...p })),
      bills: [
        {
          id: 'INV-20261007-001',
          date: '2026-10-07T14:30:00',
          customer: 'คุณสมชาย',
          memberNo: 'M-1042',
          items: [
            { serviceId: 'S01', therapistId: 'T01', qty: 1, price: 350, discount: 0, net: 350 },
            { serviceId: 'S11', therapistId: 'T01', qty: 1, price: 150, discount: 0, net: 150 },
          ],
          paymentMethod: 'เงินสด',
          status: 'paid',
          createdAt: '2026-10-07T14:30:00',
        },
        {
          id: 'INV-20261007-002',
          date: '2026-10-07T16:00:00',
          customer: 'คุณวิภา',
          memberNo: '',
          items: [
            { serviceId: 'S03', therapistId: 'T03', qty: 1, price: 600, discount: 50, net: 550 },
          ],
          paymentMethod: 'QR Code / โอนเงิน',
          status: 'paid',
          createdAt: '2026-10-07T16:00:00',
        },
      ],
      cashDrawer: {
        startCash: 3000,
        salesCash: 800,
        otherCashIn: 200,
        payoutCash: 500,
        depositCash: 1000,
        lastCountDate: '2026-10-07',
        lastCountReal: 2700,
        lastCountReason: 'ยอดขาดจากทิปไม่ครบ',
      },
      expenses: [
        {
          id: 'E001', date: '2026-10-07', category: 'Fixed Costs',
          item: 'ค่าเช่าร้าน', amount: 15000, method: 'เงินสด',
          approvedBy: 'คุณสมศรี', receiptUrl: '', notes: 'ค่าเช่าเดือน ตค.',
        },
        {
          id: 'E002', date: '2026-10-07', category: 'Operating Expenses',
          item: 'น้ำมันนวด', amount: 850, method: 'QR',
          approvedBy: 'คุณสมศรี', receiptUrl: '', notes: 'ซื้อจากร้านสมุนไพร',
        },
        {
          id: 'E003', date: '2026-10-07', category: 'Marketing',
          item: 'Facebook Ads', amount: 1200, method: 'บัตรเครดิต',
          approvedBy: 'คุณสมศรี', receiptUrl: '', notes: 'โปรโมทรายสัปดาห์',
        },
      ],
      auditLog: [
        { id: 'A001', timestamp: '2026-10-07T14:35:00', user: 'คุณน้ำ', action: 'สร้างบิล', detail: 'INV-20261007-001', oldValue: '-', newValue: 'paid', approvedBy: '-' },
        { id: 'A002', timestamp: '2026-10-07T16:05:00', user: 'คุณแป้ง', action: 'สร้างบิล', detail: 'INV-20261007-002', oldValue: '-', newValue: 'paid', approvedBy: '-' },
      ],
      eodStatus: { lastClosed: '2026-10-07', locked: false, approvedBy: 'คุณสมศรี' },
      commissionSettings: {
        mode: 'flat',
        flatRates: { massage: 0.40, oil: 0.35, foot: 0.40, spa: 0.30, scrub: 0.35, package: 0.30, product: 0.10, other: 0.25, tip: 1.00 },
      },
    };
}

const STORAGE_KEY = 'ifeew_data';
let memoryFallback = null;

function storageGet() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryFallback ? JSON.stringify(memoryFallback) : null;
  }
}

function storageSet(obj) {
  memoryFallback = obj;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }
  } catch {
    /* sandboxed iframe — keep in-memory only */
  }
}

export function seedLocalStorage() {
  try {
    if (!storageGet()) {
      storageSet(buildSeed());
    }
  } catch {
    memoryFallback = buildSeed();
  }
}

export function loadData() {
  seedLocalStorage();
  try {
    const raw = storageGet();
    if (!raw) return buildSeed();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return buildSeed();
    // ensure required collections exist (merge with seed defaults)
    const seed = buildSeed();
    let services = parsed.services || seed.services;
    // migrate: เติมรายการใหม่ (S12–S15) ให้ร้านเก่าอัตโนมัติ โดยไม่ทับของที่แก้แล้ว
    const byId = new Map(services.map((s) => [s.id, s]));
    let migrated = false;
    for (const def of seed.services) {
      if (!byId.has(def.id)) { byId.set(def.id, { ...def }); migrated = true; }
    }
    services = [...byId.values()];
    // migrate: ค่าแรงคงที่ต่อแถว (flatAmount, บาท) — เติมจาก flatRate เดิมถ้ายังไม่มี
    services.forEach((s) => {
      if (s.flatAmount == null) { s.flatAmount = Math.round((s.price || 0) * (s.flatRate || 0)); migrated = true; }
    });
    const merged = {
      ...seed,
      ...parsed,
      therapists: parsed.therapists || seed.therapists,
      services,
      serviceCategories: parsed.serviceCategories || seed.serviceCategories,
      addons: parsed.addons || seed.addons,
      promotions: parsed.promotions || seed.promotions,
      bills: parsed.bills || [],
      expenses: parsed.expenses || [],
      auditLog: parsed.auditLog || [],
    };
    if (migrated) {
      try { storageSet(merged); } catch { /* ignore */ }
    }
    return merged;
  } catch {
    return buildSeed();
  }
}

export function persistData(obj) {
  storageSet(obj);
}
