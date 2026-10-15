// รหัสผ่านฝั่ง client — รวมไว้ที่เดียว (C6)
// ลำดับ: รหัสที่เจ้าของร้านตั้งเองในแอป (sync ผ่าน app_settings) > env > fallback '123123'
// NOTE(security): การเช็กฝั่ง client กันได้แค่ระดับ UI เต็มรูปต้องย้ายไปตรวจฝั่ง server
// (Supabase Edge Function + RLS) — ห้ามพึ่งรหัสนี้กันข้อมูลจริง
import { supabase, isSupabaseConfigured } from './supabase';

const DEFAULT_PASS = '123123';

export function getOwnerPass(custom) {
  if (custom) return custom;
  return import.meta.env.VITE_OWNER_PASS || DEFAULT_PASS;
}

// ดึงรหัสเจ้าของร้านจาก cloud (หน้า login ยังไม่มี data โหลดไว้ จึง query เอง)
// ล้ม/ไม่มี = '' ให้ caller fallback ไป env/default
export async function fetchOwnerPass() {
  try {
    if (!isSupabaseConfigured || !supabase) return '';
    const { data, error } = await supabase
      .from('app_settings').select('value').eq('key', 'owner_pass').maybeSingle();
    if (error || !data) return '';
    return typeof data.value === 'string' ? data.value : '';
  } catch { return ''; }
}

// รหัสที่ใช้จริงตอน login: cloud > env > default
export async function resolveOwnerPass() {
  const cloud = await fetchOwnerPass();
  return getOwnerPass(cloud);
}

// เตือนว่ายังใช้รหัส default อยู่หรือไม่ (เอาไว้โชว์คำเตือน ไม่ใช่ล็อก)
export function isDefaultPass(custom) {
  return getOwnerPass(custom) === DEFAULT_PASS;
}
