-- ============================================================================
-- AquaLedger: Full Clean Reset & Renew Schema (Run in Supabase SQL Editor)
-- ============================================================================
-- WARNING: This script DROPS and RECREATES public.water_reports and its views
-- so you start with a completely fresh, consistent schema supporting:
--   1. Depth-only 3-month readings (all 10 lab columns are nullable/optional)
--   2. Per-user tracked sources (source_id, source_code, source_label)
--   3. City-prefixed report codes (ISB-1, LHR-1, etc.)
--   4. Optional consent-based GPS coordinates
--   5. Strict RLS (users see/insert own rows; single admin sees/updates all)
--   6. Privacy-preserving public area/source trends view for infographics & map
-- ============================================================================

begin;

-- 1. Drop existing views, triggers, functions, and tables cleanly
drop view if exists public.water_public_area_source_trends cascade;
drop view if exists public.water_area_risk_summary cascade;
drop view if exists public.water_report_risk_analysis cascade;
drop table if exists public.water_reports cascade;
drop table if exists public.water_report_code_counters cascade;
drop table if exists public.user_source_code_counters cascade;

-- 2. Main water_reports table (lab columns are nullable for depth-only logs)
create table public.water_reports (
  id uuid primary key default gen_random_uuid(),
  report_code text unique,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,

  -- Source tracking
  source_id uuid not null,
  source_code text not null,
  source_label text not null,
  source_type text not null,

  -- Location & optional GPS
  reporter_name text not null,
  area_name text,
  street_address text,
  address text not null,
  location_consent boolean not null default false,
  latitude double precision,
  longitude double precision,
  location_accuracy_m double precision,
  location_captured_at timestamptz,

  -- Depth & timeline
  source_depth_m numeric not null check (source_depth_m >= 0),
  sample_date date not null,
  main_concern text not null default 'Seasonal 3-month check',
  review_status text not null default 'under_review'
    check (review_status in ('received', 'under_review', 'verified', 'rejected')),

  -- Optional lab quality measurements (nullable)
  ph numeric,
  tds_mg_l numeric,
  turbidity_ntu numeric,
  conductivity_us_cm numeric,
  hardness_mg_l numeric,
  chloride_mg_l numeric,
  nitrate_mg_l numeric,
  fluoride_mg_l numeric,
  arsenic_ug_l numeric,
  ecoli_result text
);

create index water_reports_owner_source_date_idx
  on public.water_reports(created_by, source_id, sample_date desc);

create index water_reports_created_at_idx
  on public.water_reports(created_at desc);

-- 3. Report code counters & trigger (ISB-1, LHR-1, KHI-1, etc.)
create table public.water_report_code_counters (
  city_code text primary key,
  last_value bigint not null default 0
);

alter table public.water_report_code_counters enable row level security;
revoke all on public.water_report_code_counters from anon, authenticated;

