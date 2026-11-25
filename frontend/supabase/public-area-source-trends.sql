-- Public, privacy-preserving area/source summaries.
-- No reporter names, exact report IDs, street addresses, or individual lab values are exposed.
create or replace view public.water_public_area_source_trends as
with raw_reports as (
  select to_jsonb(wr) as row_data
  from public.water_reports as wr
), normalized as (
  select
    coalesce(row_data->>'address', row_data->>'location', '') as address,
    nullif(trim(row_data->>'area_name'), '') as area_name,
    coalesce(row_data->>'source_type', row_data->>'water_source', 'Unspecified source') as source_type,
    coalesce(row_data->>'review_status', row_data->>'status', '') as review_status,
    coalesce(row_data->>'reporter_name', row_data->>'reporter') as reporter_name,
    nullif(coalesce(row_data->>'sample_date', row_data->>'test_date'), '')::date as sample_date,
    nullif(coalesce(row_data->>'source_depth_m', row_data->>'depth_m'), '')::numeric as source_depth_m,
    nullif(coalesce(row_data->>'ph', row_data->>'pH'), '')::numeric as ph,
    nullif(coalesce(row_data->>'tds_mg_l', row_data->>'tds'), '')::numeric as tds_mg_l,
    nullif(coalesce(row_data->>'turbidity_ntu', row_data->>'turbidity'), '')::numeric as turbidity_ntu,
    nullif(coalesce(row_data->>'conductivity_us_cm', row_data->>'conductivity'), '')::numeric as conductivity_us_cm,
    nullif(coalesce(row_data->>'hardness_mg_l', row_data->>'hardness'), '')::numeric as hardness_mg_l,
    nullif(coalesce(row_data->>'chloride_mg_l', row_data->>'chloride'), '')::numeric as chloride_mg_l,
    nullif(coalesce(row_data->>'nitrate_mg_l', row_data->>'nitrate'), '')::numeric as nitrate_mg_l,
    nullif(coalesce(row_data->>'fluoride_mg_l', row_data->>'fluoride'), '')::numeric as fluoride_mg_l,
    nullif(coalesce(row_data->>'arsenic_ug_l', row_data->>'arsenic'), '')::numeric as arsenic_ug_l,
    nullif(coalesce(row_data->>'ecoli_result', row_data->>'e_coli_result', row_data->>'e_coli', row_data->>'ecoli'), '') as ecoli_result,
    ((coalesce(row_data->>'ph', row_data->>'pH')) is not null)::integer +
    ((coalesce(row_data->>'tds_mg_l', row_data->>'tds')) is not null)::integer +
    ((coalesce(row_data->>'turbidity_ntu', row_data->>'turbidity')) is not null)::integer +
    ((coalesce(row_data->>'conductivity_us_cm', row_data->>'conductivity')) is not null)::integer +
    ((coalesce(row_data->>'hardness_mg_l', row_data->>'hardness')) is not null)::integer +
    ((coalesce(row_data->>'chloride_mg_l', row_data->>'chloride')) is not null)::integer +
    ((coalesce(row_data->>'nitrate_mg_l', row_data->>'nitrate')) is not null)::integer +
    ((coalesce(row_data->>'fluoride_mg_l', row_data->>'fluoride')) is not null)::integer +
    ((coalesce(row_data->>'arsenic_ug_l', row_data->>'arsenic')) is not null)::integer +
    ((coalesce(row_data->>'ecoli_result', row_data->>'e_coli_result', row_data->>'e_coli', row_data->>'ecoli')) is not null)::integer as lab_measurement_count
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

grant select on public.water_public_area_source_trends to anon, authenticated;
notify pgrst, 'reload schema';
