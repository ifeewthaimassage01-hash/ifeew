-- migration_merged_status.sql — รองรับสถานะ 'merged' (ฟีเจอร์รวมบิล, v1.2.0)
-- ปัญหา: INSERT/UPDATE bills สถานะ 'merged' โดน check constraint bills_status_check ปฏิเสธ
-- แก้: เปิดชุดสถานะให้รวม 'merged' โดยคงชุดเดิม ('void' ซึ่งมีใน constraint เดิมคงไว้ด้วย)
-- constraint เดิมเป็น NOT VALID — คง NOT VALID ไว้เหมือนเดิม (ไม่สแกนตารางทั้งหมดตอน apply)
-- รันใน Supabase SQL Editor (project zpxkhimaatxfhzzgmopw) หรือผ่าน supabase CLI db query

ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_status_check;
ALTER TABLE public.bills ADD CONSTRAINT bills_status_check
  CHECK (status = ANY (ARRAY['open'::text, 'paid'::text, 'cancelled'::text, 'void'::text, 'merged'::text]))
  NOT VALID;
