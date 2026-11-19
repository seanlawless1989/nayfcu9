-- Added 2026-11-19: coaches' own formations (Live match line-ups and the tactics board). Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 42_formations.sql).
-- One row per formation: name (what the button says) and data = {label: ["GK","LB",...], xy: [[x,y],...]}, keeper first.
-- Everyone can READ them, because parents' match pages draw the line-up in the formation the coach picked.
-- Only coaches can add, change or delete them. Nothing about any child is stored here.
create table if not exists public.formations(
  name    text primary key check (length(btrim(name)) between 1 and 18),
  data    jsonb not null default '{}'::jsonb check (length(data::text) < 2000),
  updated timestamptz not null default now()
);
alter table public.formations enable row level security;
drop policy if exists "everyone reads formations" on public.formations;
create policy "everyone reads formations" on public.formations for select using (true);
drop policy if exists "coaches write formations" on public.formations;
create policy "coaches write formations" on public.formations for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke insert, update, delete, truncate on public.formations from anon;
grant select on public.formations to anon, authenticated;
grant insert, update, delete on public.formations to authenticated;
