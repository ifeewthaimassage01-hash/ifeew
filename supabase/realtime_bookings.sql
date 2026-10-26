-- realtime_bookings.sql — เพิ่มตารางการจองเข้า realtime publication
-- รันหลัง migration_bookings.sql เพื่อให้ frontend realtime (onBookingsChanged) ทำงาน
-- · idempotent — รันซ้ำได้ (ข้ามถ้าตารางอยู่ใน publication แล้ว)
-- · ต้องรันสำเร็จก่อน ช่องเรียลไทม์ฝั่ง POS (จุดเขียว "อัปเดตทันที") ถึงจะมีเหตุการณ์วิ่งจริง
--   ถ้าไม่รัน: subscribe ยังขึ้น SUBSCRIBED ได้ แต่ไม่มีข่าวส่งมา → หนุ่นรอบสำรอง 15/60 วิ
do $$ declare t text; begin
  foreach t in array array['bookings', 'booking_events'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ══ ตรวจผล — รันทั้งไฟล์แล้วดูผลลัพธ์ชุดสุดท้าย ══
-- ต้องเห็นอย่างน้อย 2 แถว: bookings · booking_events (pubname = supabase_realtime)
-- ถ้าแถวใดหาย = ตารางนั้นยังไม่อยู่ใน publication → ช่องเรียลไทม์เดอร์จองไม่ส่งข่าว
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('bookings', 'booking_events')
order by tablename;
