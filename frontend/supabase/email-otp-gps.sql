-- Email OTP report ownership and optional, consent-based GPS fields.
-- Run in Supabase SQL Editor after deploying the matching frontend code.
-- Safe to rerun: report columns are added only if missing and policies are replaced by name.
begin;

alter table public.water_reports
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists area_name text,
  add column if not exists street_address text,
  add column if not exists source_id uuid,
  add column if not exists source_code text,
  add column if not exists source_label text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_accuracy_m double precision,
  add column if not exists location_captured_at timestamptz,
  add column if not exists location_consent boolean not null default false;

alter table public.water_reports enable row level security;
create index if not exists water_reports_owner_source_date_idx
  on public.water_reports(created_by, source_id, sample_date);
revoke insert on public.water_reports from anon;
grant select, insert, update on public.water_reports to authenticated;

-- Restrictive policies narrow any pre-existing broad authenticated policies.
drop policy if exists water_reports_authenticated_insert_own_guard on public.water_reports;
create policy water_reports_authenticated_insert_own_guard
  on public.water_reports as restrictive for insert to authenticated
  with check (
    created_by = (select auth.uid()) and source_id is not null and
    nullif(trim(source_code), '') is not null and nullif(trim(source_label), '') is not null
  );

drop policy if exists water_reports_authenticated_select_guard on public.water_reports;
create policy water_reports_authenticated_select_guard
  on public.water_reports as restrictive for select to authenticated
  using (created_by = (select auth.uid()) or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists water_reports_authenticated_update_guard on public.water_reports;
create policy water_reports_authenticated_update_guard
  on public.water_reports as restrictive for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Permissive policies authorize only the intended authenticated operations.
drop policy if exists water_reports_insert_own on public.water_reports;
create policy water_reports_insert_own
  on public.water_reports for insert to authenticated
  with check (
    created_by = (select auth.uid()) and source_id is not null and
    nullif(trim(source_code), '') is not null and nullif(trim(source_label), '') is not null
  );

drop policy if exists water_reports_select_own_or_admin on public.water_reports;
create policy water_reports_select_own_or_admin
  on public.water_reports for select to authenticated
  using (created_by = (select auth.uid()) or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists water_reports_update_admin on public.water_reports;
create policy water_reports_update_admin
  on public.water_reports for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

commit;
notify pgrst, 'reload schema';

-- Assign administrator access separately, replacing the email with the existing
-- trusted administrator's Supabase Auth email, then have that account sign in again:
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'admin@example.com';
