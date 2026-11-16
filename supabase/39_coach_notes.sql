-- Added 2026-11-16: coaches' own notes for the Data hub and match pages. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 39_coach_notes.sql).
-- One row per (kind, k), with a small JSON body:
--   kind 'fc'  four corner wheel, k = player|term ("Isobel|Autumn 2026-27"), data = {tech, phys, psych, soc: 1-5, note}
--   kind 'pos' where a player can play, k = player, data = {z: [zone numbers]}
--   kind 'opp' notes on an opposition, k = their name in lower case, data = {t: notes, at: date}
-- COACHES ONLY: visitors (anon) have no rights at all, and parents signed in with a family code are "authenticated" but
-- is_coach() is false for them, so the rules refuse them too.
create table if not exists public.coach_notes(
  kind    text not null check (kind in ('fc','pos','opp')),
  k       text not null check (length(btrim(k)) between 1 and 120),
  data    jsonb not null default '{}'::jsonb check (length(data::text) < 4000),
  updated timestamptz not null default now(),
  primary key (kind, k)
);
alter table public.coach_notes enable row level security;
drop policy if exists "coaches only read notes" on public.coach_notes;
create policy "coaches only read notes" on public.coach_notes for select to authenticated using (public.is_coach());
drop policy if exists "coaches only write notes" on public.coach_notes;
create policy "coaches only write notes" on public.coach_notes for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.coach_notes from anon, public;
grant select, insert, update, delete on public.coach_notes to authenticated;
