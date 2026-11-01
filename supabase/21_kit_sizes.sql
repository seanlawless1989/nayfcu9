-- Added 2026-11-01: kit sizes. Safe to re-run. Run it once on every team's database (SQL editor).
-- Coaches, or each family for their own child, note the player's shirt, shorts and socks size (and anything else, e.g. gloves) so ordering kit is easy.
-- The Kit sizes page adds them up into an order list they can copy for the kit supplier.
-- WHO CAN SEE IT: the team's signed-in coaches see and change everyone's sizes. A parent signed in with a family code
-- sees and changes only their own child's sizes (is_parent_of). Visitors (anon) have no rights on the table at all.
create table if not exists public.player_kit(
  player  text primary key check (length(btrim(player)) between 1 and 60),   -- first name, as in players.name
  shirt   text check (length(shirt) <= 20),
  shorts  text check (length(shorts) <= 20),
  socks   text check (length(socks) <= 20),
  notes   text check (length(notes) <= 120),
  updated timestamptz not null default now()
);
alter table public.player_kit enable row level security;
drop policy if exists "coaches only read kit sizes" on public.player_kit;
drop policy if exists "coaches only write kit sizes" on public.player_kit;
drop policy if exists "coaches and own family read kit sizes" on public.player_kit;
create policy "coaches and own family read kit sizes" on public.player_kit for select to authenticated
  using (public.is_coach() or public.is_parent_of(player));
drop policy if exists "coaches and own family write kit sizes" on public.player_kit;
create policy "coaches and own family write kit sizes" on public.player_kit for all to authenticated
  using (public.is_coach() or public.is_parent_of(player)) with check (public.is_coach() or public.is_parent_of(player));
revoke all on public.player_kit from anon, public;
grant select, insert, update, delete on public.player_kit to authenticated;
