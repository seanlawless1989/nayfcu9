-- Added 2026-11-01: coach ratings. Safe to re-run. Run it once on every team's database (SQL editor).
-- After each game the coaches give every player who played a score out of 10. The Player ratings page adds them up
-- over the season (totals and averages) to help pick the coaches' player of the year.
-- COACHES ONLY: nobody else can read a single row. Visitors (anon) have no rights on the table at all, and parents
-- signed in with a family code are "authenticated" but is_coach() is false for them, so the rules refuse them too.
create table if not exists public.player_ratings(
  match_id text not null references public.matches(id) on delete cascade,
  player   text not null check (length(btrim(player)) between 1 and 60),   -- first name, as in matches.played
  score    smallint not null check (score between 1 and 10),
  updated  timestamptz not null default now(),
  primary key (match_id, player)
);
alter table public.player_ratings enable row level security;
drop policy if exists "coaches only read ratings" on public.player_ratings;
create policy "coaches only read ratings" on public.player_ratings for select to authenticated using (public.is_coach());
drop policy if exists "coaches only write ratings" on public.player_ratings;
create policy "coaches only write ratings" on public.player_ratings for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.player_ratings from anon, public;
grant select, insert, update, delete on public.player_ratings to authenticated;
