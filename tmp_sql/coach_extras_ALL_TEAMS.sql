-- Touchline Tales 25 Nov 2026: noticeboard, certificate levels, session plans, matchday checklist, coach roles.
-- Run once in the NAYFC Supabase project's SQL editor. Safe to re-run. Covers public + every team schema.
-- Added 2026-11-25: team announcements, certificate levels, session plans, matchday checklists and coach permissions.
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 44_coach_extras.sql).
-- The site works before this is run: each new card says it isn't switched on yet.

-- 1. Announcements (the noticeboard). A coach writes a note for every family (player = null) or for one family
--    (player = that child's first name). Team-wide notes are for everyone who opens the site, like the training details.
--    A note for one family is only for the coaches and the phones signed in with that child's family code.
create table if not exists public.team_notices(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'news' check (kind in ('news','cancel','kit','event','reminder')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  body    text not null default '' check (length(body) <= 1500),
  player  text check (player is null or length(player) <= 60),
  pinned  boolean not null default false,
  expires date,
  author  text not null default '',
  created timestamptz not null default now()
);
alter table public.team_notices enable row level security;
create or replace function public.my_child_names() returns setof text
language sql stable security definer set search_path = public as $$
  select p.name from public.parent_links l join public.players p on p.id = l.player_id where auth.uid() is not null and l.uid = auth.uid();
$$;
revoke execute on function public.my_child_names() from public;
grant execute on function public.my_child_names() to anon, authenticated;
drop policy if exists "notices read" on public.team_notices;
create policy "notices read" on public.team_notices for select to anon, authenticated
  using (player is null or public.is_coach() or player in (select public.my_child_names()));
drop policy if exists "notices coaches write" on public.team_notices;
create policy "notices coaches write" on public.team_notices for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.team_notices from anon, public;
grant select on public.team_notices to anon;
grant select, insert, update, delete on public.team_notices to authenticated;

-- the phones to tell about a note for one family: phones signed in with that child's family code (never coaches' phones)
create or replace function public.notice_targets(p_player text)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select distinct s.endpoint, s.p256dh, s.auth from public.push_subs s
  join public.parent_links l on l.uid = s.uid join public.players p on p.id = l.player_id
  where s.uid is not null and not s.coach and p.name = p_player;
$$;
revoke all on function public.notice_targets(text) from public, anon, authenticated;

-- 2. Small team settings anyone may read (nothing private goes here): certificate levels ("certs").
create table if not exists public.team_prefs(
  k       text primary key check (k in ('certs')),
  v       jsonb not null default '{}'::jsonb check (length(v::text) < 6000),
  updated timestamptz not null default now()
);
alter table public.team_prefs enable row level security;
drop policy if exists "prefs read" on public.team_prefs;
create policy "prefs read" on public.team_prefs for select to anon, authenticated using (true);
drop policy if exists "prefs coaches write" on public.team_prefs;
create policy "prefs coaches write" on public.team_prefs for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.team_prefs from anon, public;
grant select on public.team_prefs to anon;
grant select, insert, update, delete on public.team_prefs to authenticated;

-- 3. Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--    'plan' a training session plan, k = the date (yyyy-mm-dd), data = {focus, mins, blocks:[{id, title, mins, note}], note}
--    'chk'  a matchday checklist, k = "_list" (the team's list) or a match id (what's been ticked for that game)
do $$ begin
  if to_regclass('public.coach_notes') is not null then
    alter table public.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table public.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk'));
  end if;
end $$;

-- 4. Coach permissions. Each login on the coaches list is a manager, coach, assistant coach or admin.
--    While nobody is a manager, everyone keeps doing everything (how it worked before). Once there's a manager, only
--    managers can add or remove coaches, make invite links or change anyone's role; the site also keeps team setup,
--    sponsors, the fundraiser and deleting games or players to managers, and assistants to the matchday jobs.
alter table public.coaches add column if not exists coach_role text;
alter table public.coaches drop constraint if exists coaches_coach_role_check;
alter table public.coaches add constraint coaches_coach_role_check check (coach_role in ('manager','coach','assistant','admin'));

create or replace function public.has_manager() returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from public.coaches where coach_role = 'manager'); $$;
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coaches where email = lower(auth.jwt() ->> 'email') and coach_role = 'manager');
$$;
revoke execute on function public.has_manager(), public.is_manager() from public;
grant execute on function public.has_manager(), public.is_manager() to anon, authenticated;

-- the database itself refuses a non-manager changing the list once there's a manager. Run from the SQL editor (no sign-in),
-- by an invite link (the new coach adds their own email) or on yourself, it's allowed.
create or replace function public.coaches_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); target text := lower(coalesce(case when tg_op = 'DELETE' then old.email else new.email end, ''));
begin
  if em = '' or em = target or not exists (select 1 from public.coaches where coach_role = 'manager') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.coach_role is not distinct from old.coach_role then return new; end if;
  if not exists (select 1 from public.coaches where email = em and coach_role = 'manager') then
    raise exception 'Only the team''s managers can change the coaches list';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists coaches_guard on public.coaches;
create trigger coaches_guard before insert or update or delete on public.coaches for each row execute function public.coaches_guard();

-- a manager (or anyone, while there isn't one) sets a login's role. You can't make yourself a manager once there is one,
-- and the last manager can't step down (so the team is never left with nobody in charge).
create or replace function public.set_coach_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); who text := lower(trim(coalesce(p_email, ''))); s text;
begin
  if not public.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('manager','coach','assistant','admin') then raise exception 'bad role'; end if;
  if public.has_manager() and not public.is_manager() then raise exception 'Only the team''s managers can change roles'; end if;
  if p_role <> 'manager' and exists (select 1 from public.coaches where email = who and coach_role = 'manager')
     and (select count(*) from public.coaches where coach_role = 'manager') = 1 then
    raise exception 'The team needs at least one manager';
  end if;
  update public.coaches set coach_role = p_role where email = who;
  if not found then raise exception 'Not on the coaches list'; end if;
  if p_role = 'admin' and to_regclass('public.coach_availability') is not null then delete from public.coach_availability where email = who; end if;
  if to_regclass('public.coach_share') is not null then
    for s in execute 'select schema_name from public.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, who;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function public.set_coach_role(text, text) from public, anon;
grant execute on function public.set_coach_role(text, text) to authenticated;

-- your own role: coach or admin as before, or assistant, only while the team has no manager. After that a manager sets it.
create or replace function public.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not public.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin','assistant') then raise exception 'bad role'; end if;
  if public.has_manager() then raise exception 'Ask a manager to change your role'; end if;
  update public.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' and to_regclass('public.coach_availability') is not null then delete from public.coach_availability where email = em; end if;
  if to_regclass('public.coach_share') is not null then
    for s in execute 'select schema_name from public.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function public.set_my_coach_role(text) from public, anon;
grant execute on function public.set_my_coach_role(text) to authenticated;

-- invite links: managers only once there's a manager
create or replace function public.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not public.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  if public.has_manager() and not public.is_manager() then raise exception 'Only the team''s managers can invite coaches'; end if;
  insert into public.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function public.make_coach_invite(text) from public, anon;
grant execute on function public.make_coach_invite(text) to authenticated;
-- Team schema darlington_u14s: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists darlington_u14s;
grant usage on schema darlington_u14s to anon, authenticated, service_role;
alter default privileges for role postgres in schema darlington_u14s grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema darlington_u14s grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema darlington_u14s grant all on functions to anon, authenticated, service_role;

-- ===================== 44_coach_extras.sql =====================
-- Added 2026-11-25: team announcements, certificate levels, session plans, matchday checklists and coach permissions.
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 44_coach_extras.sql).
-- The site works before this is run: each new card says it isn't switched on yet.

