-- Manual-only: VALIDATE constraints ที่สร้างแบบ NOT VALID ใน schema.sql
-- ห้ามรันอัตโนมัติกับ prod — ต้องตรวจข้อมูลเสียก่อนด้วย SELECT ด้านล่าง
-- ถ้าผล SELECT ว่างหมด ค่อยรัน VALIDATE ทีละบรรทัด (รันซ้ำได้)

-- 1) ตรวจข้อมูลเสียก่อน (ต้องได้ 0 แถวทุกข้อถึง VALIDATE ได้):
-- select * from public.bills where status not in ('open', 'paid', 'cancelled', 'void');
-- select * from public.bill_items where qty < 1 or price < 0 or discount < 0 or net < 0;
-- select * from public.expenses where amount < 0;

-- 2) ข้อมูลสะอาดแล้วค่อยรัน:
alter table public.bills validate constraint bills_status_check;
alter table public.bill_items validate constraint bill_items_qty_check;
alter table public.bill_items validate constraint bill_items_money_check;
alter table public.expenses validate constraint expenses_amount_check;
