-- Added 2026-11-01: one report for a whole tournament, instead of a report for each of its games. Safe to re-run.
-- Coaches write it from the tournament card (Write tournament report); everyone can read it (it's on the public page,
-- at ?tour=<id>), like matches.report.
alter table public.tournaments add column if not exists report text;
alter table public.tournaments drop constraint if exists tournaments_report_length;
alter table public.tournaments add constraint tournaments_report_length check (report is null or length(report) <= 20000);
notify pgrst, 'reload schema';