create or replace function public.aqualedger_report_city_code(p_address text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(islamabad|ict)([^[:alpha:]]|$)' then 'ISB'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(karachi)([^[:alpha:]]|$)' then 'KHI'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(lahore)([^[:alpha:]]|$)' then 'LHR'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(peshawar)([^[:alpha:]]|$)' then 'PSH'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(quetta)([^[:alpha:]]|$)' then 'QTA'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(multan)([^[:alpha:]]|$)' then 'MUL'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(faisalabad)([^[:alpha:]]|$)' then 'FSD'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(rawalpindi|pindi)([^[:alpha:]]|$)' then 'RWP'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(hyderabad)([^[:alpha:]]|$)' then 'HYD'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(sialkot)([^[:alpha:]]|$)' then 'SKT'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(gujranwala)([^[:alpha:]]|$)' then 'GRW'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(bahawalpur)([^[:alpha:]]|$)' then 'BWP'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(sukkur)([^[:alpha:]]|$)' then 'SKR'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(abbottabad)([^[:alpha:]]|$)' then 'ATD'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(murree)([^[:alpha:]]|$)' then 'MUR'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(sargodha)([^[:alpha:]]|$)' then 'SGD'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(gujrat)([^[:alpha:]]|$)' then 'GRT'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(gilgit)([^[:alpha:]]|$)' then 'GIL'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(skardu)([^[:alpha:]]|$)' then 'KDU'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(muzaffarabad)([^[:alpha:]]|$)' then 'MZD'
    when coalesce(p_address, '') ~* '(^|[^[:alpha:]])(mirpur)([^[:alpha:]]|$)' then 'MIR'
    else coalesce(
      nullif(left(regexp_replace(btrim(split_part(coalesce(p_address, ''), ',', array_length(string_to_array(coalesce(p_address, ''), ','), 1))), '[^[:alpha:]]', '', 'g'), 3), ''),
      'PAK'
    )
  end;
$$;

create or replace function public.aqualedger_assign_report_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city_code text;
  v_next bigint;
begin
  if new.report_code is null or btrim(new.report_code) = '' then
    v_city_code := public.aqualedger_report_city_code(new.address);
    insert into public.water_report_code_counters(city_code, last_value)
    values (v_city_code, 1)
    on conflict (city_code) do update
      set last_value = public.water_report_code_counters.last_value + 1
    returning last_value into v_next;
    new.report_code := v_city_code || '-' || v_next::text;
  end if;
  return new;
end;
$$;

create trigger water_reports_assign_report_code
before insert on public.water_reports
for each row execute function public.aqualedger_assign_report_code();

revoke all on function public.aqualedger_report_city_code(text) from public, anon, authenticated;
revoke all on function public.aqualedger_assign_report_code() from public, anon, authenticated;

-- 3b. Per-user sequential source codes (SRC-1, SRC-2, ...) with globally unique source_id UUID
create table public.user_source_code_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_value bigint not null default 0
);

alter table public.user_source_code_counters enable row level security;
revoke all on public.user_source_code_counters from anon, authenticated;

create or replace function public.aqualedger_assign_source_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_code text;
  v_next bigint;
begin
  -- Reuse existing source_code if this user already logged a reading for this source_id
  select wr.source_code into v_existing_code
  from public.water_reports as wr
  where wr.created_by = new.created_by
    and wr.source_id = new.source_id
    and nullif(btrim(wr.source_code), '') is not null
  limit 1;

  if v_existing_code is not null then
    new.source_code := v_existing_code;
    return new;
  end if;

  if new.source_code is null or btrim(new.source_code) = '' or new.source_code = 'SRC-PENDING' then
    insert into public.user_source_code_counters(user_id, last_value)
    values (new.created_by, 1)
    on conflict (user_id) do update
      set last_value = public.user_source_code_counters.last_value + 1
    returning last_value into v_next;
    new.source_code := 'SRC-' || v_next::text;
  end if;
  return new;
end;
$$;

create trigger water_reports_assign_source_code
before insert on public.water_reports
for each row execute function public.aqualedger_assign_source_code();

revoke all on function public.aqualedger_assign_source_code() from public, anon, authenticated;

-- 4. Row Level Security (RLS)
alter table public.water_reports enable row level security;
revoke all on public.water_reports from anon;
grant select, insert, update on public.water_reports to authenticated;

create policy water_reports_insert_own
  on public.water_reports for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and source_id is not null
    and nullif(trim(source_code), '') is not null
    and nullif(trim(source_label), '') is not null
  );

create policy water_reports_select_own_or_admin
  on public.water_reports for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy water_reports_update_admin
  on public.water_reports for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 5. Per-report risk analysis view (respects RLS via security_invoker = true)