-- 1. Announcements (the noticeboard). A coach writes a note for every family (player = null) or for one family
--    (player = that child's first name). Team-wide notes are for everyone who opens the site, like the training details.
--    A note for one family is only for the coaches and the phones signed in with that child's family code.
create table if not exists darlington_u14s.team_notices(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'news' check (kind in ('news','cancel','kit','event','reminder')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  body    text not null default '' check (length(body) <= 1500),
  player  text check (player is null or length(player) <= 60),
  pinned  boolean not null default false,
  expires date,
  author  text not null default '',
  created timestamptz not null default now()
);
alter table darlington_u14s.team_notices enable row level security;
create or replace function darlington_u14s.my_child_names() returns setof text
language sql stable security definer set search_path = darlington_u14s as $$
  select p.name from darlington_u14s.parent_links l join darlington_u14s.players p on p.id = l.player_id where auth.uid() is not null and l.uid = auth.uid();
$$;
revoke execute on function darlington_u14s.my_child_names() from public;
grant execute on function darlington_u14s.my_child_names() to anon, authenticated;
drop policy if exists "notices read" on darlington_u14s.team_notices;
create policy "notices read" on darlington_u14s.team_notices for select to anon, authenticated
  using (player is null or darlington_u14s.is_coach() or player in (select darlington_u14s.my_child_names()));
drop policy if exists "notices coaches write" on darlington_u14s.team_notices;
create policy "notices coaches write" on darlington_u14s.team_notices for all to authenticated using (darlington_u14s.is_coach()) with check (darlington_u14s.is_coach());
revoke all on darlington_u14s.team_notices from anon, public;
grant select on darlington_u14s.team_notices to anon;
grant select, insert, update, delete on darlington_u14s.team_notices to authenticated;

-- the phones to tell about a note for one family: phones signed in with that child's family code (never coaches' phones)
create or replace function darlington_u14s.notice_targets(p_player text)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = darlington_u14s as $$
  select distinct s.endpoint, s.p256dh, s.auth from darlington_u14s.push_subs s
  join darlington_u14s.parent_links l on l.uid = s.uid join darlington_u14s.players p on p.id = l.player_id
  where s.uid is not null and not s.coach and p.name = p_player;
$$;
revoke all on function darlington_u14s.notice_targets(text) from public, anon, authenticated;

-- 2. Small team settings anyone may read (nothing private goes here): certificate levels ("certs").
create table if not exists darlington_u14s.team_prefs(
  k       text primary key check (k in ('certs')),
  v       jsonb not null default '{}'::jsonb check (length(v::text) < 6000),
  updated timestamptz not null default now()
);
alter table darlington_u14s.team_prefs enable row level security;
drop policy if exists "prefs read" on darlington_u14s.team_prefs;
create policy "prefs read" on darlington_u14s.team_prefs for select to anon, authenticated using (true);
drop policy if exists "prefs coaches write" on darlington_u14s.team_prefs;
create policy "prefs coaches write" on darlington_u14s.team_prefs for all to authenticated using (darlington_u14s.is_coach()) with check (darlington_u14s.is_coach());
revoke all on darlington_u14s.team_prefs from anon, public;
grant select on darlington_u14s.team_prefs to anon;
grant select, insert, update, delete on darlington_u14s.team_prefs to authenticated;

-- 3. Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--    'plan' a training session plan, k = the date (yyyy-mm-dd), data = {focus, mins, blocks:[{id, title, mins, note}], note}
--    'chk'  a matchday checklist, k = "_list" (the team's list) or a match id (what's been ticked for that game)
do $$ begin
  if to_regclass('darlington_u14s.coach_notes') is not null then
    alter table darlington_u14s.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table darlington_u14s.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk'));
  end if;
end $$;

-- 4. Coach permissions. Each login on the coaches list is a manager, coach, assistant coach or admin.
--    While nobody is a manager, everyone keeps doing everything (how it worked before). Once there's a manager, only
--    managers can add or remove coaches, make invite links or change anyone's role; the site also keeps team setup,
--    sponsors, the fundraiser and deleting games or players to managers, and assistants to the matchday jobs.
alter table darlington_u14s.coaches add column if not exists coach_role text;
alter table darlington_u14s.coaches drop constraint if exists coaches_coach_role_check;
alter table darlington_u14s.coaches add constraint coaches_coach_role_check check (coach_role in ('manager','coach','assistant','admin'));

create or replace function darlington_u14s.has_manager() returns boolean
language sql stable security definer set search_path = darlington_u14s as $$ select exists (select 1 from darlington_u14s.coaches where coach_role = 'manager'); $$;
create or replace function darlington_u14s.is_manager() returns boolean
language sql stable security definer set search_path = darlington_u14s as $$
  select exists (select 1 from darlington_u14s.coaches where email = lower(auth.jwt() ->> 'email') and coach_role = 'manager');
$$;
revoke execute on function darlington_u14s.has_manager(), darlington_u14s.is_manager() from public;
grant execute on function darlington_u14s.has_manager(), darlington_u14s.is_manager() to anon, authenticated;

-- the database itself refuses a non-manager changing the list once there's a manager. Run from the SQL editor (no sign-in),
-- by an invite link (the new coach adds their own email) or on yourself, it's allowed.
create or replace function darlington_u14s.coaches_guard() returns trigger
language plpgsql security definer set search_path = darlington_u14s as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); target text := lower(coalesce(case when tg_op = 'DELETE' then old.email else new.email end, ''));
begin
  if em = '' or em = target or not exists (select 1 from darlington_u14s.coaches where coach_role = 'manager') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.coach_role is not distinct from old.coach_role then return new; end if;
  if not exists (select 1 from darlington_u14s.coaches where email = em and coach_role = 'manager') then
    raise exception 'Only the team''s managers can change the coaches list';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists coaches_guard on darlington_u14s.coaches;
create trigger coaches_guard before insert or update or delete on darlington_u14s.coaches for each row execute function darlington_u14s.coaches_guard();

-- a manager (or anyone, while there isn't one) sets a login's role. You can't make yourself a manager once there is one,
-- and the last manager can't step down (so the team is never left with nobody in charge).
create or replace function darlington_u14s.set_coach_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = darlington_u14s as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); who text := lower(trim(coalesce(p_email, ''))); s text;
begin
  if not darlington_u14s.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('manager','coach','assistant','admin') then raise exception 'bad role'; end if;
  if darlington_u14s.has_manager() and not darlington_u14s.is_manager() then raise exception 'Only the team''s managers can change roles'; end if;
  if p_role <> 'manager' and exists (select 1 from darlington_u14s.coaches where email = who and coach_role = 'manager')
     and (select count(*) from darlington_u14s.coaches where coach_role = 'manager') = 1 then
    raise exception 'The team needs at least one manager';
  end if;
  update darlington_u14s.coaches set coach_role = p_role where email = who;
  if not found then raise exception 'Not on the coaches list'; end if;
  if p_role = 'admin' and to_regclass('darlington_u14s.coach_availability') is not null then delete from darlington_u14s.coach_availability where email = who; end if;
  if to_regclass('darlington_u14s.coach_share') is not null then
    for s in execute 'select schema_name from darlington_u14s.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, who;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function darlington_u14s.set_coach_role(text, text) from public, anon;
grant execute on function darlington_u14s.set_coach_role(text, text) to authenticated;

-- your own role: coach or admin as before, or assistant, only while the team has no manager. After that a manager sets it.
create or replace function darlington_u14s.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = darlington_u14s as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not darlington_u14s.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin','assistant') then raise exception 'bad role'; end if;
  if darlington_u14s.has_manager() then raise exception 'Ask a manager to change your role'; end if;
  update darlington_u14s.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' and to_regclass('darlington_u14s.coach_availability') is not null then delete from darlington_u14s.coach_availability where email = em; end if;
  if to_regclass('darlington_u14s.coach_share') is not null then
    for s in execute 'select schema_name from darlington_u14s.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function darlington_u14s.set_my_coach_role(text) from public, anon;
grant execute on function darlington_u14s.set_my_coach_role(text) to authenticated;

-- invite links: managers only once there's a manager
create or replace function darlington_u14s.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = darlington_u14s as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not darlington_u14s.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  if darlington_u14s.has_manager() and not darlington_u14s.is_manager() then raise exception 'Only the team''s managers can invite coaches'; end if;
  insert into darlington_u14s.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function darlington_u14s.make_coach_invite(text) from public, anon;
grant execute on function darlington_u14s.make_coach_invite(text) to authenticated;
-- Team schema na_u11_wildcats: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists na_u11_wildcats;
grant usage on schema na_u11_wildcats to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on functions to anon, authenticated, service_role;

-- ===================== 44_coach_extras.sql =====================
-- Added 2026-11-25: team announcements, certificate levels, session plans, matchday checklists and coach permissions.
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 44_coach_extras.sql).
-- The site works before this is run: each new card says it isn't switched on yet.

