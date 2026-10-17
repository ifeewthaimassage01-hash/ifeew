# Supabase Auth + RLS — วิธีเปิดใช้ (เจ้าของกดเอง)

> สถานะปัจจุบัน: แอปใช้ **anon key** ล้วน ไม่มี login (`src/lib/supabase.js`)
> และทุกตารางเปิด policy `using(true)` (ดู `schema.sql`) → ใครมี anon key ก็อ่าน/เขียนได้
>
> ไฟล์นี้ + `migration_auth_rls.sql` เตรียมทางไว้แล้ว **แต่ยังไม่เปิดล็อก** เพราะแอปยังไม่มีหน้า login
> ห้ามรัน PART B ก่อนทำข้อ 3 ให้เสร็จ ไม่งั้นแอปจะหยุดอ่าน/เขียนทันที

## 1. รัน PART A (ปลอดภัย รันได้เลย)

1. Supabase Dashboard > SQL Editor > New query
2. วางเนื้อหา `supabase/migration_auth_rls.sql` **ส่วน PART A** (บรรทัดเหนือคอมเมนต์ `/*` ของ PART B) > Run
3. รันซ้ำได้ — จะได้ตาราง `staff`, ฟังก์ชัน `is_staff()`/`is_owner()` และ policy `staff full access`
   โดย **ไม่กระทบ** anon เดิม → แอปเดิมยังทำงานปกติ

## 2. สร้างผู้ใช้ + ตั้งเจ้าของร้าน

1. Dashboard > Authentication > Users > Add user (อีเมล + รหัสผ่านของเจ้าของ)
2. คัดลอก `id` (uuid) ของผู้ใช้
3. SQL Editor:
   ```sql
   insert into public.staff (user_id, role, display_name)
   values ('<paste-uuid>', 'owner', 'เจ้าของร้าน')
   on conflict (user_id) do update set role = 'owner';
   ```
4. ทำซ้ำกับพนักงานแต่ละคน (role = `staff`)

## 3. เพิ่มหน้า login ฝั่ง client (งานที่ยังไม่ได้ทำ)

ยังไม่ทำในรอบนี้ — ต้องมีก่อนรัน PART B:

- `src/lib/supabase.js`: ใช้ `createClient(url, anonKey)` ได้เหมือนเดิม (session persist เป็นค่า default)
  แต่ควรเปิด `auth: { persistSession: true, autoRefreshToken: true }` ให้ชัดเจน
- เพิ่มหน้า/โมดัล login เรียก `supabase.auth.signInWithPassword({ email, password })`
  แล้วผูกกับ `RoleGate` (ปัจจุบันใช้ PIN จาก `app_settings`)
- ปุ่ม logout: `supabase.auth.signOut()`
- โชว์/ซ่อนเมนูตาม role: ใช้ `is_owner()` — query `select public.is_owner()` หรืออ่านแถว `staff`

## 4. รัน PART B (ล็อก anon) — หลังข้อ 3 ขึ้นระบบจริง

1. ทดสอบ login/logout ผ่านแอปบนมือถือ/เดสก์ท็อปให้ครบทุกเครื่องก่อน
2. เอา `/*` … `*/` ที่ครอบบล็อก PART B ใน `migration_auth_rls.sql` ออก แล้ว Run
3. ผลลัพธ์: policy `open access for pos` ถูกลบ, สิทธิ์ anon ถูก revoke → anon key เดี่ยว ๆ เขียนไม่ได้อีก
4. ตรวจ: เปิดแอปแบบไม่ login ต้องอ่าน/เขียนไม่ได้, login แล้วทำงานได้ปกติ

## 5. ทดสอบ

- [ ] ไม่ login → `select * from bills` ด้วย anon key ต้องได้ 0 แถว / error
- [ ] login เป็น staff → เปิดบิล/เช็คบิลได้
- [ ] login เป็น staff → แก้ `staff` (เพิ่มเจ้าของ) ต้องโดนปฏิเสธ
- [ ] login เป็น owner → แก้ `staff` ได้
- [ ] Realtime (ดู `realtime.sql`) ยังส่ง event หลังล็อกไหม (RLS มีผลกับ realtime ด้วย)

## 6. ย้อนกลับ (rollback)

ถ้าแอปล็อกผิดพลาด ให้รัน:

```sql
do $$
declare t text;
begin
  foreach t in array array['therapists','services','service_categories','addons','promotions',
    'bills','bill_items','expenses','audit_log','app_settings'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='open access for pos') then
      execute format('create policy "open access for pos" on public.%I for all using (true) with check (true)', t);
    end if;
  end loop;
end $$;
grant all on all tables in schema public to anon;
```

## ภาคผนวก — secret ของ push-bill

`push-bill` รองรับการล็อก caller ด้วย secret แล้ว (ดู `functions/push-bill/index.ts`):

1. `supabase secrets set PUSH_WEBHOOK_SECRET=<สุ่มยาว ๆ>`
2. Database Webhook: เพิ่ม header `x-webhook-secret: <ค่าเดียวกัน>`
3. ถ้าไม่ตั้ง env นี้ = ไม่ตรวจ (คงพฤติกรรมเดิม) — แนะนำตั้งเมื่อพร้อม
