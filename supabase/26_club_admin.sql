-- Added 2026-11-03: club admin layer (phase 1). Safe to re-run. [project only]: run ONCE per Supabase project, not per team schema.
-- A club (e.g. Newton Aycliffe) has several teams, each in its own schema of this project (public, na_u11_wildcats, ...).
-- This adds a shared "club" schema above them:
--   club.clubs / club.teams   which teams belong to which club (everyone can read)
--   club.admins               club lead(s) and club admins, by email; they sign in on the club admin page
--   club.report_status        the club admin's inbox state for each team's match or tournament report (admins only)
--   club.drills               a drills library shared by every coach of every team in the club (coaches and admins only)
-- Reports themselves are not copied: they stay in each team's matches.report / tournaments.report and are public already.
--
-- After running it:
--   1. Project Settings > Data API > Exposed schemas: add  club  then Save.
--   2. Authentication > URL Configuration > Redirect URLs: add the club admin page, e.g. https://touchlinetales.club/newton-aycliffe/admin/

create schema if not exists club;
grant usage on schema club to anon, authenticated, service_role;

create table if not exists club.clubs(
  id   text primary key,              -- the club's slug, e.g. newton-aycliffe (same as TEAM.club.id on its team sites)
  name text not null
);
create table if not exists club.teams(
  club        text not null references club.clubs(id) on delete cascade,
  team_schema text not null,          -- the schema holding the team's tables: public, na_u11_wildcats, ...
  name        text not null,
  url         text not null default '',
  show_scores boolean not null default false,   -- false: scores hidden in the club inbox (FA: U7 to U11)
  sort        int not null default 0,
  primary key (club, team_schema)
);
create table if not exists club.admins(
  club  text not null references club.clubs(id) on delete cascade,
  email text not null check (email = lower(email)),
  role  text not null default 'admin' check (role in ('lead','admin')),
  name  text not null default '',
  primary key (club, email)
);
create table if not exists club.report_status(
  club        text not null references club.clubs(id) on delete cascade,
  team_schema text not null,
  kind        text not null check (kind in ('match','tour')),
  item_id     text not null,
  status      text not null default 'new' check (status in ('new','picked','posted','skipped')),
  by_email    text not null default lower(coalesce(auth.jwt() ->> 'email','')),
  updated     timestamptz not null default now(),
  primary key (club, team_schema, kind, item_id)
);
create table if not exists club.drills(
  id           uuid primary key default gen_random_uuid(),
  club         text not null references club.clubs(id) on delete cascade,
  title        text not null check (length(title) between 1 and 80),
  age_from     int check (age_from between 4 and 21),
  age_to       int check (age_to between 4 and 21),
  players      text not null default '' check (length(players) <= 40),
  minutes      int check (minutes between 1 and 120),
  equipment    text not null default '' check (length(equipment) <= 200),
  focus        text[] not null default '{}',
  setup        text not null default '' check (length(setup) <= 4000),
  points       text not null default '' check (length(points) <= 4000),
  diagram      jsonb check (diagram is null or length(diagram::text) <= 60000),   -- a tactics board, names taken out
  video        text not null default '' check (video = '' or video ~ '^https://'),
  author_email text not null default lower(coalesce(auth.jwt() ->> 'email','')),
  author_name  text not null default '' check (length(author_name) <= 40),
  author_team  text not null default '' check (length(author_team) <= 60),
  created      timestamptz not null default now(),
  updated      timestamptz not null default now()
);
create index if not exists drills_club on club.drills(club, updated desc);

-- ---------- who is who ----------
create or replace function club.is_admin(c text, lead_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from club.admins a where a.club = c and a.email = lower(coalesce(auth.jwt() ->> 'email',''))
                 and (not lead_only or a.role = 'lead'));
$$;
-- a coach of any of the club's teams (each team keeps its own coaches list in its own schema)
create or replace function club.is_coach(c text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare s text; ok boolean; e text := lower(coalesce(auth.jwt() ->> 'email',''));
begin
  if e = '' then return false; end if;
  for s in select t.team_schema from club.teams t where t.club = c loop
    if to_regclass(format('%I.coaches', s)) is null then continue; end if;
    execute format('select exists (select 1 from %I.coaches where email = $1)', s) into ok using e;
    if ok then return true; end if;
  end loop;
  return false;
end $$;
-- the signed-in person's place in a club, for the club admin page and the team sites: 'lead', 'admin', 'coach' or null
create or replace function club.my_role(c text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.role from club.admins a where a.club = c and a.email = lower(coalesce(auth.jwt() ->> 'email',''))),
                  case when club.is_coach(c) then 'coach' end);
