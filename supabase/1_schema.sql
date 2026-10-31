-- Newton Aycliffe U9s: database setup. Paste into Supabase > SQL Editor and click Run.

create table if not exists public.players (
  id      text primary key,
  name    text not null,
  num     integer,
  current boolean not null default true
);

create table if not exists public.matches (
  id         text primary key,
  date       date not null,
  opp        text default '',
  ha         text default '',          -- H, A or N
  venue      text default '',
  comp       text default '',          -- League, Cup, Friendly, Tournament
  ko         text default '',          -- kick-off, e.g. 10:15
  us         integer,                  -- our goals
  them       integer,                  -- their goals
  potm       text,                     -- player of the match
  played     jsonb not null default '{}'::jsonb,  -- {"Daisy": 3, "Chloe": 0} = played, with goals
  apps       boolean not null default true,       -- false = appearances weren't recorded
  notes      text default '',
  check_note text default '',
  assists jsonb not null default '{}'::jsonb,
  updated    timestamptz not null default now()
);

-- Coaches who may add and edit matches. Add each coach's email (lower case).
create table if not exists public.coaches (
  email text primary key
);

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.coaches enable row level security;

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coaches where email = lower(auth.jwt() ->> 'email'));
$$;

-- Everyone (including parents who aren't signed in) can read results and the squad.
-- To make the site coaches-only, change "to anon, authenticated using (true)" to "to authenticated using (public.is_coach())".
drop policy if exists "read players" on public.players;
create policy "read players" on public.players for select to anon, authenticated using (true);
drop policy if exists "read matches" on public.matches;
create policy "read matches" on public.matches for select to anon, authenticated using (true);

-- Only coaches can change anything.
drop policy if exists "coaches write players" on public.players;
create policy "coaches write players" on public.players for all to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists "coaches write matches" on public.matches;
create policy "coaches write matches" on public.matches for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- A signed-in coach can see their own row (the site uses this to show the coach tools).
drop policy if exists "see own coach row" on public.coaches;
create policy "see own coach row" on public.coaches for select to authenticated using (email = lower(auth.jwt() ->> 'email'));

-- >>> Change this to your email, then run. Add a line per coach.
insert into public.coaches (email) values ('coach@example.com') on conflict do nothing;

-- Only emails on the coaches list can create a sign-in account.
create or replace function public.only_coaches_can_sign_up()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.coaches where email = lower(new.email)) then
    raise exception 'Only club coaches can sign in';
  end if;
  return new;
end $$;
revoke execute on function public.only_coaches_can_sign_up() from public, anon, authenticated;
drop trigger if exists only_coaches_can_sign_up on auth.users;
create trigger only_coaches_can_sign_up before insert on auth.users
  for each row execute function public.only_coaches_can_sign_up();

-- Added 2026-10: assists per player, e.g. {"Lydia": 1}. Safe to re-run on an existing database.
alter table public.matches add column if not exists assists jsonb not null default '{}'::jsonb;
alter table public.matches add column if not exists postponed boolean not null default false;

-- Added 2026-10: tournaments (games link to one via matches.tournament_id) and an honours board.
alter table public.matches add column if not exists tournament_id text;
alter table public.matches add column if not exists stage text default '';   -- Group stage, Semi final, Final...
create table if not exists public.tournaments(
  id text primary key, name text not null default '', date date, venue text default '',
  potm text,                    -- player of the tournament
  trophy text default '',       -- Winners, Runners-up, ... blank = none
  notes text default '', updated timestamptz not null default now());
create table if not exists public.honours(
  id text primary key, date date, title text not null default '', achievement text default '', notes text default '', updated timestamptz not null default now());
