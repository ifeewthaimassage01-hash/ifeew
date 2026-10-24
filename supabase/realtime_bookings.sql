-- realtime_bookings.sql — เพิ่มตารางการจองเข้า realtime publication
-- รันหลัง migration_bookings.sql เพื่อให้ frontend realtime (onBookingsChanged) ทำงาน
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