-- 1. Announcements (the noticeboard). A coach writes a note for every family (player = null) or for one family
--    (player = that child's first name). Team-wide notes are for everyone who opens the site, like the training details.
--    A note for one family is only for the coaches and the phones signed in with that child's family code.
create table if not exists na_u11_wildcats.team_notices(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'news' check (kind in ('news','cancel','kit','event','reminder')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  body    text not null default '' check (length(body) <= 1500),
  player  text check (player is null or length(player) <= 60),
  pinned  boolean not null default false,
  expires date,
  author  text not null default '',
  created timestamptz not null default now()
);
alter table na_u11_wildcats.team_notices enable row level security;
create or replace function na_u11_wildcats.my_child_names() returns setof text
language sql stable security definer set search_path = na_u11_wildcats as $$
  select p.name from na_u11_wildcats.parent_links l join na_u11_wildcats.players p on p.id = l.player_id where auth.uid() is not null and l.uid = auth.uid();
$$;
revoke execute on function na_u11_wildcats.my_child_names() from public;
grant execute on function na_u11_wildcats.my_child_names() to anon, authenticated;
drop policy if exists "notices read" on na_u11_wildcats.team_notices;
create policy "notices read" on na_u11_wildcats.team_notices for select to anon, authenticated
  using (player is null or na_u11_wildcats.is_coach() or player in (select na_u11_wildcats.my_child_names()));
drop policy if exists "notices coaches write" on na_u11_wildcats.team_notices;
create policy "notices coaches write" on na_u11_wildcats.team_notices for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
revoke all on na_u11_wildcats.team_notices from anon, public;
grant select on na_u11_wildcats.team_notices to anon;
grant select, insert, update, delete on na_u11_wildcats.team_notices to authenticated;

-- the phones to tell about a note for one family: phones signed in with that child's family code (never coaches' phones)
create or replace function na_u11_wildcats.notice_targets(p_player text)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = na_u11_wildcats as $$
  select distinct s.endpoint, s.p256dh, s.auth from na_u11_wildcats.push_subs s
  join na_u11_wildcats.parent_links l on l.uid = s.uid join na_u11_wildcats.players p on p.id = l.player_id
  where s.uid is not null and not s.coach and p.name = p_player;
$$;
revoke all on function na_u11_wildcats.notice_targets(text) from public, anon, authenticated;

-- 2. Small team settings anyone may read (nothing private goes here): certificate levels ("certs").
create table if not exists na_u11_wildcats.team_prefs(
  k       text primary key check (k in ('certs')),
  v       jsonb not null default '{}'::jsonb check (length(v::text) < 6000),
  updated timestamptz not null default now()
);
alter table na_u11_wildcats.team_prefs enable row level security;
drop policy if exists "prefs read" on na_u11_wildcats.team_prefs;
create policy "prefs read" on na_u11_wildcats.team_prefs for select to anon, authenticated using (true);
drop policy if exists "prefs coaches write" on na_u11_wildcats.team_prefs;
create policy "prefs coaches write" on na_u11_wildcats.team_prefs for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
revoke all on na_u11_wildcats.team_prefs from anon, public;
grant select on na_u11_wildcats.team_prefs to anon;
grant select, insert, update, delete on na_u11_wildcats.team_prefs to authenticated;

-- 3. Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--    'plan' a training session plan, k = the date (yyyy-mm-dd), data = {focus, mins, blocks:[{id, title, mins, note}], note}
--    'chk'  a matchday checklist, k = "_list" (the team's list) or a match id (what's been ticked for that game)
do $$ begin
  if to_regclass('na_u11_wildcats.coach_notes') is not null then
    alter table na_u11_wildcats.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table na_u11_wildcats.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk'));
  end if;
end $$;

-- 4. Coach permissions. Each login on the coaches list is a manager, coach, assistant coach or admin.
--    While nobody is a manager, everyone keeps doing everything (how it worked before). Once there's a manager, only
--    managers can add or remove coaches, make invite links or change anyone's role; the site also keeps team setup,
--    sponsors, the fundraiser and deleting games or players to managers, and assistants to the matchday jobs.
alter table na_u11_wildcats.coaches add column if not exists coach_role text;
alter table na_u11_wildcats.coaches drop constraint if exists coaches_coach_role_check;
alter table na_u11_wildcats.coaches add constraint coaches_coach_role_check check (coach_role in ('manager','coach','assistant','admin'));

create or replace function na_u11_wildcats.has_manager() returns boolean
language sql stable security definer set search_path = na_u11_wildcats as $$ select exists (select 1 from na_u11_wildcats.coaches where coach_role = 'manager'); $$;
create or replace function na_u11_wildcats.is_manager() returns boolean
language sql stable security definer set search_path = na_u11_wildcats as $$
  select exists (select 1 from na_u11_wildcats.coaches where email = lower(auth.jwt() ->> 'email') and coach_role = 'manager');
$$;
revoke execute on function na_u11_wildcats.has_manager(), na_u11_wildcats.is_manager() from public;
grant execute on function na_u11_wildcats.has_manager(), na_u11_wildcats.is_manager() to anon, authenticated;

-- the database itself refuses a non-manager changing the list once there's a manager. Run from the SQL editor (no sign-in),
-- by an invite link (the new coach adds their own email) or on yourself, it's allowed.
create or replace function na_u11_wildcats.coaches_guard() returns trigger
language plpgsql security definer set search_path = na_u11_wildcats as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); target text := lower(coalesce(case when tg_op = 'DELETE' then old.email else new.email end, ''));
begin
  if em = '' or em = target or not exists (select 1 from na_u11_wildcats.coaches where coach_role = 'manager') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.coach_role is not distinct from old.coach_role then return new; end if;
  if not exists (select 1 from na_u11_wildcats.coaches where email = em and coach_role = 'manager') then
    raise exception 'Only the team''s managers can change the coaches list';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists coaches_guard on na_u11_wildcats.coaches;
create trigger coaches_guard before insert or update or delete on na_u11_wildcats.coaches for each row execute function na_u11_wildcats.coaches_guard();

-- a manager (or anyone, while there isn't one) sets a login's role. You can't make yourself a manager once there is one,
-- and the last manager can't step down (so the team is never left with nobody in charge).
create or replace function na_u11_wildcats.set_coach_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = na_u11_wildcats as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); who text := lower(trim(coalesce(p_email, ''))); s text;
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('manager','coach','assistant','admin') then raise exception 'bad role'; end if;
  if na_u11_wildcats.has_manager() and not na_u11_wildcats.is_manager() then raise exception 'Only the team''s managers can change roles'; end if;
  if p_role <> 'manager' and exists (select 1 from na_u11_wildcats.coaches where email = who and coach_role = 'manager')
     and (select count(*) from na_u11_wildcats.coaches where coach_role = 'manager') = 1 then
    raise exception 'The team needs at least one manager';
  end if;
  update na_u11_wildcats.coaches set coach_role = p_role where email = who;
  if not found then raise exception 'Not on the coaches list'; end if;
  if p_role = 'admin' and to_regclass('na_u11_wildcats.coach_availability') is not null then delete from na_u11_wildcats.coach_availability where email = who; end if;
  if to_regclass('na_u11_wildcats.coach_share') is not null then
    for s in execute 'select schema_name from na_u11_wildcats.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, who;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function na_u11_wildcats.set_coach_role(text, text) from public, anon;
grant execute on function na_u11_wildcats.set_coach_role(text, text) to authenticated;

-- your own role: coach or admin as before, or assistant, only while the team has no manager. After that a manager sets it.
create or replace function na_u11_wildcats.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin','assistant') then raise exception 'bad role'; end if;
  if na_u11_wildcats.has_manager() then raise exception 'Ask a manager to change your role'; end if;
  update na_u11_wildcats.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' and to_regclass('na_u11_wildcats.coach_availability') is not null then delete from na_u11_wildcats.coach_availability where email = em; end if;
  if to_regclass('na_u11_wildcats.coach_share') is not null then
    for s in execute 'select schema_name from na_u11_wildcats.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function na_u11_wildcats.set_my_coach_role(text) from public, anon;
grant execute on function na_u11_wildcats.set_my_coach_role(text) to authenticated;

-- invite links: managers only once there's a manager
create or replace function na_u11_wildcats.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = na_u11_wildcats as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  if na_u11_wildcats.has_manager() and not na_u11_wildcats.is_manager() then raise exception 'Only the team''s managers can invite coaches'; end if;
  insert into na_u11_wildcats.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function na_u11_wildcats.make_coach_invite(text) from public, anon;
grant execute on function na_u11_wildcats.make_coach_invite(text) to authenticated;
-- Team schema na_u11_pumas: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists na_u11_pumas;
grant usage on schema na_u11_pumas to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_pumas grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_pumas grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_pumas grant all on functions to anon, authenticated, service_role;

-- ===================== 44_coach_extras.sql =====================
-- Added 2026-11-25: team announcements, certificate levels, session plans, matchday checklists and coach permissions.
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 44_coach_extras.sql).
-- The site works before this is run: each new card says it isn't switched on yet.

