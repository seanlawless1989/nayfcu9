-- Added 2026-11-03: Touchline Tales owner page (touchlinetales.club/admin/). Safe to re-run. [project only]: run ONCE per
-- Supabase project, not per team schema.
-- One person (the Touchline Tales owner) signs in there and sees how every team site in this project is being used.
-- It only ever returns counts and dates, plus each team's coach emails and when they last signed in. Never children's
-- names, parents, availability answers or anything else about a player.
--   public.tt_admins     who may use the owner page, by email (no policies: the site can't read or change it)
--   public.tt_overview() one summary per team data area (public and every team schema with a coaches table)
--
-- After running it:
--   1. Add the owner's email:  insert into public.tt_admins (email) values ('you@example.com') on conflict do nothing;
--   2. Authentication > URL Configuration > Redirect URLs: add https://touchlinetales.club/admin/

create table if not exists public.tt_admins (email text primary key check (email = lower(email)));
alter table public.tt_admins enable row level security;   -- no policies: hidden from every site
revoke all on public.tt_admins from anon, authenticated;

create or replace function public.tt_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tt_admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.tt_overview() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  s text; j jsonb; v jsonb; out jsonb := '[]'::jsonb;
  today date := (now() at time zone 'Europe/London')::date;
  has_report boolean;
begin
  if not public.tt_is_admin() then return null; end if;
  for s in select schemaname from pg_tables where tablename = 'coaches' and schemaname not in ('club') order by schemaname loop
    j := jsonb_build_object('schema', s);

    -- team setup
    if to_regclass(format('%I.team_settings', s)) is not null then
      execute format('select jsonb_build_object(''ready'', ready, ''name'', settings ->> ''name'', ''age'', settings ->> ''ageGroup'',
                      ''setup_updated'', updated) from %I.team_settings where id = 1', s) into v;
      j := j || coalesce(v, '{}'::jsonb);
    end if;

    -- coaches: who is on the list and when they last signed in (adults only, for chasing a coach who hasn't started)
    execute format('select jsonb_build_object(''coaches'', count(*), ''coaches_in'', count(u.last_sign_in_at),
                      ''coach_last'', max(u.last_sign_in_at),
                      ''coach_list'', coalesce(jsonb_agg(jsonb_build_object(''email'', c.email, ''last'', u.last_sign_in_at)
                                       order by u.last_sign_in_at desc nulls last), ''[]''::jsonb))
                    from %I.coaches c left join auth.users u on lower(u.email) = c.email and not coalesce(u.is_anonymous, false)', s)
      into v;
    j := j || v;

    if to_regclass(format('%I.players', s)) is not null then
      execute format('select jsonb_build_object(''players'', count(*) filter (where current)) from %I.players', s) into v;
      j := j || v;
    end if;

    -- parents' phones linked with a family code (counts only)
    if to_regclass(format('%I.parent_links', s)) is not null then
      execute format('select jsonb_build_object(''parent_phones'', count(distinct uid), ''children_linked'', count(distinct player_id),
                      ''parent_last_link'', max(linked)) from %I.parent_links', s) into v;
      j := j || v;
    end if;

    -- signed-in people per day (25_active_days.sql)
    if to_regclass(format('%I.active_days', s)) is not null then
      execute format('select jsonb_build_object(
          ''coaches7'', count(distinct uid) filter (where role = ''coach'' and day > $1 - 7),
          ''parents7'', count(distinct uid) filter (where role = ''parent'' and day > $1 - 7),
          ''coaches30'', count(distinct uid) filter (where role = ''coach'' and day > $1 - 30),
          ''parents30'', count(distinct uid) filter (where role = ''parent'' and day > $1 - 30),
          ''opens7'', coalesce(sum(opens) filter (where day > $1 - 7), 0),
          ''last_active'', max(day)) from %I.active_days', s) into v using today;
      j := j || v;
    end if;

    -- website visits (coach phones aren't counted)
    if to_regclass(format('%I.page_views', s)) is not null then
      execute format('select jsonb_build_object(
          ''views'', coalesce(sum(views), 0), ''visitors'', coalesce(sum(visitors), 0),
          ''views_today'', coalesce(sum(views) filter (where day = $1), 0), ''visitors_today'', coalesce(sum(visitors) filter (where day = $1), 0),
          ''views7'', coalesce(sum(views) filter (where day > $1 - 7), 0),
          ''visitors7'', coalesce(sum(visitors) filter (where day > $1 - 7), 0),
          ''views30'', coalesce(sum(views) filter (where day > $1 - 30), 0),
          ''visitors30'', coalesce(sum(visitors) filter (where day > $1 - 30), 0),
          ''views_since'', min(day), ''last_view'', max(day),
          ''days'', coalesce((select jsonb_agg(jsonb_build_object(''day'', d::date, ''views'', coalesce(p.views, 0), ''visitors'', coalesce(p.visitors, 0)) order by d)
                    from generate_series($1 - 29, $1, interval ''1 day'') d left join %I.page_views p on p.day = d::date), ''[]''::jsonb))
        from %I.page_views', s, s) into v using today;
      j := j || v;
    end if;

    -- games: logged = a score or who played was saved; reports written
    if to_regclass(format('%I.matches', s)) is not null then
      select exists (select 1 from information_schema.columns where table_schema = s and table_name = 'matches' and column_name = 'report')
        into has_report;
      execute format('select jsonb_build_object(
          ''games'', count(*), ''games_past'', count(*) filter (where date <= $1),
          ''games_logged'', count(*) filter (where us is not null or played <> ''{}''::jsonb),
          ''games_upcoming'', count(*) filter (where date > $1),
          ''last_logged'', max(date) filter (where us is not null or played <> ''{}''::jsonb),
          ''next_game'', min(date) filter (where date >= $1),
          ''match_edit'', max(updated), ''reports'', %s) from %I.matches',
          case when has_report then 'count(*) filter (where coalesce(report, '''') <> '''')' else '0' end, s)
        into v using today;
      j := j || v;
    end if;

    -- availability answers from parents (or coaches), counts only
    if to_regclass(format('%I.availability', s)) is not null then
      execute format('select jsonb_build_object(''avail'', count(*), ''avail7'', count(*) filter (where updated > now() - interval ''7 days''),
                      ''avail_last'', max(updated)) from %I.availability', s) into v;
      j := j || v;
    end if;
    if to_regclass(format('%I.training_availability', s)) is not null then
      execute format('select jsonb_build_object(''train_avail'', count(*), ''train_avail7'', count(*) filter (where updated > now() - interval ''7 days''))
                      from %I.training_availability', s) into v;
      j := j || v;
    end if;

    -- match alerts: phones signed up, and those an alert reached in the last 30 days
    if to_regclass(format('%I.push_subs', s)) is not null then
      execute format('select jsonb_build_object(''alert_phones'', count(*), ''alert_ok30'', count(*) filter (where last_ok > now() - interval ''30 days''),
                      ''alert_last_new'', max(created)) from %I.push_subs', s) into v;
      j := j || v;
    end if;

    if to_regclass(format('%I.cheers', s)) is not null then
      execute format('select jsonb_build_object(''cheers'', count(*), ''cheers7'', count(*) filter (where at > now() - interval ''7 days'')) from %I.cheers', s) into v;
      j := j || v;
    end if;
    if to_regclass(format('%I.match_photos', s)) is not null then
      execute format('select jsonb_build_object(''photos'', count(*)) from %I.match_photos', s) into v;
      j := j || v;
    end if;

    out := out || jsonb_build_array(j);
  end loop;
  return json_build_object('at', now(), 'today', today, 'sites', out);
end $$;
revoke execute on function public.tt_is_admin(), public.tt_overview() from public, anon;
grant execute on function public.tt_is_admin(), public.tt_overview() to authenticated;

-- ---------- sign-in: the owner may sign in even where they aren't a coach ----------
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
  if exists (select 1 from public.tt_admins where email = lower(new.email)) then return new; end if;
  raise exception 'Only club coaches can sign in';
end $$;
revoke execute on function public.only_coaches_can_sign_up() from public, anon, authenticated;
