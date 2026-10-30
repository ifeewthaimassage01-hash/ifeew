-- Migration: บิลจอง (ลูกค้าโทรมาจอง) — ประเภทลูกค้า / วันที่ให้บริการ / ผู้รับจอง
-- Run once in Supabase Dashboard > SQL Editor. Idempotent (รันซ้ำได้).
-- ถ้ายังไม่รัน แอปยังเซฟได้แบบลดรูป (tolerantUpsert ตัดคอลัมน์ใหม่ + ขึ้น banner เตือน)
-- ฟิลด์ใหม่จะติดถาวรหลังรันไฟล์นี้แล้ว

alter table public.bills add column if not exists customer_type text not null default 'walkin';
alter table public.bills add column if not exists booked_date text not null default '';
alter table public.bills add column if not exists booker_name text not null default '';
alter table public.bills add column if not exists booker_id text not null default '';
