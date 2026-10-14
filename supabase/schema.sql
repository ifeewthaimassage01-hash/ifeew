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
create table if not exists public.bills (
  id text primary key,
  date timestamptz,
  customer text default '',
  member_no text default '',
  payment_method text default '',
  status text not null default 'open',
  discount integer not null default 0,
  created_at timestamptz default now()
);

-- 7. Bill items
create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id text not null references public.bills(id) on delete cascade,
  service_id text,
  therapist_id text,
  qty integer not null default 1,
  price integer not null default 0,
  discount integer not null default 0,
  net integer not null default 0
);
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
  if not exists (select 1 from pg_constraint where conname = 'expenses_amount_check') then
    alter table public.expenses add constraint expenses_amount_check check (amount >= 0) not valid;
  end if;
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

-- RLS: enable + permissive policy for anon (POS has no login yet).
-- Tighten later when Supabase Auth is added.
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

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'open access for pos') then
    create policy "open access for pos" on public.therapists for all using (true) with check (true);
    create policy "open access for pos" on public.services for all using (true) with check (true);
    create policy "open access for pos" on public.service_categories for all using (true) with check (true);
    create policy "open access for pos" on public.addons for all using (true) with check (true);
    create policy "open access for pos" on public.promotions for all using (true) with check (true);
    create policy "open access for pos" on public.bills for all using (true) with check (true);
    create policy "open access for pos" on public.bill_items for all using (true) with check (true);
    create policy "open access for pos" on public.expenses for all using (true) with check (true);
    create policy "open access for pos" on public.audit_log for all using (true) with check (true);
    create policy "open access for pos" on public.app_settings for all using (true) with check (true);
  end if;
end $$;