$$;
revoke execute on function club.is_admin(text, boolean), club.is_coach(text), club.my_role(text) from public, anon;
grant execute on function club.is_admin(text, boolean), club.is_coach(text), club.my_role(text) to authenticated;

-- ---------- rules ----------
alter table club.clubs enable row level security;
alter table club.teams enable row level security;
alter table club.admins enable row level security;
alter table club.report_status enable row level security;
alter table club.drills enable row level security;

drop policy if exists "everyone reads clubs" on club.clubs;
create policy "everyone reads clubs" on club.clubs for select to anon, authenticated using (true);
drop policy if exists "everyone reads club teams" on club.teams;
create policy "everyone reads club teams" on club.teams for select to anon, authenticated using (true);
drop policy if exists "club lead changes teams" on club.teams;
create policy "club lead changes teams" on club.teams for update to authenticated using (club.is_admin(club, true)) with check (club.is_admin(club, true));

drop policy if exists "admins see the admin list" on club.admins;
create policy "admins see the admin list" on club.admins for select to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email','')) or club.is_admin(club));
drop policy if exists "club lead adds admins" on club.admins;
create policy "club lead adds admins" on club.admins for insert to authenticated with check (club.is_admin(club, true));
drop policy if exists "club lead changes admins" on club.admins;
create policy "club lead changes admins" on club.admins for update to authenticated using (club.is_admin(club, true)) with check (club.is_admin(club, true));
-- a lead can't remove themselves, so a club is never left without one
drop policy if exists "club lead removes admins" on club.admins;
create policy "club lead removes admins" on club.admins for delete to authenticated
  using (club.is_admin(club, true) and email <> lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists "admins use the report inbox" on club.report_status;
create policy "admins use the report inbox" on club.report_status for all to authenticated
  using (club.is_admin(club)) with check (club.is_admin(club));

drop policy if exists "club coaches read drills" on club.drills;
create policy "club coaches read drills" on club.drills for select to authenticated using (club.is_coach(club) or club.is_admin(club));
drop policy if exists "club coaches add drills" on club.drills;
create policy "club coaches add drills" on club.drills for insert to authenticated
  with check ((club.is_coach(club) or club.is_admin(club)) and author_email = lower(coalesce(auth.jwt() ->> 'email','')));
drop policy if exists "authors and admins change drills" on club.drills;
create policy "authors and admins change drills" on club.drills for update to authenticated
  using (author_email = lower(coalesce(auth.jwt() ->> 'email','')) or club.is_admin(club))
  with check (club.is_coach(club) or club.is_admin(club));
drop policy if exists "authors and admins remove drills" on club.drills;
create policy "authors and admins remove drills" on club.drills for delete to authenticated
  using (author_email = lower(coalesce(auth.jwt() ->> 'email','')) or club.is_admin(club));

revoke all on all tables in schema club from anon, authenticated;
grant select on club.clubs, club.teams to anon, authenticated;
grant update (show_scores, sort, name, url) on club.teams to authenticated;
grant select, insert, update, delete on club.admins, club.report_status, club.drills to authenticated;

create or replace function club.touch() returns trigger language plpgsql set search_path = '' as $$
begin new.updated := now(); return new; end $$;
drop trigger if exists drills_touch on club.drills;
create trigger drills_touch before update on club.drills for each row execute function club.touch();
drop trigger if exists report_status_touch on club.report_status;
create trigger report_status_touch before update on club.report_status for each row execute function club.touch();

-- ---------- sign-in: club admins who aren't coaches may sign in too ----------
create or replace function public.only_coaches_can_sign_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare s text; ok boolean;
begin
  if coalesce(new.is_anonymous, false) then return new; end if;   -- a parent's phone, no email
  if exists (select 1 from public.coaches where email = lower(new.email)) then return new; end if;
  -- other teams sharing this project each have their own schema with a coaches list (tools/team_schema_sql.py)
  for s in select schemaname from pg_tables where tablename = 'coaches' and schemaname <> 'public' loop
    execute format('select exists (select 1 from %I.coaches where email = $1)', s) into ok using lower(new.email);
    if ok then return new; end if;
  end loop;
  if to_regclass('club.admins') is not null then
    execute 'select exists (select 1 from club.admins where email = $1)' into ok using lower(new.email);
    if ok then return new; end if;
  end if;
  raise exception 'Only club coaches can sign in';
end $$;
revoke execute on function public.only_coaches_can_sign_up() from public, anon, authenticated;