-- 1. Announcements (the noticeboard). A coach writes a note for every family (player = null) or for one family
--    (player = that child's first name). Team-wide notes are for everyone who opens the site, like the training details.
--    A note for one family is only for the coaches and the phones signed in with that child's family code.
create table if not exists na_u11_pumas.team_notices(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'news' check (kind in ('news','cancel','kit','event','reminder')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  body    text not null default '' check (length(body) <= 1500),
  player  text check (player is null or length(player) <= 60),
  pinned  boolean not null default false,
  expires date,
  author  text not null default '',
  created timestamptz not null default now()
);
alter table na_u11_pumas.team_notices enable row level security;
create or replace function na_u11_pumas.my_child_names() returns setof text
language sql stable security definer set search_path = na_u11_pumas as $$
  select p.name from na_u11_pumas.parent_links l join na_u11_pumas.players p on p.id = l.player_id where auth.uid() is not null and l.uid = auth.uid();
$$;
revoke execute on function na_u11_pumas.my_child_names() from public;
grant execute on function na_u11_pumas.my_child_names() to anon, authenticated;
drop policy if exists "notices read" on na_u11_pumas.team_notices;
create policy "notices read" on na_u11_pumas.team_notices for select to anon, authenticated
  using (player is null or na_u11_pumas.is_coach() or player in (select na_u11_pumas.my_child_names()));
drop policy if exists "notices coaches write" on na_u11_pumas.team_notices;
create policy "notices coaches write" on na_u11_pumas.team_notices for all to authenticated using (na_u11_pumas.is_coach()) with check (na_u11_pumas.is_coach());
revoke all on na_u11_pumas.team_notices from anon, public;
grant select on na_u11_pumas.team_notices to anon;
grant select, insert, update, delete on na_u11_pumas.team_notices to authenticated;

-- the phones to tell about a note for one family: phones signed in with that child's family code (never coaches' phones)
create or replace function na_u11_pumas.notice_targets(p_player text)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = na_u11_pumas as $$
  select distinct s.endpoint, s.p256dh, s.auth from na_u11_pumas.push_subs s
  join na_u11_pumas.parent_links l on l.uid = s.uid join na_u11_pumas.players p on p.id = l.player_id
  where s.uid is not null and not s.coach and p.name = p_player;
$$;
revoke all on function na_u11_pumas.notice_targets(text) from public, anon, authenticated;

-- 2. Small team settings anyone may read (nothing private goes here): certificate levels ("certs").
create table if not exists na_u11_pumas.team_prefs(
  k       text primary key check (k in ('certs')),
  v       jsonb not null default '{}'::jsonb check (length(v::text) < 6000),
  updated timestamptz not null default now()
);
alter table na_u11_pumas.team_prefs enable row level security;
drop policy if exists "prefs read" on na_u11_pumas.team_prefs;
create policy "prefs read" on na_u11_pumas.team_prefs for select to anon, authenticated using (true);
drop policy if exists "prefs coaches write" on na_u11_pumas.team_prefs;
create policy "prefs coaches write" on na_u11_pumas.team_prefs for all to authenticated using (na_u11_pumas.is_coach()) with check (na_u11_pumas.is_coach());
revoke all on na_u11_pumas.team_prefs from anon, public;
grant select on na_u11_pumas.team_prefs to anon;
grant select, insert, update, delete on na_u11_pumas.team_prefs to authenticated;

-- 3. Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--    'plan' a training session plan, k = the date (yyyy-mm-dd), data = {focus, mins, blocks:[{id, title, mins, note}], note}
--    'chk'  a matchday checklist, k = "_list" (the team's list) or a match id (what's been ticked for that game)
do $$ begin
  if to_regclass('na_u11_pumas.coach_notes') is not null then
    alter table na_u11_pumas.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table na_u11_pumas.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk'));
  end if;
end $$;

-- 4. Coach permissions. Each login on the coaches list is a manager, coach, assistant coach or admin.
--    While nobody is a manager, everyone keeps doing everything (how it worked before). Once there's a manager, only
--    managers can add or remove coaches, make invite links or change anyone's role; the site also keeps team setup,
--    sponsors, the fundraiser and deleting games or players to managers, and assistants to the matchday jobs.
alter table na_u11_pumas.coaches add column if not exists coach_role text;
alter table na_u11_pumas.coaches drop constraint if exists coaches_coach_role_check;
alter table na_u11_pumas.coaches add constraint coaches_coach_role_check check (coach_role in ('manager','coach','assistant','admin'));

create or replace function na_u11_pumas.has_manager() returns boolean
language sql stable security definer set search_path = na_u11_pumas as $$ select exists (select 1 from na_u11_pumas.coaches where coach_role = 'manager'); $$;
create or replace function na_u11_pumas.is_manager() returns boolean
language sql stable security definer set search_path = na_u11_pumas as $$
  select exists (select 1 from na_u11_pumas.coaches where email = lower(auth.jwt() ->> 'email') and coach_role = 'manager');
$$;
revoke execute on function na_u11_pumas.has_manager(), na_u11_pumas.is_manager() from public;
grant execute on function na_u11_pumas.has_manager(), na_u11_pumas.is_manager() to anon, authenticated;

-- the database itself refuses a non-manager changing the list once there's a manager. Run from the SQL editor (no sign-in),
-- by an invite link (the new coach adds their own email) or on yourself, it's allowed.
create or replace function na_u11_pumas.coaches_guard() returns trigger
language plpgsql security definer set search_path = na_u11_pumas as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); target text := lower(coalesce(case when tg_op = 'DELETE' then old.email else new.email end, ''));
begin
  if em = '' or em = target or not exists (select 1 from na_u11_pumas.coaches where coach_role = 'manager') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.coach_role is not distinct from old.coach_role then return new; end if;
  if not exists (select 1 from na_u11_pumas.coaches where email = em and coach_role = 'manager') then
    raise exception 'Only the team''s managers can change the coaches list';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists coaches_guard on na_u11_pumas.coaches;
create trigger coaches_guard before insert or update or delete on na_u11_pumas.coaches for each row execute function na_u11_pumas.coaches_guard();

-- a manager (or anyone, while there isn't one) sets a login's role. You can't make yourself a manager once there is one,
-- and the last manager can't step down (so the team is never left with nobody in charge).
create or replace function na_u11_pumas.set_coach_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = na_u11_pumas as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); who text := lower(trim(coalesce(p_email, ''))); s text;
begin
  if not na_u11_pumas.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('manager','coach','assistant','admin') then raise exception 'bad role'; end if;
  if na_u11_pumas.has_manager() and not na_u11_pumas.is_manager() then raise exception 'Only the team''s managers can change roles'; end if;
  if p_role <> 'manager' and exists (select 1 from na_u11_pumas.coaches where email = who and coach_role = 'manager')
     and (select count(*) from na_u11_pumas.coaches where coach_role = 'manager') = 1 then
    raise exception 'The team needs at least one manager';
  end if;
  update na_u11_pumas.coaches set coach_role = p_role where email = who;
  if not found then raise exception 'Not on the coaches list'; end if;
  if p_role = 'admin' and to_regclass('na_u11_pumas.coach_availability') is not null then delete from na_u11_pumas.coach_availability where email = who; end if;
  if to_regclass('na_u11_pumas.coach_share') is not null then
    for s in execute 'select schema_name from na_u11_pumas.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, who;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function na_u11_pumas.set_coach_role(text, text) from public, anon;
grant execute on function na_u11_pumas.set_coach_role(text, text) to authenticated;

-- your own role: coach or admin as before, or assistant, only while the team has no manager. After that a manager sets it.
create or replace function na_u11_pumas.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = na_u11_pumas as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not na_u11_pumas.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin','assistant') then raise exception 'bad role'; end if;
  if na_u11_pumas.has_manager() then raise exception 'Ask a manager to change your role'; end if;
  update na_u11_pumas.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' and to_regclass('na_u11_pumas.coach_availability') is not null then delete from na_u11_pumas.coach_availability where email = em; end if;
  if to_regclass('na_u11_pumas.coach_share') is not null then
    for s in execute 'select schema_name from na_u11_pumas.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function na_u11_pumas.set_my_coach_role(text) from public, anon;
grant execute on function na_u11_pumas.set_my_coach_role(text) to authenticated;

-- invite links: managers only once there's a manager
create or replace function na_u11_pumas.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = na_u11_pumas as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not na_u11_pumas.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  if na_u11_pumas.has_manager() and not na_u11_pumas.is_manager() then raise exception 'Only the team''s managers can invite coaches'; end if;
  insert into na_u11_pumas.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function na_u11_pumas.make_coach_invite(text) from public, anon;
grant execute on function na_u11_pumas.make_coach_invite(text) to authenticated;
-- Team schema na_u8_wildcats: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists na_u8_wildcats;
grant usage on schema na_u8_wildcats to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u8_wildcats grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u8_wildcats grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u8_wildcats grant all on functions to anon, authenticated, service_role;

-- ===================== 44_coach_extras.sql =====================
-- Added 2026-11-25: team announcements, certificate levels, session plans, matchday checklists and coach permissions.
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 44_coach_extras.sql).
-- The site works before this is run: each new card says it isn't switched on yet.

