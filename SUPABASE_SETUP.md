# เชื่อม Supabase — 3 ขั้นตอน

## 1. สร้างตาราง (ครั้งเดียว)
1. เปิด Supabase Dashboard > SQL Editor > New query
2. copy ทั้งไฟล์ `supabase/schema.sql` ไปวาง > Run
3. ควรเห็น `Success. No rows returned`

## 2. เอา Keys มาใส่
1. ไปที่ Project Settings > API จะเห็น:
   - Project URL (เช่น `https://xyzcompany.supabase.co`)
   - anon public key (ปุ่ม Reveal)
2. สร้างไฟล์ `.env` ที่ root (copy จาก `.env.example`):
```
VITE_SUPABASE_URL=https://xyzcompany.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
```
3. restart dev server: `npm run dev`

## 3. เช็กว่าเชื่อมแล้ว
- เปิดแอป ดู footer ด้านล่าง:
  - `● Cloud เชื่อมแล้ว` = สำเร็จ (ข้อมูลย้ายขึ้น cloud อัตโนมัติครั้งแรก)
  - `○ Local mode` = ยังไม่มี `.env` หรือ key ผิด → เปิด Console (F12) ดู `[supabase]` log
- ทดสอบ: สร้างบิลใหม่ 1 ใบ → ไปดูใน Supabase > Table Editor > `bills` + `bill_items` ต้องมีแถวใหม่

## หมายเหตุ
- ตอนนี้ RLS เปิดแบบ permissive (anon อ่าน/เขียนได้ทุกตาราง) เพราะ POS ยังไม่มี login ถ้าจะขึ้น production จริง แนะนำเปิด Supabase Auth แล้วผมจะ lock policy ให้
- `localStorage` ยังเก็บเป็น cache สำรอง — ถ้าเน็ตหลุด แอปยังเปิด/ขายได้ แล้วจะ sync ขึ้น cloud ตอนเน็ตกลับมา (debounce 0.8s หลังกดบันทึก)
- ไฟล์ที่เพิ่ม: `src/lib/supabase.js`, `src/data/cloudSync.js`, `supabase/schema.sql`, `.env.example`
