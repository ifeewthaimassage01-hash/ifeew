// รหัสผ่านฝั่ง client — รวมไว้ที่เดียว (C6)
// เก็บใน Supabase (app_settings key owner_pass) อย่างเดียว ไม่ใช้ env แล้ว
// ยังไม่เคยตั้งในแอป = fallback '123123' (กันล็อกตัวเอง) — ตั้งแล้วรหัสใหม่ชนะเสมอ
// NOTE(security): การเช็กฝั่ง client กันได้แค่ระดับ UI เต็มรูปต้องย้ายไปตรวจฝั่ง server
// (Supabase Edge Function + RLS) — ห้ามพึ่งรหัสนี้กันข้อมูลจริง
import { supabase, isSupabaseConfigured } from './supabase';

const DEFAULT_PASS = '123123';

export function getOwnerPass(custom) {
  return custom || DEFAULT_PASS;
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
