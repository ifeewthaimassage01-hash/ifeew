-- Migration: รายละเอียดบิล/รายการ + updated_at (newer-wins) + RPC atomic bill_items
-- Run once in Supabase Dashboard > SQL Editor. Idempotent (รันซ้ำได้).
-- ถ้ายังไม่รัน แอปยังเซฟได้แบบลดรูป (tolerantUpsert ตัดคอลัมน์ใหม่ + ขึ้น banner เตือน)
-- ฟิลด์ใหม่จะเริ่มติดถาวรหลังรันไฟล์นี้แล้ว

-- 1. bills: ฟิลด์ระดับบิลที่เคยหายหลัง reload (C1) + updated_at กันทับกัน (C3)
alter table public.bills add column if not exists therapist_id text default '';
alter table public.bills add column if not exists therapist_name text default '';
alter table public.bills add column if not exists start_time text default '';
alter table public.bills add column if not exists end_time text default '';
alter table public.bills add column if not exists promotion text default '';
alter table public.bills add column if not exists subtotal integer not null default 0;
alter table public.bills add column if not exists total integer not null default 0;
alter table public.bills add column if not exists updated_at timestamptz default now();

-- 2. bill_items: ฟิลด์ระดับรายการที่เคยหายหลัง reload (C1)
alter table public.bill_items add column if not exists service_name text default '';
alter table public.bill_items add column if not exists category text default '';
alter table public.bill_items add column if not exists therapist_name text default '';
alter table public.bill_items add column if not exists start_time text default '';
alter table public.bill_items add column if not exists end_time text default '';
alter table public.bill_items add column if not exists duration integer;
alter table public.bill_items add column if not exists total_minutes integer;
alter table public.bill_items add column if not exists addons jsonb not null default '[]'::jsonb;

-- 2b. app_settings รุ่นเก่าไม่มี updated_at (trigger ข้อ 3 ต้องใช้)
-- ขาดแล้ว UPDATE settings จะล้ม 42703 ทุกครั้ง — รวม sync ของแอปด้วย
alter table public.app_settings add column if not exists updated_at timestamptz default now();
update public.app_settings set updated_at = now() where updated_at is null;

-- backfill: updated_at เก่าใช้ created_at ไปก่อน (newer-wins จะได้มีค่าทุกแถว)
update public.bills set updated_at = coalesce(created_at, now()) where updated_at is null;

create index if not exists bills_updated_at_idx on public.bills(updated_at desc);

-- 3. auto-touch updated_at ทุก UPDATE (กันลืมตั้งจาก client/SQL มือ)
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

-- 4. RPC: replace รายการทั้งบิลแบบ atomic ต่อบิล (C2 — แทน delete-then-insert 2 step ฝั่ง client)
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
