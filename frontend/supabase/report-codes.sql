-- Add readable, city-prefixed report codes while preserving the UUID primary key.
-- Run once from the Supabase SQL Editor. Existing reports are backfilled by creation time.
begin;

lock table public.water_reports in access exclusive mode;
alter table public.water_reports add column if not exists report_code text;

create table if not exists public.water_report_code_counters (
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

-- Initialize counters from any already assigned codes, then backfill older rows.
insert into public.water_report_code_counters(city_code, last_value)
select split_part(wr.report_code, '-', 1), max(split_part(wr.report_code, '-', 2)::bigint)
from public.water_reports as wr
where wr.report_code ~ '^[A-Z]{3}-[0-9]+$'
group by split_part(wr.report_code, '-', 1)
on conflict (city_code) do update
  set last_value = greatest(public.water_report_code_counters.last_value, excluded.last_value);

do $$
declare
  r record;
  v_city_code text;
  v_next bigint;
begin
  for r in
    select id, address
    from public.water_reports
    where report_code is null or btrim(report_code) = ''
    order by created_at asc nulls first, id asc
  loop
    v_city_code := public.aqualedger_report_city_code(r.address);
    insert into public.water_report_code_counters(city_code, last_value)
    values (v_city_code, 1)
    on conflict (city_code) do update
      set last_value = public.water_report_code_counters.last_value + 1
    returning last_value into v_next;
    update public.water_reports
    set report_code = v_city_code || '-' || v_next::text
    where id = r.id;
  end loop;
end;
$$;

create unique index if not exists water_reports_report_code_uidx
  on public.water_reports(report_code);

drop trigger if exists water_reports_assign_report_code on public.water_reports;
create trigger water_reports_assign_report_code
before insert on public.water_reports
for each row execute function public.aqualedger_assign_report_code();

revoke all on function public.aqualedger_report_city_code(text) from public, anon, authenticated;
revoke all on function public.aqualedger_assign_report_code() from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
