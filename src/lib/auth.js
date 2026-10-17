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
// คืน { value, error } เพื่อแยก "ยังไม่ตั้ง" ออกจาก "อ่าน cloud ไม่ได้" (S3)
// ห้าม fallback เป็น default เมื่ออ่าน cloud ล้ม — ไม่งั้นรหัสสาธารณะ '123123' จะถูกยอมรับ
export async function fetchOwnerPass() {
  if (!isSupabaseConfigured || !supabase) {
    return { value: '', error: new Error('supabase ยังไม่ได้ตั้งค่า') };
  }
  try {
    const { data, error } = await supabase
      .from('app_settings').select('value').eq('key', 'owner_pass').maybeSingle();
    if (error) return { value: '', error };
    return { value: typeof data?.value === 'string' ? data.value : '', error: null };
  } catch (e) {
    return { value: '', error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// รหัสที่ใช้จริงตอน login: cloud > default(เฉพาะเมื่อ cloud อ่านได้และว่าง)
// ถ้าอ่าน cloud ไม่ได้ → throw ให้ UI แจ้งเตือน ไม่ยอมรับ default
export async function resolveOwnerPass() {
  const { value, error } = await fetchOwnerPass();
  if (error) throw error;
  return getOwnerPass(value);
}

// เตือนว่ายังใช้รหัส default อยู่หรือไม่ (เอาไว้โชว์คำเตือน ไม่ใช่ล็อก)
export function isDefaultPass(custom) {
  return getOwnerPass(custom) === DEFAULT_PASS;
}
