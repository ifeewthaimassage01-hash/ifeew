-- I'FEEW Thai Massage POS — Supabase schema
-- Run in: Supabase Dashboard > SQL Editor > New query > paste > Run
-- Idempotent: safe to re-run

-- pgcrypto: สำรองไว้สำหรับ gen_random_uuid() บน Postgres เก่า (Supabase มี pgcrypto ให้อยู่แล้ว)
create extension if not exists pgcrypto;

-- 1. Therapists
create table if not exists public.therapists (
  id text primary key,
  name text not null,
  nickname text not null default '',
  role text not null default 'junior',
  active boolean not null default true,
  created_at timestamptz default now()
);

-- 2. Services
create table if not exists public.services (
  id text primary key,
  category text not null,
  price integer not null default 0,
  duration integer,
  flat_rate numeric not null default 0,
  flat_amount integer,
  tier_category text not null default 'other',
  created_at timestamptz default now()
);

-- 3. Service categories (simple list)
create table if not exists public.service_categories (
  name text primary key
);

-- 4. Addons
create table if not exists public.addons (
  id text primary key,
  name text not null,
  minutes integer not null default 0,
  price integer not null default 0,
  active boolean not null default true
);

-- 5. Promotions
create table if not exists public.promotions (
  id text primary key,
  name text not null,
  amount integer not null default 0,
  active boolean not null default true
);

-- 6. Bills (header; items stored in bill_items)
-- คอลัมน์ใหม่ = ฟิลด์ที่เคยหายหลัง reload (C1) + updated_at ไว้ newer-wins กันทับกัน (C3)
-- DB เก่า: รัน supabase/migration_bill_fields.sql เพื่อเติมคอลัมน์ (ห้ามล้างข้อมูล)
create table if not exists public.bills (
  id text primary key,
  date timestamptz,
  customer text default '',
  member_no text default '',
  payment_method text default '',
  status text not null default 'open',
  discount integer not null default 0,
  created_at timestamptz default now(),
  therapist_id text default '',
  therapist_name text default '',
  start_time text default '',
  end_time text default '',
  promotion text default '',
  subtotal integer not null default 0,
  total integer not null default 0,
  updated_at timestamptz default now()
);
-- อัปเกรด DB เก่า (ตารางมีอยู่แล้วจาก schema รุ่นก่อน): CREATE ข้างบนจะข้าม
-- ต้องเติมคอลัมน์เอง ไม่งั้น index บรรทัดล่างล้มด้วย 42703
alter table public.bills add column if not exists therapist_id text default '';
alter table public.bills add column if not exists therapist_name text default '';
alter table public.bills add column if not exists start_time text default '';
alter table public.bills add column if not exists end_time text default '';
alter table public.bills add column if not exists promotion text default '';
alter table public.bills add column if not exists subtotal integer not null default 0;
alter table public.bills add column if not exists total integer not null default 0;
alter table public.bills add column if not exists updated_at timestamptz default now();
create index if not exists bills_updated_at_idx on public.bills(updated_at desc);

-- 7. Bill items
create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id text not null references public.bills(id) on delete cascade,
  service_id text,
  therapist_id text,
  qty integer not null default 1,
  price integer not null default 0,
  discount integer not null default 0,
  net integer not null default 0,
  service_name text default '',
  category text default '',
  therapist_name text default '',
  start_time text default '',
  end_time text default '',
  duration integer,
  total_minutes integer,
  addons jsonb not null default '[]'::jsonb
);
-- อัปเกรด DB เก่า (เหตุผลเดียวกับ bills ข้างบน)
alter table public.bill_items add column if not exists service_name text default '';
alter table public.bill_items add column if not exists category text default '';
alter table public.bill_items add column if not exists therapist_name text default '';
alter table public.bill_items add column if not exists start_time text default '';
alter table public.bill_items add column if not exists end_time text default '';
alter table public.bill_items add column if not exists duration integer;
alter table public.bill_items add column if not exists total_minutes integer;
alter table public.bill_items add column if not exists addons jsonb not null default '[]'::jsonb;
create index if not exists bill_items_bill_id_idx on public.bill_items(bill_id);