create or replace view public.water_report_risk_analysis
with (security_invoker = true)
as
with address_parts as (
  select
    wr.*,
    regexp_split_to_array(coalesce(wr.address, ''), '\s*,\s*') as parts
  from public.water_reports as wr
), normalized as (
  select
    ap.*,
    coalesce(nullif(trim(ap.area_name), ''), case
      when lower(trim(ap.parts[cardinality(ap.parts)])) in (
        'punjab', 'sindh', 'khyber pakhtunkhwa', 'kpk', 'balochistan', 'ict',
        'islamabad capital territory', 'azad jammu and kashmir', 'ajk', 'gilgit-baltistan', 'gilgit baltistan'
      ) and cardinality(ap.parts) >= 3 then
        concat_ws(', ', nullif(trim(ap.parts[cardinality(ap.parts) - 2]), ''), nullif(trim(ap.parts[cardinality(ap.parts) - 1]), ''))
      when lower(trim(ap.parts[cardinality(ap.parts)])) in (
        'punjab', 'sindh', 'khyber pakhtunkhwa', 'kpk', 'balochistan', 'ict',
        'islamabad capital territory', 'azad jammu and kashmir', 'ajk', 'gilgit-baltistan', 'gilgit baltistan'
      ) and cardinality(ap.parts) = 2 then nullif(trim(ap.parts[1]), '')
      when cardinality(ap.parts) >= 2 then
        concat_ws(', ', nullif(trim(ap.parts[cardinality(ap.parts) - 1]), ''), nullif(trim(ap.parts[cardinality(ap.parts)]), ''))
      else coalesce(nullif(trim(ap.address), ''), 'Area not provided')
    end) as area_key,
    (
      nullif(trim(ap.reporter_name), '') is null or nullif(trim(ap.address), '') is null or
      nullif(trim(ap.source_type), '') is null or ap.source_depth_m is null or ap.sample_date is null or
      ap.ph is null or ap.tds_mg_l is null or ap.turbidity_ntu is null or ap.conductivity_us_cm is null or
      ap.hardness_mg_l is null or ap.chloride_mg_l is null or ap.nitrate_mg_l is null or
      ap.fluoride_mg_l is null or ap.arsenic_ug_l is null or nullif(trim(ap.ecoli_result), '') is null
    ) as is_incomplete,
    (
      (nullif(trim(ap.ecoli_result), '') is not null and lower(trim(ap.ecoli_result)) not in ('not detected', 'absent', 'negative', '0', 'none') and lower(trim(ap.ecoli_result)) not like '%not detected%') or
      ap.arsenic_ug_l > 10 or ap.nitrate_mg_l > 50 or ap.fluoride_mg_l > 1.5
    ) as has_high_flag,
    (
      ap.ph < 6.5 or ap.ph > 8.5 or ap.tds_mg_l >= 1000 or ap.turbidity_ntu >= 5 or
      ap.hardness_mg_l >= 500 or ap.chloride_mg_l >= 250
    ) as has_moderate_flag
  from address_parts as ap
), screened as (
  select
    n.*,
    case
      when n.has_high_flag then 'High concern'
      when n.has_moderate_flag then 'Moderate concern'
      when n.is_incomplete then 'Incomplete'
      else 'Normal'
    end as risk_level
  from normalized as n
)
select
  s.*,
  case s.risk_level
    when 'Normal' then 0.5::numeric
    when 'Moderate concern' then 1::numeric
    when 'High concern' then 2::numeric
    else null::numeric
  end as risk_weight,
  case
    when s.is_incomplete then 'Incomplete'
    when s.review_status = 'verified' then 'Verified'
    else 'Not verified'
  end as verification_state
from screened as s;

