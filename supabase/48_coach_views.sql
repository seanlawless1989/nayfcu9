-- Added 2026-11-27: how coaches use the site. Visitor counts (page_views) leave coaches' phones out, so this counts them
-- separately: one row per coach per day per part of the site (home, fixtures, live match, data hub, tactics board...),
-- with how many times they opened it. Only the coach's user id, the day, the screen name and a count are kept.
-- Nobody can read the rows from a team site; only the Touchline Tales owner page reads the totals (tt_coach_views below).
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 48_coach_views.sql).
-- The site works before this is run: the log call just fails quietly.

create table if not exists public.coach_views(
  day   date not null default (now() at time zone 'Europe/London')::date,
  uid   uuid not null,
  area  text not null check (area ~ '^[a-z0-9_-]{1,24}$'),
  views int not null default 1,
  last  timestamptz not null default now(),
  primary key (day, uid, area));
alter table public.coach_views enable row level security;   -- no policies: only the functions touch it
revoke all on public.coach_views from anon, authenticated;

-- the site calls this each time a signed-in coach moves to another screen
create or replace function public.log_coach_view(p_area text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_area is null or p_area !~ '^[a-z0-9_-]{1,24}$' or not public.is_coach() then return; end if;
  insert into public.coach_views as c (day, uid, area) values ((now() at time zone 'Europe/London')::date, auth.uid(), p_area)
  on conflict (day, uid, area) do update set views = c.views + 1, last = now();
end $$;
revoke execute on function public.log_coach_view(text) from public, anon;
grant execute on function public.log_coach_view(text) to authenticated;

-- [project only]
-- Owner page (touchlinetales.club/admin/): coach screen views for every team data area in this project.
-- Needs 28_platform_admin.sql (tt_is_admin). Returns null for anyone not in public.tt_admins.
create or replace function public.tt_coach_views() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  s text; v jsonb; out jsonb := '[]'::jsonb;
  today date := (now() at time zone 'Europe/London')::date;
begin
  if not public.tt_is_admin() then return null; end if;
  for s in select schemaname from pg_tables where tablename = 'coach_views' and schemaname not in ('club') order by schemaname loop
    execute format($q$
      select jsonb_build_object(
        'schema', %1$L,
        'views', coalesce(sum(views), 0),
        'views_today', coalesce(sum(views) filter (where day = $1), 0),
        'views7', coalesce(sum(views) filter (where day > $1 - 7), 0),
        'views30', coalesce(sum(views) filter (where day > $1 - 30), 0),
        'coaches7', count(distinct uid) filter (where day > $1 - 7),
        'coaches30', count(distinct uid) filter (where day > $1 - 30),
        'since', min(day), 'last', max(last),
        'areas', coalesce((select jsonb_agg(jsonb_build_object('area', a.area, 'views', a.v, 'coaches', a.c, 'views7', a.v7) order by a.v desc)
            from (select area, sum(views) v, count(distinct uid) c, coalesce(sum(views) filter (where day > $1 - 7), 0) v7
                  from %1$I.coach_views where day > $1 - 30 group by area) a), '[]'::jsonb),
        'days', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'views', coalesce(x.v, 0), 'coaches', coalesce(x.c, 0)) order by d)
            from generate_series($1 - 13, $1, interval '1 day') d
            left join (select day, sum(views) v, count(distinct uid) c from %1$I.coach_views group by day) x on x.day = d::date), '[]'::jsonb),
        'coach_list', coalesce((select jsonb_agg(jsonb_build_object('email', c.email, 'last', c.last, 'views7', c.v7, 'views30', c.v30,
                                  'days30', c.d30, 'top', c.top) order by c.last desc)
            from (select cv.uid, max(u.email) email, max(cv.last) last,
                         coalesce(sum(cv.views) filter (where cv.day > $1 - 7), 0) v7,
                         coalesce(sum(cv.views) filter (where cv.day > $1 - 30), 0) v30,
                         count(distinct cv.day) filter (where cv.day > $1 - 30) d30,
                         (select jsonb_agg(t.area order by t.v desc) from (select x.area, sum(x.views) v from %1$I.coach_views x
                            where x.uid = cv.uid and x.day > $1 - 30 group by x.area order by v desc limit 3) t) top
                  from %1$I.coach_views cv left join auth.users u on u.id = cv.uid group by cv.uid) c), '[]'::jsonb))
      from %1$I.coach_views$q$, s) into v using today;
    out := out || jsonb_build_array(v);
  end loop;
  return json_build_object('at', now(), 'today', today, 'sites', out);
end $$;
revoke execute on function public.tt_coach_views() from public, anon;
grant execute on function public.tt_coach_views() to authenticated;
-- [end project only]
