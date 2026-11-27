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
    alter table public.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk','mday','deb'));
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
