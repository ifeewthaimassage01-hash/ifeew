-- Web Push subscriptions (admin/owner only) — I'FEEW POS
-- รันใน: Supabase Dashboard > SQL Editor > New query > paste > Run
-- Idempotent: รันซ้ำได้ปลอดภัย (ใช้ IF NOT EXISTS + guard แบบเดียวกับ schema.sql)
--
-- เก็บ Web Push subscription ของเครื่องแอดมิน (role='owner')
-- ใช้โดย Edge Functions: push-bill (บิลใหม่) + push-daily (สรุปรายวัน)
-- หมายเหตุ: ตารางนี้เปิด RLS + policy "open access for pos" แบบเดียวกับตารางอื่น
-- (POS ยังไม่มี login — จะล็อก RLS พร้อมตอนทำ Supabase Auth อย่าล็อกก่อน)

create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  role text not null default 'owner',
  label text not null default '',
  created_at timestamptz default now()
);

-- อัปเกรด DB ที่เคยสร้างตารางรุ่นแรก (กันรันซ้ำข้ามเวอร์ชัน)
alter table public.push_subscriptions add column if not exists endpoint text;
alter table public.push_subscriptions add column if not exists p256dh text;
alter table public.push_subscriptions add column if not exists auth text;
alter table public.push_subscriptions add column if not exists role text not null default 'owner';
alter table public.push_subscriptions add column if not exists label text not null default '';
alter table public.push_subscriptions add column if not exists created_at timestamptz default now();

-- กัน endpoint ซ้ำระดับ DB (upsert onConflict endpoint ฝั่งแอปพึ่งตัวนี้)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_endpoint_key') then
    begin
      alter table public.push_subscriptions add constraint push_subscriptions_endpoint_key unique (endpoint);
    exception when duplicate_object then
      -- unique index จาก create table อยู่แล้ว = ข้าม
      null;
    end;
  end if;
end $$;

alter table public.push_subscriptions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'open access for pos') then
    create policy "open access for pos" on public.push_subscriptions for all using (true) with check (true);
  end if;
end $$;
