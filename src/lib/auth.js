// รหัสผ่านฝั่ง client — รวมไว้ที่เดียว (C6)
// อ่านจาก env ก่อน + fallback '123123' คงพฤติกรรมเดิม ไม่ล็อกอะไรเพิ่ม
// NOTE(security): การเช็กฝั่ง client กันได้แค่ระดับ UI เต็มรูปต้องย้ายไปตรวจฝั่ง server
// (Supabase Edge Function + RLS) — ห้ามพึ่งรหัสนี้กันข้อมูลจริง
export function getOwnerPass() {
  return import.meta.env.VITE_OWNER_PASS ?? '123123';
}

export function getManagerPass() {
  return import.meta.env.VITE_MANAGER_PASS ?? '123123';
}

// เตือนว่ายังใช้รหัส default อยู่หรือไม่ (เอาไว้โชว์คำเตือน ไม่ใช่ล็อก)
export function isDefaultPass(kind) {
  const p = kind === 'manager' ? getManagerPass() : getOwnerPass();
  return p === '123123';
}
