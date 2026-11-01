-- Added 2026-11-01: player birthdays. Safe to re-run. Run it once on every team's database (SQL editor).
-- Coaches can note each player's birthday so the site reminds them when one is coming up.
-- DAY AND MONTH ONLY, never the year: no date of birth and no age is stored anywhere.
-- COACHES ONLY: nobody else can read a single row. Visitors (anon) have no rights on the table at all, and parents
-- signed in with a family code are "authenticated" but is_coach() is false for them, so the rules refuse them too.
create table if not exists public.player_birthdays(
  player  text primary key check (length(btrim(player)) between 1 and 60),   -- first name, as in players.name
  bday    text not null check (bday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),   -- "MM-DD", e.g. "03-14"
  updated timestamptz not null default now()
);
alter table public.player_birthdays enable row level security;
drop policy if exists "coaches only read birthdays" on public.player_birthdays;
create policy "coaches only read birthdays" on public.player_birthdays for select to authenticated using (public.is_coach());
drop policy if exists "coaches only write birthdays" on public.player_birthdays;
create policy "coaches only write birthdays" on public.player_birthdays for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.player_birthdays from anon, public;
grant select, insert, update, delete on public.player_birthdays to authenticated;
