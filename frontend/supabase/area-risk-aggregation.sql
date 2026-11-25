-- Run once in Supabase SQL Editor. This creates read-only views; it does not alter or delete reports.
-- Per-report screening is calculated in PostgreSQL. Area labels combine locality + city when
-- addresses are comma-separated and end in a recognized Pakistan region/province.
-- Recreate dependent views after the report table receives new area/location columns.
drop view if exists public.water_area_risk_summary;
drop view if exists public.water_report_risk_analysis;

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

grant select on public.water_report_risk_analysis to authenticated;
grant select on public.water_area_risk_summary to authenticated;

notify pgrst, 'reload schema';