-- 6. Area risk summary view
create or replace view public.water_area_risk_summary
with (security_invoker = true)
as
with area_counts as (
  select
    lower(area_key) as normalized_area_key,
    min(area_key) as area_key,
    count(*)::integer as report_count,
    count(*) filter (where risk_level = 'Normal')::integer as normal_count,
    count(*) filter (where risk_level = 'Moderate concern')::integer as moderate_count,
    count(*) filter (where risk_level = 'High concern')::integer as high_count,
    count(*) filter (where verification_state = 'Incomplete')::integer as incomplete_count,
    count(risk_weight)::integer as assessed_count,
    avg(risk_weight) as weighted_score
  from public.water_report_risk_analysis
  group by lower(area_key)
)
select
  area_key,
  report_count,
  normal_count,
  moderate_count,
  high_count,
  incomplete_count,
  assessed_count,
  weighted_score,
  case
    when weighted_score is null then 'Incomplete'
    when weighted_score < 0.75 then 'Normal'
    when weighted_score < 1.5 then 'Moderate concern'
    else 'High concern'
  end as area_risk_level
from area_counts;

-- 7. Public privacy-preserving area & source trends view (for infographics, map & benchmarks)
create or replace view public.water_public_area_source_trends as
with raw_reports as (
  select to_jsonb(wr) as row_data
  from public.water_reports as wr
), normalized as (
  select
    coalesce(row_data->>'address', '') as address,
    nullif(trim(row_data->>'area_name'), '') as area_name,
    coalesce(row_data->>'source_type', 'Unspecified source') as source_type,
    coalesce(row_data->>'review_status', '') as review_status,
    row_data->>'reporter_name' as reporter_name,
    nullif(row_data->>'sample_date', '')::date as sample_date,
    nullif(row_data->>'source_depth_m', '')::numeric as source_depth_m,
    nullif(row_data->>'ph', '')::numeric as ph,
    nullif(row_data->>'tds_mg_l', '')::numeric as tds_mg_l,
    nullif(row_data->>'turbidity_ntu', '')::numeric as turbidity_ntu,
    nullif(row_data->>'conductivity_us_cm', '')::numeric as conductivity_us_cm,
    nullif(row_data->>'hardness_mg_l', '')::numeric as hardness_mg_l,
    nullif(row_data->>'chloride_mg_l', '')::numeric as chloride_mg_l,
    nullif(row_data->>'nitrate_mg_l', '')::numeric as nitrate_mg_l,
    nullif(row_data->>'fluoride_mg_l', '')::numeric as fluoride_mg_l,
    nullif(row_data->>'arsenic_ug_l', '')::numeric as arsenic_ug_l,
    nullif(row_data->>'ecoli_result', '') as ecoli_result,
    ((row_data->>'ph') is not null)::integer +
    ((row_data->>'tds_mg_l') is not null)::integer +
    ((row_data->>'turbidity_ntu') is not null)::integer +
    ((row_data->>'conductivity_us_cm') is not null)::integer +
    ((row_data->>'hardness_mg_l') is not null)::integer +
    ((row_data->>'chloride_mg_l') is not null)::integer +
    ((row_data->>'nitrate_mg_l') is not null)::integer +
    ((row_data->>'fluoride_mg_l') is not null)::integer +
    ((row_data->>'arsenic_ug_l') is not null)::integer +
    ((row_data->>'ecoli_result') is not null)::integer as lab_measurement_count
  from raw_reports
), identified as (
  select
    *,
    case
      when address ~* '(^|[^[:alpha:]])(islamabad|ict)([^[:alpha:]]|$)' then 'Islamabad'
      when address ~* '(^|[^[:alpha:]])karachi([^[:alpha:]]|$)' then 'Karachi'
      when address ~* '(^|[^[:alpha:]])lahore([^[:alpha:]]|$)' then 'Lahore'
      when address ~* '(^|[^[:alpha:]])peshawar([^[:alpha:]]|$)' then 'Peshawar'
      when address ~* '(^|[^[:alpha:]])quetta([^[:alpha:]]|$)' then 'Quetta'
      when address ~* '(^|[^[:alpha:]])multan([^[:alpha:]]|$)' then 'Multan'
      when address ~* '(^|[^[:alpha:]])faisalabad([^[:alpha:]]|$)' then 'Faisalabad'
      when address ~* '(^|[^[:alpha:]])(rawalpindi|pindi)([^[:alpha:]]|$)' then 'Rawalpindi'
      when address ~* '(^|[^[:alpha:]])hyderabad([^[:alpha:]]|$)' then 'Hyderabad'
      when address ~* '(^|[^[:alpha:]])sialkot([^[:alpha:]]|$)' then 'Sialkot'
      when address ~* '(^|[^[:alpha:]])gujranwala([^[:alpha:]]|$)' then 'Gujranwala'
      when address ~* '(^|[^[:alpha:]])bahawalpur([^[:alpha:]]|$)' then 'Bahawalpur'
      when address ~* '(^|[^[:alpha:]])sukkur([^[:alpha:]]|$)' then 'Sukkur'
      else 'Other areas'
    end as city_name
  from normalized
), localized as (
  select
    *,
    case when city_name = 'Other areas' then null else nullif(trim(both ' ,-' from regexp_replace(
      regexp_replace(address, case city_name
        when 'Islamabad' then '(?i)(^|[^[:alpha:]])(islamabad|ict)([^[:alpha:]]|$)'
        else '(?i)(^|[^[:alpha:]])' || city_name || '([^[:alpha:]]|$)'
      end, ' ', 'g'),
      '(^|,)[[:space:]]*[0-9]+[[:space:]]*', '\1', 'g'
    )), '') end as locality
  from identified
), assessed as (
  select
    *,
    case
      when (ecoli_result is not null and lower(trim(ecoli_result)) not in ('not detected', 'absent', 'negative', '0', 'none') and lower(trim(ecoli_result)) not like '%not detected%')
        or arsenic_ug_l > 10 or nitrate_mg_l > 50 or fluoride_mg_l > 1.5 then 'High concern'
      when ph < 6.5 or ph > 8.5 or tds_mg_l >= 1000 or turbidity_ntu >= 5 or hardness_mg_l >= 500 or chloride_mg_l >= 250 then 'Moderate concern'
      when reporter_name is null or address = '' or source_type is null or source_depth_m is null or sample_date is null
        or ph is null or tds_mg_l is null or turbidity_ntu is null or conductivity_us_cm is null or hardness_mg_l is null
        or chloride_mg_l is null or nitrate_mg_l is null or fluoride_mg_l is null or arsenic_ug_l is null or ecoli_result is null then 'Incomplete'
      else 'Normal'
    end as risk_level
  from localized
)
select
  coalesce(area_name, concat_ws(', ', locality, city_name)) as area_key,
  city_name,
  coalesce(nullif(trim(source_type), ''), 'Unspecified source') as source_type,
  date_trunc('month', sample_date)::date as sample_month,
  count(*)::integer as report_count,
  avg(source_depth_m)::numeric(10,2) as average_depth_m,
  count(*) filter (where risk_level = 'High concern')::integer as high_count,
  count(*) filter (where risk_level = 'Moderate concern')::integer as moderate_count,
  count(*) filter (where risk_level = 'Normal')::integer as normal_count,
  count(*) filter (where risk_level = 'Incomplete')::integer as incomplete_count,
  avg(case risk_level when 'Normal' then 0.5 when 'Moderate concern' then 1 when 'High concern' then 2 else null end)::numeric(5,2) as weighted_risk_score,
  sum(lab_measurement_count)::integer as lab_measurement_count,
  count(*) filter (where lower(review_status) in ('received', 'under_review'))::integer as awaiting_review_count,
  sample_date as sample_day
from assessed
group by area_name, locality, city_name, source_type, date_trunc('month', sample_date)::date, sample_date;

grant select on public.water_report_risk_analysis to authenticated;
grant select on public.water_area_risk_summary to authenticated;
grant select on public.water_public_area_source_trends to anon, authenticated;

commit;
notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER RUNNING ABOVE: Assign your single Admin account role
-- Replace 'your-admin-email@example.com' with your admin email, run it, and sign in again:
-- ============================================================================
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'your-admin-email@example.com';
