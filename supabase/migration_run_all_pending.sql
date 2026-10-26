-- ═══ รวม migration ที่ยังไม่ได้รัน — วางใน Supabase Dashboard > SQL Editor แล้วกด Run ครั้งเดียว ═══
-- ทุก statement idempotent (รันซ้ำได้) · รวมจาก 4 ไฟล์:
--   migration_pos_booking_bill.sql  → customer_type / booked_date / booker_name / booker_id (บิลจอง)
--   migration_cloudinary_branch.sql → slip_url / paid_at / branch_id / fuel
--   migration_bill_fields.sql       → ฟิลด์บิล+รายการ, updated_at + trigger, RPC sync_bill_items
--   migration_guarantee.sql         → unique index กันรายจ่ายประกันมือซ้ำ
-- หลังรันเสร็จ: reload แอป (banner เตือนจะหาย ข้อมูลลูกค้าจองจะถูกบันทึกถาวร)

-- ── 1) บิลจอง (ร้านรับเอง) ──
alter table public.bills add column if not exists customer_type text not null default 'walkin';
alter table public.bills add column if not exists booked_date text not null default '';
alter table public.bills add column if not exists booker_name text not null default '';
alter table public.bills add column if not exists booker_id text not null default '';

-- ── 2) Cloudinary + multi-branch + ค่าน้ำมันหมอวิ่ง ──
alter table public.bills add column if not exists slip_url text default '';
alter table public.bills add column if not exists paid_at timestamptz;
alter table public.bills add column if not exists branch_id text default 'main';
alter table public.expenses add column if not exists branch_id text default 'main';

update public.bills set branch_id = 'main' where branch_id is null;
update public.expenses set branch_id = 'main' where branch_id is null;

create index if not exists bills_branch_id_idx on public.bills(branch_id);
create index if not exists expenses_branch_id_idx on public.expenses(branch_id);

alter table public.bills add column if not exists fuel integer not null default 0;

-- ── 3) ฟิลด์บิล/รายการ + updated_at (newer-wins) + RPC atomic bill_items ──
alter table public.bills add column if not exists therapist_id text default '';
alter table public.bills add column if not exists therapist_name text default '';
alter table public.bills add column if not exists start_time text default '';
alter table public.bills add column if not exists end_time text default '';
alter table public.bills add column if not exists promotion text default '';
alter table public.bills add column if not exists subtotal integer not null default 0;
alter table public.bills add column if not exists total integer not null default 0;
alter table public.bills add column if not exists updated_at timestamptz default now();

alter table public.bill_items add column if not exists service_name text default '';
alter table public.bill_items add column if not exists category text default '';
alter table public.bill_items add column if not exists therapist_name text default '';
alter table public.bill_items add column if not exists start_time text default '';
alter table public.bill_items add column if not exists end_time text default '';
alter table public.bill_items add column if not exists duration integer;
alter table public.bill_items add column if not exists total_minutes integer;
alter table public.bill_items add column if not exists addons jsonb not null default '[]'::jsonb;

-- app_settings รุ่นเก่าไม่มี updated_at (trigger ด้านล่างต้องใช้)
alter table public.app_settings add column if not exists updated_at timestamptz default now();
update public.app_settings set updated_at = now() where updated_at is null;

-- backfill: updated_at เก่าใช้ created_at ไปก่อน (newer-wins จะได้มีค่าทุกแถว)
update public.bills set updated_at = coalesce(created_at, now()) where updated_at is null;

create index if not exists bills_updated_at_idx on public.bills(updated_at desc);

-- auto-touch updated_at ทุก UPDATE (กันลืมตั้งจาก client/SQL มือ)
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

-- RPC: replace รายการทั้งบิลแบบ atomic ต่อบิล (แทน delete+insert 2 step ฝั่ง client)
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

-- ── 4) กันรายจ่าย "ประกันมือหมอ" ซ้ำ (2 เครื่อง sync พร้อมกัน) ──
create unique index if not exists ux_expenses_guarantee_key
  on public.expenses (notes)
  where notes like 'guarantee:%';
