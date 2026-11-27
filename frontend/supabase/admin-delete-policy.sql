-- Allow the authorized AquaLedger administrator to delete extreme outlier / invalid water reports.
-- Run this once in Supabase SQL Editor.

drop policy if exists water_reports_delete_admin on public.water_reports;
create policy water_reports_delete_admin
on public.water_reports
for delete
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
