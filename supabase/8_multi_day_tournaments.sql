-- Tournaments that run over 2 or 3 days. A tournament runs from "date" (the first day) to "end_date" (the last
-- day); end_date stays blank for a one-day tournament. Each game keeps its own date, which falls on one of the days.
-- The calendar feed (supabase/functions/calendar) reads end_date, so run this before deploying that function.
alter table public.tournaments add column if not exists end_date date;
alter table public.tournaments drop constraint if exists tournaments_end_after_start;
alter table public.tournaments add constraint tournaments_end_after_start check (end_date is null or end_date >= date);