-- 1. Announcements (the noticeboard). A coach writes a note for every family (player = null) or for one family
--    (player = that child's first name). Team-wide notes are for everyone who opens the site, like the training details.
--    A note for one family is only for the coaches and the phones signed in with that child's family code.
create table if not exists na_u8_wildcats.team_notices(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'news' check (kind in ('news','cancel','kit','event','reminder')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  body    text not null default '' check (length(body) <= 1500),
  player  text check (player is null or length(player) <= 60),
  pinned  boolean not null default false,
  expires date,
  author  text not null default '',
  created timestamptz not null default now()
);
alter table na_u8_wildcats.team_notices enable row level security;
create or replace function na_u8_wildcats.my_child_names() returns setof text
language sql stable security definer set search_path = na_u8_wildcats as $$
  select p.name from na_u8_wildcats.parent_links l join na_u8_wildcats.players p on p.id = l.player_id where auth.uid() is not null and l.uid = auth.uid();
$$;
revoke execute on function na_u8_wildcats.my_child_names() from public;
grant execute on function na_u8_wildcats.my_child_names() to anon, authenticated;
drop policy if exists "notices read" on na_u8_wildcats.team_notices;
create policy "notices read" on na_u8_wildcats.team_notices for select to anon, authenticated
  using (player is null or na_u8_wildcats.is_coach() or player in (select na_u8_wildcats.my_child_names()));
drop policy if exists "notices coaches write" on na_u8_wildcats.team_notices;
create policy "notices coaches write" on na_u8_wildcats.team_notices for all to authenticated using (na_u8_wildcats.is_coach()) with check (na_u8_wildcats.is_coach());
revoke all on na_u8_wildcats.team_notices from anon, public;
grant select on na_u8_wildcats.team_notices to anon;
grant select, insert, update, delete on na_u8_wildcats.team_notices to authenticated;

-- the phones to tell about a note for one family: phones signed in with that child's family code (never coaches' phones)
create or replace function na_u8_wildcats.notice_targets(p_player text)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = na_u8_wildcats as $$
  select distinct s.endpoint, s.p256dh, s.auth from na_u8_wildcats.push_subs s
  join na_u8_wildcats.parent_links l on l.uid = s.uid join na_u8_wildcats.players p on p.id = l.player_id
  where s.uid is not null and not s.coach and p.name = p_player;
$$;
revoke all on function na_u8_wildcats.notice_targets(text) from public, anon, authenticated;

-- 2. Small team settings anyone may read (nothing private goes here): certificate levels ("certs").
create table if not exists na_u8_wildcats.team_prefs(
  k       text primary key check (k in ('certs')),
  v       jsonb not null default '{}'::jsonb check (length(v::text) < 6000),
  updated timestamptz not null default now()
);
alter table na_u8_wildcats.team_prefs enable row level security;
drop policy if exists "prefs read" on na_u8_wildcats.team_prefs;
create policy "prefs read" on na_u8_wildcats.team_prefs for select to anon, authenticated using (true);
drop policy if exists "prefs coaches write" on na_u8_wildcats.team_prefs;
create policy "prefs coaches write" on na_u8_wildcats.team_prefs for all to authenticated using (na_u8_wildcats.is_coach()) with check (na_u8_wildcats.is_coach());
revoke all on na_u8_wildcats.team_prefs from anon, public;
grant select on na_u8_wildcats.team_prefs to anon;
grant select, insert, update, delete on na_u8_wildcats.team_prefs to authenticated;

-- 3. Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--    'plan' a training session plan, k = the date (yyyy-mm-dd), data = {focus, mins, blocks:[{id, title, mins, note}], note}
--    'chk'  a matchday checklist, k = "_list" (the team's list) or a match id (what's been ticked for that game)
do $$ begin
  if to_regclass('na_u8_wildcats.coach_notes') is not null then
    alter table na_u8_wildcats.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table na_u8_wildcats.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk'));
  end if;
end $$;

-- 4. Coach permissions. Each login on the coaches list is a manager, coach, assistant coach or admin.
--    While nobody is a manager, everyone keeps doing everything (how it worked before). Once there's a manager, only
--    managers can add or remove coaches, make invite links or change anyone's role; the site also keeps team setup,
--    sponsors, the fundraiser and deleting games or players to managers, and assistants to the matchday jobs.
alter table na_u8_wildcats.coaches add column if not exists coach_role text;
alter table na_u8_wildcats.coaches drop constraint if exists coaches_coach_role_check;
alter table na_u8_wildcats.coaches add constraint coaches_coach_role_check check (coach_role in ('manager','coach','assistant','admin'));

create or replace function na_u8_wildcats.has_manager() returns boolean
language sql stable security definer set search_path = na_u8_wildcats as $$ select exists (select 1 from na_u8_wildcats.coaches where coach_role = 'manager'); $$;
create or replace function na_u8_wildcats.is_manager() returns boolean
language sql stable security definer set search_path = na_u8_wildcats as $$
  select exists (select 1 from na_u8_wildcats.coaches where email = lower(auth.jwt() ->> 'email') and coach_role = 'manager');
$$;
revoke execute on function na_u8_wildcats.has_manager(), na_u8_wildcats.is_manager() from public;
grant execute on function na_u8_wildcats.has_manager(), na_u8_wildcats.is_manager() to anon, authenticated;

-- the database itself refuses a non-manager changing the list once there's a manager. Run from the SQL editor (no sign-in),
-- by an invite link (the new coach adds their own email) or on yourself, it's allowed.
create or replace function na_u8_wildcats.coaches_guard() returns trigger
language plpgsql security definer set search_path = na_u8_wildcats as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); target text := lower(coalesce(case when tg_op = 'DELETE' then old.email else new.email end, ''));
begin
  if em = '' or em = target or not exists (select 1 from na_u8_wildcats.coaches where coach_role = 'manager') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.coach_role is not distinct from old.coach_role then return new; end if;
  if not exists (select 1 from na_u8_wildcats.coaches where email = em and coach_role = 'manager') then
    raise exception 'Only the team''s managers can change the coaches list';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists coaches_guard on na_u8_wildcats.coaches;
create trigger coaches_guard before insert or update or delete on na_u8_wildcats.coaches for each row execute function na_u8_wildcats.coaches_guard();

-- a manager (or anyone, while there isn't one) sets a login's role. You can't make yourself a manager once there is one,
-- and the last manager can't step down (so the team is never left with nobody in charge).
create or replace function na_u8_wildcats.set_coach_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = na_u8_wildcats as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); who text := lower(trim(coalesce(p_email, ''))); s text;
begin
  if not na_u8_wildcats.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('manager','coach','assistant','admin') then raise exception 'bad role'; end if;
  if na_u8_wildcats.has_manager() and not na_u8_wildcats.is_manager() then raise exception 'Only the team''s managers can change roles'; end if;
  if p_role <> 'manager' and exists (select 1 from na_u8_wildcats.coaches where email = who and coach_role = 'manager')
     and (select count(*) from na_u8_wildcats.coaches where coach_role = 'manager') = 1 then
    raise exception 'The team needs at least one manager';
  end if;
  update na_u8_wildcats.coaches set coach_role = p_role where email = who;
  if not found then raise exception 'Not on the coaches list'; end if;
  if p_role = 'admin' and to_regclass('na_u8_wildcats.coach_availability') is not null then delete from na_u8_wildcats.coach_availability where email = who; end if;
  if to_regclass('na_u8_wildcats.coach_share') is not null then
    for s in execute 'select schema_name from na_u8_wildcats.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, who;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function na_u8_wildcats.set_coach_role(text, text) from public, anon;
grant execute on function na_u8_wildcats.set_coach_role(text, text) to authenticated;

-- your own role: coach or admin as before, or assistant, only while the team has no manager. After that a manager sets it.
create or replace function na_u8_wildcats.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = na_u8_wildcats as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not na_u8_wildcats.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin','assistant') then raise exception 'bad role'; end if;
  if na_u8_wildcats.has_manager() then raise exception 'Ask a manager to change your role'; end if;
  update na_u8_wildcats.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' and to_regclass('na_u8_wildcats.coach_availability') is not null then delete from na_u8_wildcats.coach_availability where email = em; end if;
  if to_regclass('na_u8_wildcats.coach_share') is not null then
    for s in execute 'select schema_name from na_u8_wildcats.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function na_u8_wildcats.set_my_coach_role(text) from public, anon;
grant execute on function na_u8_wildcats.set_my_coach_role(text) to authenticated;

-- invite links: managers only once there's a manager
create or replace function na_u8_wildcats.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = na_u8_wildcats as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not na_u8_wildcats.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  if na_u8_wildcats.has_manager() and not na_u8_wildcats.is_manager() then raise exception 'Only the team''s managers can invite coaches'; end if;
  insert into na_u8_wildcats.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function na_u8_wildcats.make_coach_invite(text) from public, anon;
grant execute on function na_u8_wildcats.make_coach_invite(text) to authenticated;
-- Team schema washington_wolves_u11s: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists washington_wolves_u11s;
grant usage on schema washington_wolves_u11s to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_wolves_u11s grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_wolves_u11s grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_wolves_u11s grant all on functions to anon, authenticated, service_role;

-- ===================== 44_coach_extras.sql =====================
-- Added 2026-11-25: team announcements, certificate levels, session plans, matchday checklists and coach permissions.
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 44_coach_extras.sql).
-- The site works before this is run: each new card says it isn't switched on yet.