-- Added 2026-10-19: tournaments can run over 2 or 3 days (end_date is blank for a one-day tournament).
alter table public.tournaments add column if not exists end_date date;
alter table public.tournaments drop constraint if exists tournaments_end_after_start;
alter table public.tournaments add constraint tournaments_end_after_start check (end_date is null or end_date >= date);
-- Added 2026-10-26: the teams entered and their groups ("" = groups not drawn yet), see 14_tournament_teams.sql.
alter table public.tournaments add column if not exists teams jsonb not null default '[]'::jsonb;
-- Added 2026-10-31: the squad picked for the whole tournament, see 15_tournament_squad.sql.
alter table public.tournaments add column if not exists squad jsonb;
alter table public.tournaments enable row level security;
alter table public.honours enable row level security;
drop policy if exists "read tournaments" on public.tournaments;
create policy "read tournaments" on public.tournaments for select to anon, authenticated using (true);
drop policy if exists "coaches write tournaments" on public.tournaments;
create policy "coaches write tournaments" on public.tournaments for all to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists "read honours" on public.honours;
create policy "read honours" on public.honours for select to anon, authenticated using (true);
drop policy if exists "coaches write honours" on public.honours;
create policy "coaches write honours" on public.honours for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.tournaments, public.honours to anon, authenticated;
grant insert, update, delete on public.tournaments, public.honours to authenticated;

-- ---------- Oct 2026: playing time, keepers, availability ----------
alter table public.matches add column if not exists quarters jsonb default '{}'::jsonb;
alter table public.matches add column if not exists gk text;
alter table public.matches add column if not exists saves integer;

create table if not exists public.availability(
  match_id text not null,
  player text not null,
  status text not null check (status in ('yes','no','maybe')),
  updated timestamptz default now(),
  primary key(match_id, player)
);
alter table public.availability enable row level security;
-- Only coaches can see answers; parents answer through set_availability below.
create policy "coaches read availability" on public.availability for select using (public.is_coach());
create policy "coaches write availability" on public.availability for all using (public.is_coach()) with check (public.is_coach());

create or replace function public.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated) values (p_match, p_player, p_status, now())
  on conflict (match_id, player) do update set status = excluded.status, updated = now();
end $$;
grant execute on function public.set_availability(text,text,text) to anon, authenticated;

-- Keepers per game (more than one allowed): {"Name": 1 = clean sheet, 0 = conceded}
alter table public.matches add column if not exists keepers jsonb default '{}'::jsonb;

-- Halves played per player {"Name": 0-2} (replaces the unused quarters column), and the squad picked before a fixture
alter table public.matches add column if not exists halves jsonb default '{}'::jsonb;
alter table public.matches add column if not exists squad jsonb;

-- Live match state, public so parents can follow: {status, half, halfStart, halfLen, form, slots, squad, events, mins}
alter table public.matches add column if not exists live jsonb;

-- Opposition badges, shared across the site (small PNG data URLs), public read, coach write
create table if not exists public.badges(key text primary key, name text, img text not null, updated timestamptz default now());
alter table public.badges enable row level security;
create policy "public read badges" on public.badges for select using (true);
create policy "coaches write badges" on public.badges for all using (public.is_coach()) with check (public.is_coach());

-- Player photos: coaches only (never public)
create table if not exists public.player_photos(player text primary key, img text not null, updated timestamptz default now());
alter table public.player_photos enable row level security;
-- 2026-10-17: Sean asked for photos to be visible to everyone (they were coach-only); only coaches can add or change them.
create policy "everyone reads photos" on public.player_photos for select using (true);
grant select on public.player_photos to anon;
create policy "coaches write photos" on public.player_photos for all using (public.is_coach()) with check (public.is_coach());
grant select, insert, update, delete on public.player_photos to authenticated;

-- Website visits: one row per day (UK time), counts only, nothing about who visited.
-- views = times the site was opened; visitors = phones/computers that opened it that day (the site remembers "seen today" in the browser).
create table if not exists public.page_views(day date primary key, views int not null default 0, visitors int not null default 0);
alter table public.page_views enable row level security;
create policy "coaches read page views" on public.page_views for select to authenticated using (public.is_coach());
grant select on public.page_views to authenticated;

create or replace function public.log_view(p_new boolean)
returns void language sql security definer set search_path = public as $$
  insert into page_views(day, views, visitors) values ((now() at time zone 'Europe/London')::date, 1, case when p_new then 1 else 0 end)
  on conflict (day) do update set views = page_views.views + 1, visitors = page_views.visitors + case when p_new then 1 else 0 end;
$$;
revoke execute on function public.log_view(boolean) from public;
grant execute on function public.log_view(boolean) to anon, authenticated;

-- Added 2026-10-17: match report written by a coach on the match page (public, unlike notes).
alter table public.matches add column if not exists report text;

-- Added 2026-10-19: match preview written by a coach before the game (public).
alter table public.matches add column if not exists preview text;
