-- Migration: Cloudinary image URLs + multi-branch ready
-- Run once in Supabase Dashboard > SQL Editor
alter table public.bills add column if not exists slip_url text default '';
alter table public.bills add column if not exists paid_at timestamptz;
alter table public.bills add column if not exists branch_id text default 'main';
alter table public.expenses add column if not exists branch_id text default 'main';

-- backfill existing rows
update public.bills set branch_id = 'main' where branch_id is null;
update public.expenses set branch_id = 'main' where branch_id is null;

create index if not exists bills_branch_id_idx on public.bills(branch_id);
create index if not exists expenses_branch_id_idx on public.expenses(branch_id);
