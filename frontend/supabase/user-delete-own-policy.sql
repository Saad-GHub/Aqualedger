-- Allow authenticated users to update and delete their own rows in public.water_reports.
-- Run this once in the Supabase SQL Editor.

drop policy if exists water_reports_delete_own on public.water_reports;
create policy water_reports_delete_own
on public.water_reports
for delete
to authenticated
using (created_by = auth.uid());

drop policy if exists water_reports_update_own on public.water_reports;
create policy water_reports_update_own
on public.water_reports
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
