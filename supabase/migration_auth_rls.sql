-- migration_auth_rls.sql — Supabase Auth + Row Level Security (แบบเป็นขั้น, ไม่ทำลายข้อมูลเริ่มต้น)
-- I'FEEW Thai Massage POS
--
-- ⚠️ อ่านก่อนรัน (สำคัญ):
--   ตอนนี้แอปยังไม่มีหน้า login — ใช้ anon key ตรง ๆ (ดู src/lib/supabase.js)
--   ไฟล์นี้แบ่งเป็น 2 ส่วน:
--     PART A (ปลอดภัย รันได้เลย): เพิ่มตาราง staff + ฟังก์ชันช่วย + policy สำหรับ role authenticated
--       โดย "ไม่แตะ" policy เดิมของ anon → แอปที่ยังไม่ login ยังทำงานได้ปกติ
--     PART B (รันหลัง deploy client login เท่านั้น): ปิด policy anon ทั้งหมด (ล็อกจริง)
--       ถ้ารัน PART B ก่อนมี login → แอปจะเขียน/อ่านไม่ได้ทันที (เจตนา กันคนนอกเข้ายอดขาย)
--   ขั้นตอน deploy เต็มดู supabase/AUTH_RLS_SETUP.md
--
-- Idempotent: รันซ้ำได้

-- =====================================================================
-- PART A — additive (รันได้ทุกเมื่อ)
-- =====================================================================

-- A1. ตาราง allowlist พนักงาน: ผูก auth.users → บทบาทในร้าน
create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  display_name text default '',
  created_at timestamptz default now()
);
alter table public.staff enable row level security;

-- A2. ฟังก์ชันช่วย (security definer เพื่ออ่าน staff ได้แม้ถูก RLS ปิดไว้)
--     คืน true เมื่อผู้ใช้ปัจจุบันอยู่ใน allowlist
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'owner');
$$;

grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- A3. staff: พนักงานอ่านได้, เจ้าของแก้ได้ (ใช้ is_owner เพื่อกันแก้ allowlist เอง)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='staff' and policyname='staff read self') then
    create policy "staff read self" on public.staff for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='staff' and policyname='owner manage staff') then
    create policy "owner manage staff" on public.staff for all to authenticated
      using (public.is_owner()) with check (public.is_owner());
  end if;
end $$;

-- A4. policy "staff full access" ให้ role authenticated บนตารางข้อมูลร้าน
--     (อยู่คู่กับ policy anon เดิม — ตัวไหนตรง role ก็ใช้ตัวนั้น)
do $$
declare t text;
begin
  foreach t in array array[
    'therapists','services','service_categories','addons','promotions',
    'bills','bill_items','expenses','audit_log','app_settings'
  ] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='staff full access') then
      execute format(
        'create policy "staff full access" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())',
        t
      );
    end if;
  end loop;
end $$;

-- A5. ตัวอย่าง bootstrap เจ้าของร้าน (แก้ e-mail แล้วค่อยรัน):
-- select id from auth.users where email = 'owner@example.com';
-- insert into public.staff (user_id, role, display_name) values ('<paste-uuid>', 'owner', 'เจ้าของร้าน')
--   on conflict (user_id) do update set role = 'owner';

-- =====================================================================
-- PART B — ล็อก anon จริง (รันเฉพาะหลัง client login พร้อมใช้งาน)
-- วิธีใช้: ลบ comment ของบล็อกล่างนี้ทั้งก้อน แล้วรัน
-- =====================================================================
/*
do $$
declare t text;
begin
  foreach t in array array[
    'therapists','services','service_categories','addons','promotions',
    'bills','bill_items','expenses','audit_log','app_settings'
  ] loop
    execute format('drop policy if exists "open access for pos" on public.%I', t);
  end loop;
end $$;

-- ตัดสิทธิ์ anon ที่ระดับตาราง (เผื่อ grant ค้างจากรุ่นก่อน)
revoke all on public.therapists, public.services, public.service_categories,
  public.addons, public.promotions, public.bills, public.bill_items,
  public.expenses, public.audit_log, public.app_settings, public.staff
  from anon;
*/
