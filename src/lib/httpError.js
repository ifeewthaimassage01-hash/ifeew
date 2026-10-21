// อ่าน payload ของ error ที่ supabase-js โยนออกมา (ใช้กับ bookingAdminApi)
//   - Response → ctx.json()
//   - string   → JSON.parse
// คืน null ถ้าอ่านไม่ได้ (ผู้เรียกจะ fallback ไปใช้ error.message เอง)
export async function readErrorPayload(error, label = '') {
  const ctx = error?.context;
  if (!ctx) return null;
  try {
    if (typeof ctx.json === 'function') return await ctx.json();
    if (typeof ctx === 'string') return JSON.parse(ctx);
  } catch (e) {
    // label = ข้อความแทรกกลางประโยค (เช่น ' admin ') เพื่อให้ log ของแต่ละโมดูลเหมือนเดิมทุกตัวอักษร
    console.error(`[booking] อ่านข้อมูล error จากเซิร์ฟเวอร์${label}ไม่สำเร็จ`, e);
  }
  return null;
}
