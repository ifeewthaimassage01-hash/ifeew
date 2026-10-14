// ตรรกะคำนวณบิล/ค่าแรง — ไม่เปลี่ยนสูตร
import { CATEGORY_EN } from '../data/defaults';

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

// ค่าแรงคงที่ (บาท) ของแถวบริการ — ใช้ flatAmount ถ้ามี ไม่งั้นคำนวณจาก flatRate เดิม
export function commBaht(s) {
  if (!s) return 0;
  if (s.flatAmount != null) return s.flatAmount;
  return Math.round((s.price || 0) * (s.flatRate || 0));
}

export const tierRates = [
  { min: 0, max: 30000, rate: 0.30 },
  { min: 30001, max: 50000, rate: 0.35 },
  { min: 50001, max: 80000, rate: 0.40 },
  { min: 80001, max: Infinity, rate: 0.45 },
];

// ขอบเขตแบบ <= max ต่อเนื่องกัน: ≤30k → 30%, 30k–50k → 35%, 50k–80k → 40%, >80k → 45%
const TIERS = tierRates.map((t, i) => ({
  max: t.max,
  rate: t.rate,
  label: i === 0 ? '≤ 30k → 30%' : t.max === Infinity ? '> 80k → 45%' : `${Math.round(tierRates[i - 1].max / 1000)}–${Math.round(t.max / 1000)}k → ${Math.round(t.rate * 100)}%`,
}));

export function tieredComm(total) {
  let comm = 0;
  for (let i = 0; i < TIERS.length; i++) {
    const prev = i === 0 ? 0 : TIERS[i - 1].max;
    const range = Math.min(TIERS[i].max, total) - prev;
    if (range > 0) comm += range * TIERS[i].rate;
    if (total <= TIERS[i].max) break;
  }
  return comm;
}

// ขอบ rate ปัจจุบันต้องตรงกับตารางขั้น (ใช้ <= max เดียวกัน ไม่มีช่องว่างที่ 30k/50k/80k พอดี)
export function tierRateOf(total) {
  for (const t of TIERS) {
    if (total <= t.max) return t.rate;
  }
  return TIERS[TIERS.length - 1].rate;
}

/* คืนชื่ออังกฤษของหมวดไทย — ใช้ค่าที่ร้านตั้งเอง (overrides) ก่อน แล้วค่อย fallback map กลาง */
export function categoryEn(th, overrides) {
  if (overrides && typeof overrides === 'object' && overrides[th]) return overrides[th];
  return CATEGORY_EN[th] || '';
}