-- 1. Announcements (the noticeboard). A coach writes a note for every family (player = null) or for one family
--    (player = that child's first name). Team-wide notes are for everyone who opens the site, like the training details.
--    A note for one family is only for the coaches and the phones signed in with that child's family code.
create table if not exists washington_wolves_u11s.team_notices(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'news' check (kind in ('news','cancel','kit','event','reminder')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  body    text not null default '' check (length(body) <= 1500),
  player  text check (player is null or length(player) <= 60),
  pinned  boolean not null default false,
  expires date,
  author  text not null default '',
  created timestamptz not null default now()
);
alter table washington_wolves_u11s.team_notices enable row level security;
create or replace function washington_wolves_u11s.my_child_names() returns setof text
language sql stable security definer set search_path = washington_wolves_u11s as $$
  select p.name from washington_wolves_u11s.parent_links l join washington_wolves_u11s.players p on p.id = l.player_id where auth.uid() is not null and l.uid = auth.uid();
$$;
revoke execute on function washington_wolves_u11s.my_child_names() from public;
grant execute on function washington_wolves_u11s.my_child_names() to anon, authenticated;
drop policy if exists "notices read" on washington_wolves_u11s.team_notices;
create policy "notices read" on washington_wolves_u11s.team_notices for select to anon, authenticated
  using (player is null or washington_wolves_u11s.is_coach() or player in (select washington_wolves_u11s.my_child_names()));
drop policy if exists "notices coaches write" on washington_wolves_u11s.team_notices;
create policy "notices coaches write" on washington_wolves_u11s.team_notices for all to authenticated using (washington_wolves_u11s.is_coach()) with check (washington_wolves_u11s.is_coach());
revoke all on washington_wolves_u11s.team_notices from anon, public;
grant select on washington_wolves_u11s.team_notices to anon;
grant select, insert, update, delete on washington_wolves_u11s.team_notices to authenticated;

-- the phones to tell about a note for one family: phones signed in with that child's family code (never coaches' phones)
create or replace function washington_wolves_u11s.notice_targets(p_player text)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = washington_wolves_u11s as $$
  select distinct s.endpoint, s.p256dh, s.auth from washington_wolves_u11s.push_subs s
  join washington_wolves_u11s.parent_links l on l.uid = s.uid join washington_wolves_u11s.players p on p.id = l.player_id
  where s.uid is not null and not s.coach and p.name = p_player;
$$;
revoke all on function washington_wolves_u11s.notice_targets(text) from public, anon, authenticated;

-- 2. Small team settings anyone may read (nothing private goes here): certificate levels ("certs").
create table if not exists washington_wolves_u11s.team_prefs(
  k       text primary key check (k in ('certs')),
  v       jsonb not null default '{}'::jsonb check (length(v::text) < 6000),
  updated timestamptz not null default now()
);
alter table washington_wolves_u11s.team_prefs enable row level security;
drop policy if exists "prefs read" on washington_wolves_u11s.team_prefs;
create policy "prefs read" on washington_wolves_u11s.team_prefs for select to anon, authenticated using (true);
drop policy if exists "prefs coaches write" on washington_wolves_u11s.team_prefs;
create policy "prefs coaches write" on washington_wolves_u11s.team_prefs for all to authenticated using (washington_wolves_u11s.is_coach()) with check (washington_wolves_u11s.is_coach());
revoke all on washington_wolves_u11s.team_prefs from anon, public;
grant select on washington_wolves_u11s.team_prefs to anon;
grant select, insert, update, delete on washington_wolves_u11s.team_prefs to authenticated;

-- 3. Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--    'plan' a training session plan, k = the date (yyyy-mm-dd), data = {focus, mins, blocks:[{id, title, mins, note}], note}
--    'chk'  a matchday checklist, k = "_list" (the team's list) or a match id (what's been ticked for that game)
do $$ begin
  if to_regclass('washington_wolves_u11s.coach_notes') is not null then
    alter table washington_wolves_u11s.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table washington_wolves_u11s.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk'));
  end if;
end $$;

-- 4. Coach permissions. Each login on the coaches list is a manager, coach, assistant coach or admin.
--    While nobody is a manager, everyone keeps doing everything (how it worked before). Once there's a manager, only
--    managers can add or remove coaches, make invite links or change anyone's role; the site also keeps team setup,
--    sponsors, the fundraiser and deleting games or players to managers, and assistants to the matchday jobs.
alter table washington_wolves_u11s.coaches add column if not exists coach_role text;
alter table washington_wolves_u11s.coaches drop constraint if exists coaches_coach_role_check;
alter table washington_wolves_u11s.coaches add constraint coaches_coach_role_check check (coach_role in ('manager','coach','assistant','admin'));

create or replace function washington_wolves_u11s.has_manager() returns boolean
language sql stable security definer set search_path = washington_wolves_u11s as $$ select exists (select 1 from washington_wolves_u11s.coaches where coach_role = 'manager'); $$;
create or replace function washington_wolves_u11s.is_manager() returns boolean
language sql stable security definer set search_path = washington_wolves_u11s as $$
  select exists (select 1 from washington_wolves_u11s.coaches where email = lower(auth.jwt() ->> 'email') and coach_role = 'manager');
$$;
revoke execute on function washington_wolves_u11s.has_manager(), washington_wolves_u11s.is_manager() from public;
grant execute on function washington_wolves_u11s.has_manager(), washington_wolves_u11s.is_manager() to anon, authenticated;

-- the database itself refuses a non-manager changing the list once there's a manager. Run from the SQL editor (no sign-in),
-- by an invite link (the new coach adds their own email) or on yourself, it's allowed.
create or replace function washington_wolves_u11s.coaches_guard() returns trigger
language plpgsql security definer set search_path = washington_wolves_u11s as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); target text := lower(coalesce(case when tg_op = 'DELETE' then old.email else new.email end, ''));
begin
  if em = '' or em = target or not exists (select 1 from washington_wolves_u11s.coaches where coach_role = 'manager') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.coach_role is not distinct from old.coach_role then return new; end if;
  if not exists (select 1 from washington_wolves_u11s.coaches where email = em and coach_role = 'manager') then
    raise exception 'Only the team''s managers can change the coaches list';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists coaches_guard on washington_wolves_u11s.coaches;
create trigger coaches_guard before insert or update or delete on washington_wolves_u11s.coaches for each row execute function washington_wolves_u11s.coaches_guard();

-- a manager (or anyone, while there isn't one) sets a login's role. You can't make yourself a manager once there is one,
-- and the last manager can't step down (so the team is never left with nobody in charge).
create or replace function washington_wolves_u11s.set_coach_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = washington_wolves_u11s as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); who text := lower(trim(coalesce(p_email, ''))); s text;
begin
  if not washington_wolves_u11s.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('manager','coach','assistant','admin') then raise exception 'bad role'; end if;
  if washington_wolves_u11s.has_manager() and not washington_wolves_u11s.is_manager() then raise exception 'Only the team''s managers can change roles'; end if;
  if p_role <> 'manager' and exists (select 1 from washington_wolves_u11s.coaches where email = who and coach_role = 'manager')
     and (select count(*) from washington_wolves_u11s.coaches where coach_role = 'manager') = 1 then
    raise exception 'The team needs at least one manager';
  end if;
  update washington_wolves_u11s.coaches set coach_role = p_role where email = who;
  if not found then raise exception 'Not on the coaches list'; end if;
  if p_role = 'admin' and to_regclass('washington_wolves_u11s.coach_availability') is not null then delete from washington_wolves_u11s.coach_availability where email = who; end if;
  if to_regclass('washington_wolves_u11s.coach_share') is not null then
    for s in execute 'select schema_name from washington_wolves_u11s.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, who;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function washington_wolves_u11s.set_coach_role(text, text) from public, anon;
grant execute on function washington_wolves_u11s.set_coach_role(text, text) to authenticated;

-- your own role: coach or admin as before, or assistant, only while the team has no manager. After that a manager sets it.
create or replace function washington_wolves_u11s.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = washington_wolves_u11s as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not washington_wolves_u11s.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin','assistant') then raise exception 'bad role'; end if;
  if washington_wolves_u11s.has_manager() then raise exception 'Ask a manager to change your role'; end if;
  update washington_wolves_u11s.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' and to_regclass('washington_wolves_u11s.coach_availability') is not null then delete from washington_wolves_u11s.coach_availability where email = em; end if;
  if to_regclass('washington_wolves_u11s.coach_share') is not null then
    for s in execute 'select schema_name from washington_wolves_u11s.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function washington_wolves_u11s.set_my_coach_role(text) from public, anon;
grant execute on function washington_wolves_u11s.set_my_coach_role(text) to authenticated;

-- invite links: managers only once there's a manager
create or replace function washington_wolves_u11s.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = washington_wolves_u11s as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not washington_wolves_u11s.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  if washington_wolves_u11s.has_manager() and not washington_wolves_u11s.is_manager() then raise exception 'Only the team''s managers can invite coaches'; end if;
  insert into washington_wolves_u11s.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function washington_wolves_u11s.make_coach_invite(text) from public, anon;
grant execute on function washington_wolves_u11s.make_coach_invite(text) to authenticated;
-- Team schema washington_samba_u13s: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists washington_samba_u13s;
grant usage on schema washington_samba_u13s to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_samba_u13s grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_samba_u13s grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_samba_u13s grant all on functions to anon, authenticated, service_role;

-- ===================== 44_coach_extras.sql =====================
-- Added 2026-11-25: team announcements, certificate levels, session plans, matchday checklists and coach permissions.
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 44_coach_extras.sql).
-- The site works before this is run: each new card says it isn't switched on yet.

