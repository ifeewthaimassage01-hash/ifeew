// ค่าเริ่มต้นของร้าน (ใช้ปุ่มรีเซ็ตในหน้าจัดการร้าน) — ไม่เปลี่ยนค่า
// canonical คือ DEFAULT_* ตัวเดียว; ชื่อเก่า (serviceTypes/addonTypes/...) เป็น alias ชี้ก้อนเดียวกัน (กัน import เก่าพัง)
export const DEFAULT_SERVICES = [
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

// บริการเสริม (add-on) — เลือกเพิ่มใน POS ขั้นระยะเวลาได้หลายอย่าง
export const DEFAULT_ADDONS = [
  { id: 'A01', name: 'ประคบสมุนไพร', minutes: 30, price: 350, active: true },
  { id: 'A02', name: 'ศีรษะและไหล่', minutes: 20, price: 250, active: true },
];
export const addonTypes = DEFAULT_ADDONS;

// โปรโมชันส่วนลดท้ายบิล — เลือกใน POS / หน้าแก้ไขบิล แทนการกรอกมือ
export const DEFAULT_PROMOTIONS = [
  { id: 'P01', name: 'โปรวันเกิด', amount: 500, active: true },
  { id: 'P02', name: 'โปร 10 ครั้ง', amount: 300, active: true },
];
export const promoTypes = DEFAULT_PROMOTIONS;

// ค่าเริ่มต้นสำหรับปุ่มรีเซ็ตในหน้าจัดการร้าน
export const serviceTypes = DEFAULT_SERVICES;
export const DEFAULT_CATEGORIES = [
  'นวดไทย', 'นวดน้ำมัน', 'นวดเท้า', 'อโรมา/สปา', 'ขัดผิว', 'แพ็กเกจ/คอร์ส', 'ขายสินค้า', 'รายได้อื่น ๆ', 'ทิป (Tip)'
];

/* ชื่ออังกฤษ (sub text) ของหมวดบริการ — key = ชื่อไทย, ไทยเป็น primary เสมอ
 * ข้อมูลเก่าที่ไม่มี serviceCategoryEn จะ fallback มาที่ map นี้โดยอัตโนมัติ */
export const CATEGORY_EN = {
  'นวดไทย': 'Thai Massage',
  'นวดน้ำมัน': 'Oil Massage',
  'นวดเท้า': 'Foot Massage',
  'อโรมา/สปา': 'Aroma / Spa',
  'ขัดผิว': 'Body Scrub',
  'แพ็กเกจ/คอร์ส': 'Package / Course',
  'ขายสินค้า': 'Retail',
  'รายได้อื่น ๆ': 'Other Income',
  'ทิป': 'Tip',
  'ทิป (Tip)': 'Tip',
};

/* map เริ่มต้นสำหรับ reset — สร้างจาก DEFAULT_CATEGORIES + CATEGORY_EN */
export function defaultCategoryEnMap() {
  const m = {};
  DEFAULT_CATEGORIES.forEach((c) => { if (CATEGORY_EN[c]) m[c] = CATEGORY_EN[c]; });
  return m;
}

export const categories = DEFAULT_CATEGORIES;
