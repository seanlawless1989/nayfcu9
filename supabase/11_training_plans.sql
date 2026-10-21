-- Added 2026-10-21: training session plans (coaches only). Safe to re-run.
-- One row per training session: what the coaches plan to do that night. Written and read on the Training page.
-- Only signed-in coaches can read or change these. Parents (including those signed in with a family code, who have
-- no email so are never coaches) and the public get nothing back, because the database refuses them, not just the page.
create table if not exists public.training_plans(
  day     date primary key,
  plan    text not null default '',
  updated timestamptz not null default now()
);
alter table public.training_plans enable row level security;
drop policy if exists "coaches read training plans" on public.training_plans;
create policy "coaches read training plans" on public.training_plans for select to authenticated using (public.is_coach());
drop policy if exists "coaches write training plans" on public.training_plans;
create policy "coaches write training plans" on public.training_plans for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select, insert, update, delete on public.training_plans to authenticated;
revoke all on public.training_plans from anon;