-- 1. Announcements (the noticeboard). A coach writes a note for every family (player = null) or for one family
--    (player = that child's first name). Team-wide notes are for everyone who opens the site, like the training details.
--    A note for one family is only for the coaches and the phones signed in with that child's family code.
create table if not exists washington_samba_u13s.team_notices(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'news' check (kind in ('news','cancel','kit','event','reminder')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  body    text not null default '' check (length(body) <= 1500),
  player  text check (player is null or length(player) <= 60),
  pinned  boolean not null default false,
  expires date,
  author  text not null default '',
  created timestamptz not null default now()
);
alter table washington_samba_u13s.team_notices enable row level security;
create or replace function washington_samba_u13s.my_child_names() returns setof text
language sql stable security definer set search_path = washington_samba_u13s as $$
  select p.name from washington_samba_u13s.parent_links l join washington_samba_u13s.players p on p.id = l.player_id where auth.uid() is not null and l.uid = auth.uid();
$$;
revoke execute on function washington_samba_u13s.my_child_names() from public;
grant execute on function washington_samba_u13s.my_child_names() to anon, authenticated;
drop policy if exists "notices read" on washington_samba_u13s.team_notices;
create policy "notices read" on washington_samba_u13s.team_notices for select to anon, authenticated
  using (player is null or washington_samba_u13s.is_coach() or player in (select washington_samba_u13s.my_child_names()));
drop policy if exists "notices coaches write" on washington_samba_u13s.team_notices;
create policy "notices coaches write" on washington_samba_u13s.team_notices for all to authenticated using (washington_samba_u13s.is_coach()) with check (washington_samba_u13s.is_coach());
revoke all on washington_samba_u13s.team_notices from anon, public;
grant select on washington_samba_u13s.team_notices to anon;
grant select, insert, update, delete on washington_samba_u13s.team_notices to authenticated;

-- the phones to tell about a note for one family: phones signed in with that child's family code (never coaches' phones)
create or replace function washington_samba_u13s.notice_targets(p_player text)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = washington_samba_u13s as $$
  select distinct s.endpoint, s.p256dh, s.auth from washington_samba_u13s.push_subs s
  join washington_samba_u13s.parent_links l on l.uid = s.uid join washington_samba_u13s.players p on p.id = l.player_id
  where s.uid is not null and not s.coach and p.name = p_player;
$$;
revoke all on function washington_samba_u13s.notice_targets(text) from public, anon, authenticated;

-- 2. Small team settings anyone may read (nothing private goes here): certificate levels ("certs").
create table if not exists washington_samba_u13s.team_prefs(
  k       text primary key check (k in ('certs')),
  v       jsonb not null default '{}'::jsonb check (length(v::text) < 6000),
  updated timestamptz not null default now()
);
alter table washington_samba_u13s.team_prefs enable row level security;
drop policy if exists "prefs read" on washington_samba_u13s.team_prefs;
create policy "prefs read" on washington_samba_u13s.team_prefs for select to anon, authenticated using (true);
drop policy if exists "prefs coaches write" on washington_samba_u13s.team_prefs;
create policy "prefs coaches write" on washington_samba_u13s.team_prefs for all to authenticated using (washington_samba_u13s.is_coach()) with check (washington_samba_u13s.is_coach());
revoke all on washington_samba_u13s.team_prefs from anon, public;
grant select on washington_samba_u13s.team_prefs to anon;
grant select, insert, update, delete on washington_samba_u13s.team_prefs to authenticated;

-- 3. Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--    'plan' a training session plan, k = the date (yyyy-mm-dd), data = {focus, mins, blocks:[{id, title, mins, note}], note}
--    'chk'  a matchday checklist, k = "_list" (the team's list) or a match id (what's been ticked for that game)
do $$ begin
  if to_regclass('washington_samba_u13s.coach_notes') is not null then
    alter table washington_samba_u13s.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table washington_samba_u13s.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk'));
  end if;
end $$;

-- 4. Coach permissions. Each login on the coaches list is a manager, coach, assistant coach or admin.
--    While nobody is a manager, everyone keeps doing everything (how it worked before). Once there's a manager, only
--    managers can add or remove coaches, make invite links or change anyone's role; the site also keeps team setup,
--    sponsors, the fundraiser and deleting games or players to managers, and assistants to the matchday jobs.
alter table washington_samba_u13s.coaches add column if not exists coach_role text;
alter table washington_samba_u13s.coaches drop constraint if exists coaches_coach_role_check;
alter table washington_samba_u13s.coaches add constraint coaches_coach_role_check check (coach_role in ('manager','coach','assistant','admin'));

create or replace function washington_samba_u13s.has_manager() returns boolean
language sql stable security definer set search_path = washington_samba_u13s as $$ select exists (select 1 from washington_samba_u13s.coaches where coach_role = 'manager'); $$;
create or replace function washington_samba_u13s.is_manager() returns boolean
language sql stable security definer set search_path = washington_samba_u13s as $$
  select exists (select 1 from washington_samba_u13s.coaches where email = lower(auth.jwt() ->> 'email') and coach_role = 'manager');
$$;
revoke execute on function washington_samba_u13s.has_manager(), washington_samba_u13s.is_manager() from public;
grant execute on function washington_samba_u13s.has_manager(), washington_samba_u13s.is_manager() to anon, authenticated;

-- the database itself refuses a non-manager changing the list once there's a manager. Run from the SQL editor (no sign-in),
-- by an invite link (the new coach adds their own email) or on yourself, it's allowed.
create or replace function washington_samba_u13s.coaches_guard() returns trigger
language plpgsql security definer set search_path = washington_samba_u13s as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); target text := lower(coalesce(case when tg_op = 'DELETE' then old.email else new.email end, ''));
begin
  if em = '' or em = target or not exists (select 1 from washington_samba_u13s.coaches where coach_role = 'manager') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.coach_role is not distinct from old.coach_role then return new; end if;
  if not exists (select 1 from washington_samba_u13s.coaches where email = em and coach_role = 'manager') then
    raise exception 'Only the team''s managers can change the coaches list';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists coaches_guard on washington_samba_u13s.coaches;
create trigger coaches_guard before insert or update or delete on washington_samba_u13s.coaches for each row execute function washington_samba_u13s.coaches_guard();

-- a manager (or anyone, while there isn't one) sets a login's role. You can't make yourself a manager once there is one,
-- and the last manager can't step down (so the team is never left with nobody in charge).
create or replace function washington_samba_u13s.set_coach_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = washington_samba_u13s as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); who text := lower(trim(coalesce(p_email, ''))); s text;
begin
  if not washington_samba_u13s.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('manager','coach','assistant','admin') then raise exception 'bad role'; end if;
  if washington_samba_u13s.has_manager() and not washington_samba_u13s.is_manager() then raise exception 'Only the team''s managers can change roles'; end if;
  if p_role <> 'manager' and exists (select 1 from washington_samba_u13s.coaches where email = who and coach_role = 'manager')
     and (select count(*) from washington_samba_u13s.coaches where coach_role = 'manager') = 1 then
    raise exception 'The team needs at least one manager';
  end if;
  update washington_samba_u13s.coaches set coach_role = p_role where email = who;
  if not found then raise exception 'Not on the coaches list'; end if;
  if p_role = 'admin' and to_regclass('washington_samba_u13s.coach_availability') is not null then delete from washington_samba_u13s.coach_availability where email = who; end if;
  if to_regclass('washington_samba_u13s.coach_share') is not null then
    for s in execute 'select schema_name from washington_samba_u13s.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, who;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function washington_samba_u13s.set_coach_role(text, text) from public, anon;
grant execute on function washington_samba_u13s.set_coach_role(text, text) to authenticated;

-- your own role: coach or admin as before, or assistant, only while the team has no manager. After that a manager sets it.
create or replace function washington_samba_u13s.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = washington_samba_u13s as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not washington_samba_u13s.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin','assistant') then raise exception 'bad role'; end if;
  if washington_samba_u13s.has_manager() then raise exception 'Ask a manager to change your role'; end if;
  update washington_samba_u13s.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' and to_regclass('washington_samba_u13s.coach_availability') is not null then delete from washington_samba_u13s.coach_availability where email = em; end if;
  if to_regclass('washington_samba_u13s.coach_share') is not null then
    for s in execute 'select schema_name from washington_samba_u13s.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function washington_samba_u13s.set_my_coach_role(text) from public, anon;
grant execute on function washington_samba_u13s.set_my_coach_role(text) to authenticated;

-- invite links: managers only once there's a manager
create or replace function washington_samba_u13s.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = washington_samba_u13s as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not washington_samba_u13s.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  if washington_samba_u13s.has_manager() and not washington_samba_u13s.is_manager() then raise exception 'Only the team''s managers can invite coaches'; end if;
  insert into washington_samba_u13s.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function washington_samba_u13s.make_coach_invite(text) from public, anon;
grant execute on function washington_samba_u13s.make_coach_invite(text) to authenticated;
-- Team schema hilda_park_u9_girls: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists hilda_park_u9_girls;
grant usage on schema hilda_park_u9_girls to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on functions to anon, authenticated, service_role;