-- ความถูกต้องเบื้องต้น (idempotent, ใช้ NOT VALID จึงไม่ break ข้อมูลเก่า — validate ทีหลังได้)
-- หมายเหตุเสี่ยง break:
--   * bills.status: แอปใช้ 'open'/'paid'/'cancelled' (ไม่มี 'void' ในโค้ดปัจจุบัน) จึง check 3 ค่านี้ + เปิดทาง void
--   * bills.payment_method: ค่าว่าง '' หมายถึงยังไม่จ่าย จึงห้าม NOT NULL (คง default '')
--   * expenses.amount อาจมี 0 ได้ จึง check >= 0 แทน > 0
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bills_status_check') then
    alter table public.bills add constraint bills_status_check
      check (status in ('open', 'paid', 'cancelled', 'void')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bill_items_qty_check') then
    alter table public.bill_items add constraint bill_items_qty_check check (qty >= 1) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bill_items_money_check') then
    alter table public.bill_items add constraint bill_items_money_check
      check (price >= 0 and discount >= 0 and net >= 0) not valid;
  end if;
  -- หมายเหตุ: expenses_amount_check ย้ายไปอยู่หลัง create table expenses ด้านล่าง
  -- (ของเดิมรัน ALTER กับตารางที่ยังไม่ถูกสร้าง ทำให้ติดตั้งใหม่ล้ม)
end $$;

-- 8. Expenses
create table if not exists public.expenses (
  id text primary key,
  date date,
  category text default 'ทั่วไป',
  item text not null default '',
  amount integer not null default 0,
  method text default '',
  approved_by text default '',
  receipt_url text default '',
  notes text default '',
  created_at timestamptz default now()
);

-- CHECK แบบ NOT VALID (ไม่ break ข้อมูลเก่า; ตรวจสะอาดแล้วค่อย VALIDATE ด้วย supabase/validate_constraints.sql)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_amount_check') then
    alter table public.expenses add constraint expenses_amount_check check (amount >= 0) not valid;
  end if;
end $$;

-- 9. Audit log
create table if not exists public.audit_log (
  id text primary key,
  timestamp timestamptz default now(),
  user_name text default '',
  action text default '',
  detail text default '',
  old_value text default '',
  new_value text default '',
  approved_by text default ''
);

-- 10. App settings (singleton blobs: cashDrawer, eodStatus, commissionSettings)
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
-- อัปเกรด DB เก่า: app_settings รุ่นก่อนไม่มี updated_at แต่ trigger ข้างล่างต้องใช้
-- (ขาดแล้ว UPDATE settings ทุกครั้งจะล้ม 42703 — รวม sync ของแอปด้วย)
alter table public.app_settings add column if not exists updated_at timestamptz default now();
update public.app_settings set updated_at = now() where updated_at is null;

-- RLS: enable + permissive policy for anon (POS has no login yet).
-- Tighten later when Supabase Auth is added (ห้ามล็อก RLS จนกว่าจะมีระบบ login).
-- NOTE ความปลอดภัยค้าง: Cloudinary upload preset ฝั่ง client เป็น unsigned —
-- ต้องย้ายไปเซ็นฝั่ง server พร้อมกับตอนทำ login (โน้ตไว้ ไม่แก้ในรอบนี้)
alter table public.therapists enable row level security;
alter table public.services enable row level security;
alter table public.service_categories enable row level security;
alter table public.addons enable row level security;
alter table public.promotions enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_settings enable row level security;

-- guard รายตาราง (ของเดิมเช็ค policy เดียวแล้วสร้างรวด 10 ตาราง — ถ้ามีตารางเดียว policy ครบจะไม่สร้างที่เหลือ)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'therapists' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.therapists for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'services' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.services for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'service_categories' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.service_categories for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'addons' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.addons for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotions' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.promotions for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bills' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.bills for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bill_items' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.bill_items for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.expenses for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.audit_log for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_settings' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.app_settings for all using (true) with check (true);
  end if;
end $$;

-- updated_at auto-touch + RPC sync_bill_items (สำเนาเดียวกับ migration_bill_fields.sql ไว้ให้ DB ติดตั้งใหม่)
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bills_updated_at on public.bills;
create trigger trg_bills_updated_at before update on public.bills
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_settings_updated_at on public.app_settings;
create trigger trg_settings_updated_at before update on public.app_settings
  for each row execute function public.touch_updated_at();

create or replace function public.sync_bill_items(p_bill_id text, p_items jsonb)
returns void
language plpgsql
as $$
begin
  delete from public.bill_items where bill_id = p_bill_id;
  if p_items is null or jsonb_typeof(p_items) != 'array' or jsonb_array_length(p_items) = 0 then
    return;
  end if;
  insert into public.bill_items (
    bill_id, service_id, therapist_id, qty, price, discount, net,
    service_name, category, therapist_name, start_time, end_time,
    duration, total_minutes, addons
  )
  select
    p_bill_id,
    x.service_id, x.therapist_id,
    coalesce(x.qty, 1), coalesce(x.price, 0), coalesce(x.discount, 0), coalesce(x.net, 0),
    coalesce(x.service_name, ''), coalesce(x.category, ''), coalesce(x.therapist_name, ''),
    coalesce(x.start_time, ''), coalesce(x.end_time, ''),
    x.duration, x.total_minutes, coalesce(x.addons, '[]'::jsonb)
  from jsonb_to_recordset(p_items) as x(
    service_id text, therapist_id text, qty int, price int, discount int, net int,
    service_name text, category text, therapist_name text,
    start_time text, end_time text, duration int, total_minutes int, addons jsonb
  );
end;
$$;

grant execute on function public.sync_bill_items(text, jsonb) to anon, authenticated;
