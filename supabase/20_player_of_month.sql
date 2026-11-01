-- Added 2026-11-01: player of the month. Safe to re-run. Run it once on every team's database (SQL editor).
-- Coaches pick one player each month on the Player of the month page, with an optional line on why. Everyone sees it
-- on the home page, the honours board and the player's own page, and coaches make a poster for Facebook or WhatsApp.
-- First names only, like everything else on the site.
create table if not exists public.player_of_month(
  month   text primary key check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- e.g. '2026-10' for October 2026
  player  text not null check (length(btrim(player)) between 1 and 60),
  note    text check (note is null or length(note) <= 160),               -- e.g. "Brilliant in goal all month"
  updated timestamptz not null default now()
);
alter table public.player_of_month enable row level security;
drop policy if exists "everyone reads player of the month" on public.player_of_month;
create policy "everyone reads player of the month" on public.player_of_month for select using (true);
drop policy if exists "coaches write player of the month" on public.player_of_month;
create policy "coaches write player of the month" on public.player_of_month for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.player_of_month to anon, authenticated;
grant insert, update, delete on public.player_of_month to authenticated;
