-- Realtime for POS — run in Supabase Dashboard > SQL Editor. Idempotent (รันซ้ำได้).
-- Adds all POS tables to the supabase_realtime publication so the app
-- receives postgres_changes events (multi-device live sync).
do $$ declare t text; begin
  foreach t in array array[
    'therapists', 'services', 'service_categories', 'addons', 'promotions',
    'bills', 'bill_items', 'expenses', 'audit_log', 'app_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
