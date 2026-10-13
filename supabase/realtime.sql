-- Realtime for POS — run once in Supabase Dashboard > SQL Editor.
-- Adds all POS tables to the supabase_realtime publication so the app
-- receives postgres_changes events (multi-device live sync).
alter publication supabase_realtime add table public.therapists;
alter publication supabase_realtime add table public.services;
alter publication supabase_realtime add table public.service_categories;
alter publication supabase_realtime add table public.addons;
alter publication supabase_realtime add table public.promotions;
alter publication supabase_realtime add table public.bills;
alter publication supabase_realtime add table public.bill_items;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.audit_log;
alter publication supabase_realtime add table public.app_settings;
