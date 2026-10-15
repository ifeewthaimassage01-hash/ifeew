-- P0-3: กัน 2 เครื่องสร้างรายจ่าย "ประกันมือหมอ" ซ้ำกัน (race condition)
-- ============================================================================
-- ที่มา: ประกันมือสร้าง expense row ต่อ (therapistId × วันที่ธุรกิจ) โดย dedupe
-- ฝั่งแอปด้วย notes key `guarantee:{therapistId}:{YYYY-MM-DD}` (ดู ensureGuaranteeEntries
-- ใน src/lib/billing.js — ห้ามแก้ logic ข้างใน ใช้ import อย่างเดียว) แต่ถ้า 2 เครื่อง
-- ensure พร้อมกันก่อนเห็นข้อมูลของกันและกัน จะ upsert แถวคนละ id แต่ notes key
-- เดียวกันขึ้น cloud ทั้งคู่ (แถวซ้ำ)
--
-- วิธีกัน: partial unique index บน expenses(notes) เฉพาะแถวประกันมือ
-- (notes ขึ้นต้น 'guarantee:') — เครื่องที่มาช้ากว่าจะได้ 23505 แล้วฝั่งแอป
-- (syncDataToCloud โซน expenses ใน src/data/cloudSync.js) จะดึงแถวประกันจาก cloud
-- มาเทียบ notes key, ตัดแถวซ้ำฝั่ง local ทิ้ง (เก็บเวอร์ชัน cloud) แล้ว retry ครั้งเดียว
--
-- ทำไมเป็น partial index (ไม่ใช่ unique ทั้งคอลัมน์):
-- แถวรายจ่ายทั่วไปใช้ notes ว่าง/อิสระ (ซ้ำกันได้ปกติ) จึงล็อกเฉพาะแถวที่ notes
-- ขึ้นต้น 'guarantee:' เท่านั้น แถวอื่นไม่ได้รับผลกระทบใดๆ
--
-- วิธีรัน: Supabase Dashboard > SQL Editor > New query > วางไฟล์นี้ > Run
-- Idempotent: รันซ้ำได้ (IF NOT EXISTS) — ห้ามแตะไฟล์ .sql อื่นในโฟลเดอร์นี้
-- หมายเหตุ: ถ้าสร้าง index ล้มเพราะมีแถวซ้ำค้างอยู่ ให้ลบแถวซ้ำออกก่อน
-- (ตัวอย่างอยู่ท้ายไฟล์แบบ comment — เก็บแถวใหม่สุดของแต่ละ notes key) แล้วรันใหม่
-- ============================================================================

create unique index if not exists ux_expenses_guarantee_key
  on public.expenses (notes)
  where notes like 'guarantee:%';

-- (ตัวอย่างลบแถวประกันมือที่ซ้ำค้างก่อนสร้าง index — เปิดใช้เฉพาะเมื่อสร้าง index ไม่ผ่าน)
-- delete from public.expenses a
--   using public.expenses b
--   where a.ctid < b.ctid
--     and a.notes like 'guarantee:%'
--     and a.notes = b.notes;