-- ===================== 44_coach_extras.sql =====================
-- Added 2026-11-25: team announcements, certificate levels, session plans, matchday checklists and coach permissions.
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 44_coach_extras.sql).
-- The site works before this is run: each new card says it isn't switched on yet.

-- 1. Announcements (the noticeboard). A coach writes a note for every family (player = null) or for one family
--    (player = that child's first name). Team-wide notes are for everyone who opens the site, like the training details.
--    A note for one family is only for the coaches and the phones signed in with that child's family code.
create table if not exists hilda_park_u9_girls.team_notices(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'news' check (kind in ('news','cancel','kit','event','reminder')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  body    text not null default '' check (length(body) <= 1500),
  player  text check (player is null or length(player) <= 60),
  pinned  boolean not null default false,
  expires date,
  author  text not null default '',
  created timestamptz not null default now()
);
alter table hilda_park_u9_girls.team_notices enable row level security;
create or replace function hilda_park_u9_girls.my_child_names() returns setof text
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select p.name from hilda_park_u9_girls.parent_links l join hilda_park_u9_girls.players p on p.id = l.player_id where auth.uid() is not null and l.uid = auth.uid();
$$;
revoke execute on function hilda_park_u9_girls.my_child_names() from public;
grant execute on function hilda_park_u9_girls.my_child_names() to anon, authenticated;
drop policy if exists "notices read" on hilda_park_u9_girls.team_notices;
create policy "notices read" on hilda_park_u9_girls.team_notices for select to anon, authenticated
  using (player is null or hilda_park_u9_girls.is_coach() or player in (select hilda_park_u9_girls.my_child_names()));
drop policy if exists "notices coaches write" on hilda_park_u9_girls.team_notices;
create policy "notices coaches write" on hilda_park_u9_girls.team_notices for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke all on hilda_park_u9_girls.team_notices from anon, public;
grant select on hilda_park_u9_girls.team_notices to anon;
grant select, insert, update, delete on hilda_park_u9_girls.team_notices to authenticated;

-- the phones to tell about a note for one family: phones signed in with that child's family code (never coaches' phones)
create or replace function hilda_park_u9_girls.notice_targets(p_player text)
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select distinct s.endpoint, s.p256dh, s.auth from hilda_park_u9_girls.push_subs s
  join hilda_park_u9_girls.parent_links l on l.uid = s.uid join hilda_park_u9_girls.players p on p.id = l.player_id
  where s.uid is not null and not s.coach and p.name = p_player;
$$;
revoke all on function hilda_park_u9_girls.notice_targets(text) from public, anon, authenticated;

-- 2. Small team settings anyone may read (nothing private goes here): certificate levels ("certs").
create table if not exists hilda_park_u9_girls.team_prefs(
  k       text primary key check (k in ('certs')),
  v       jsonb not null default '{}'::jsonb check (length(v::text) < 6000),
  updated timestamptz not null default now()
);
alter table hilda_park_u9_girls.team_prefs enable row level security;
drop policy if exists "prefs read" on hilda_park_u9_girls.team_prefs;
create policy "prefs read" on hilda_park_u9_girls.team_prefs for select to anon, authenticated using (true);
drop policy if exists "prefs coaches write" on hilda_park_u9_girls.team_prefs;
create policy "prefs coaches write" on hilda_park_u9_girls.team_prefs for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke all on hilda_park_u9_girls.team_prefs from anon, public;
grant select on hilda_park_u9_girls.team_prefs to anon;
grant select, insert, update, delete on hilda_park_u9_girls.team_prefs to authenticated;

-- 3. Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--    'plan' a training session plan, k = the date (yyyy-mm-dd), data = {focus, mins, blocks:[{id, title, mins, note}], note}
--    'chk'  a matchday checklist, k = "_list" (the team's list) or a match id (what's been ticked for that game)
do $$ begin
  if to_regclass('hilda_park_u9_girls.coach_notes') is not null then
    alter table hilda_park_u9_girls.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table hilda_park_u9_girls.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk'));
  end if;
end $$;

-- 4. Coach permissions. Each login on the coaches list is a manager, coach, assistant coach or admin.
--    While nobody is a manager, everyone keeps doing everything (how it worked before). Once there's a manager, only
--    managers can add or remove coaches, make invite links or change anyone's role; the site also keeps team setup,
--    sponsors, the fundraiser and deleting games or players to managers, and assistants to the matchday jobs.
alter table hilda_park_u9_girls.coaches add column if not exists coach_role text;
alter table hilda_park_u9_girls.coaches drop constraint if exists coaches_coach_role_check;
alter table hilda_park_u9_girls.coaches add constraint coaches_coach_role_check check (coach_role in ('manager','coach','assistant','admin'));

create or replace function hilda_park_u9_girls.has_manager() returns boolean
language sql stable security definer set search_path = hilda_park_u9_girls as $$ select exists (select 1 from hilda_park_u9_girls.coaches where coach_role = 'manager'); $$;
create or replace function hilda_park_u9_girls.is_manager() returns boolean
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select exists (select 1 from hilda_park_u9_girls.coaches where email = lower(auth.jwt() ->> 'email') and coach_role = 'manager');
$$;
revoke execute on function hilda_park_u9_girls.has_manager(), hilda_park_u9_girls.is_manager() from public;
grant execute on function hilda_park_u9_girls.has_manager(), hilda_park_u9_girls.is_manager() to anon, authenticated;

-- the database itself refuses a non-manager changing the list once there's a manager. Run from the SQL editor (no sign-in),
-- by an invite link (the new coach adds their own email) or on yourself, it's allowed.
create or replace function hilda_park_u9_girls.coaches_guard() returns trigger
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); target text := lower(coalesce(case when tg_op = 'DELETE' then old.email else new.email end, ''));
begin
  if em = '' or em = target or not exists (select 1 from hilda_park_u9_girls.coaches where coach_role = 'manager') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.coach_role is not distinct from old.coach_role then return new; end if;
  if not exists (select 1 from hilda_park_u9_girls.coaches where email = em and coach_role = 'manager') then
    raise exception 'Only the team''s managers can change the coaches list';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists coaches_guard on hilda_park_u9_girls.coaches;
create trigger coaches_guard before insert or update or delete on hilda_park_u9_girls.coaches for each row execute function hilda_park_u9_girls.coaches_guard();

-- a manager (or anyone, while there isn't one) sets a login's role. You can't make yourself a manager once there is one,
-- and the last manager can't step down (so the team is never left with nobody in charge).
create or replace function hilda_park_u9_girls.set_coach_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); who text := lower(trim(coalesce(p_email, ''))); s text;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('manager','coach','assistant','admin') then raise exception 'bad role'; end if;
  if hilda_park_u9_girls.has_manager() and not hilda_park_u9_girls.is_manager() then raise exception 'Only the team''s managers can change roles'; end if;
  if p_role <> 'manager' and exists (select 1 from hilda_park_u9_girls.coaches where email = who and coach_role = 'manager')
     and (select count(*) from hilda_park_u9_girls.coaches where coach_role = 'manager') = 1 then
    raise exception 'The team needs at least one manager';
  end if;
  update hilda_park_u9_girls.coaches set coach_role = p_role where email = who;
  if not found then raise exception 'Not on the coaches list'; end if;
  if p_role = 'admin' and to_regclass('hilda_park_u9_girls.coach_availability') is not null then delete from hilda_park_u9_girls.coach_availability where email = who; end if;
  if to_regclass('hilda_park_u9_girls.coach_share') is not null then
    for s in execute 'select schema_name from hilda_park_u9_girls.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, who;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function hilda_park_u9_girls.set_coach_role(text, text) from public, anon;
grant execute on function hilda_park_u9_girls.set_coach_role(text, text) to authenticated;

-- your own role: coach or admin as before, or assistant, only while the team has no manager. After that a manager sets it.
create or replace function hilda_park_u9_girls.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin','assistant') then raise exception 'bad role'; end if;
  if hilda_park_u9_girls.has_manager() then raise exception 'Ask a manager to change your role'; end if;
  update hilda_park_u9_girls.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' and to_regclass('hilda_park_u9_girls.coach_availability') is not null then delete from hilda_park_u9_girls.coach_availability where email = em; end if;
  if to_regclass('hilda_park_u9_girls.coach_share') is not null then
    for s in execute 'select schema_name from hilda_park_u9_girls.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function hilda_park_u9_girls.set_my_coach_role(text) from public, anon;
grant execute on function hilda_park_u9_girls.set_my_coach_role(text) to authenticated;

-- invite links: managers only once there's a manager
create or replace function hilda_park_u9_girls.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  if hilda_park_u9_girls.has_manager() and not hilda_park_u9_girls.is_manager() then raise exception 'Only the team''s managers can invite coaches'; end if;
  insert into hilda_park_u9_girls.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function hilda_park_u9_girls.make_coach_invite(text) from public, anon;
grant execute on function hilda_park_u9_girls.make_coach_invite(text) to authenticated;
