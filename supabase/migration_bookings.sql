-- migration_bookings.sql — ตารางการจองจากเว็บลูกค้า (ifeew-booking)
-- รันใน: Supabase Dashboard > SQL Editor > New query > paste > Run
-- Idempotent: รันซ้ำได้อย่างปลอดภัย
-- ใช้ร่วมกับ Edge Function booking-admin (supabase/functions/booking-admin/index.ts)

create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  customer_name text not null default '',
  customer_phone text default '',
  service_name text not null default '',
  therapist_name text default '',
  therapist_id text default '',
  slot_date date not null,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  amount integer not null default 0,        -- บาท (ยอดที่ต้องโอน)
  pay_amount integer default 0,             -- สตางค์ (ยอดจริงที่โอน)
  pay_amount_text text default '',
  payment_status text default 'unpaid',
  slip_image_url text default '',
  slip_verified_at timestamptz,
  slip_sender text default '',
  slip_bank text default '',
  slip_trans_ref text default '',
  status text default 'pending',            -- pending/confirmed/completed/cancelled/expired/cancel_requested
  paid_at timestamptz,
  transaction_id text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- อัปเกรด DB เก่า: เติมคอลัมน์ที่อาจขาดในตารางเดิม
alter table public.bookings add column if not exists therapist_id text default '';
alter table public.bookings add column if not exists pay_amount integer default 0;
alter table public.bookings add column if not exists pay_amount_text text default '';
alter table public.bookings add column if not exists slip_verified_at timestamptz;
alter table public.bookings add column if not exists slip_sender text default '';
alter table public.bookings add column if not exists slip_bank text default '';
alter table public.bookings add column if not exists slip_trans_ref text default '';
alter table public.bookings add column if not exists paid_at timestamptz;
alter table public.bookings add column if not exists transaction_id text default '';
alter table public.bookings add column if not exists updated_at timestamptz default now();

-- Index สำหรับ query ที่ Edge Function ใช้บ่อย
create index if not exists bookings_slot_date_idx on public.bookings(slot_date);
create index if not exists bookings_slot_start_idx on public.bookings(slot_start);
create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists bookings_code_idx on public.bookings(code);
create index if not exists bookings_payment_status_idx on public.bookings(payment_status);

-- RLS: เปิดให้อ่าน/เขียนได้ทุก role (anon ผ่าน Edge Function ที่มี service role key)
-- Edge Function ใช้ service role key จึงผ่าน RLS ได้หมด ไม่ต้องพึ่ง policy ของ anon
alter table public.bookings enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bookings' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.bookings for all using (true) with check (true);
  end if;
end $$;

-- trigger updated_at อัตโนมัติ
create or replace function public.touch_bookings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at before update on public.bookings
  for each row execute function public.touch_bookings_updated_at();

-- booking_events trigger สำหรับ realtime (อ้างอิงจาก src/lib/bookingRealtime.js)
create table if not exists public.booking_events (
  id text primary key default gen_random_uuid()::text,
  booking_id text not null,
  event_type text not null,        -- INSERT / UPDATE / DELETE
  created_at timestamptz default now()
);
alter table public.booking_events enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booking_events' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.booking_events for all using (true) with check (true);
  end if;
end $$;

-- trigger บันทึกเหตุการณ์เปลี่ยนแปลงการจอง (ให้ realtime subscribe ได้)
create or replace function public.trg_booking_changed()
returns trigger language plpgsql as $$
declare
  ev text;
begin
  if tg_op = 'INSERT' then ev := 'INSERT';
  elsif tg_op = 'UPDATE' then ev := 'UPDATE';
  elsif tg_op = 'DELETE' then ev := 'DELETE';
  else return null;
  end if;
  insert into public.booking_events (booking_id, event_type, created_at)
  values (coalesce(new.id, old.id)::text, ev, now());
  return null;
end;
$$;

drop trigger if exists trg_booking_changed on public.bookings;
create trigger trg_booking_changed
  after insert or update or delete on public.bookings
  for each row execute function public.trg_booking_changed();

-- grant ให้ anon ใช้ function และอ่านตาราง (สำหรับกรณีที่อผ่าน edge function โดยตรงไม่ได้)
grant select, insert, update, delete on public.bookings to anon, authenticated;
grant select, insert on public.booking_events to anon, authenticated;
grant execute on function public.trg_booking_changed() to anon, authenticated;
