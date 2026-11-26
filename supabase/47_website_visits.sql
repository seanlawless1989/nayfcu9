-- Visits to the Touchline Tales website itself (touchlinetales.club home, demo, guides, blog, pricing, about, privacy...),
-- shown to the owner on touchlinetales.club/admin/. [shared project only: not part of a team's own setup]
--
--   public.tt_web_hits     one row per page opened on the website: day, page, where the visitor came from
--   public.tt_log_web()    called by touchlinetales-sites assets/stats.js on every page (anyone, no sign-in)
--   public.tt_web_stats()  the owner page's numbers; only emails in public.tt_admins get anything back
--
-- Nothing is stored on the visitor's device and no IP address is kept. To count a person once a day, the IP address and
-- browser are scrambled with that day's date and a secret, and only that scrambled code is kept, which can't be turned
-- back into an IP address. Codes from different days don't match, so nobody can be followed from day to day.
-- Team and club sites are never counted here.
-- Safe to run more than once.

create table if not exists public.tt_web_salt (id int primary key default 1 check (id = 1), salt text not null);
insert into public.tt_web_salt (salt) values (encode(extensions.gen_random_bytes(24), 'hex')) on conflict do nothing;
alter table public.tt_web_salt enable row level security;   -- no policies: hidden
revoke all on public.tt_web_salt from anon, authenticated;

create table if not exists public.tt_web_hits (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  day     date not null default (now() at time zone 'Europe/London')::date,
  path    text not null,                 -- e.g. /, /demo/, /blog/what-is-grassroots-football/
  ref     text,                          -- our ?ref= tag (tiktok-bio, fb-group...) on the page people landed on
  source  text,                          -- the site that sent them (facebook.com, google.com...), host only
  event   text,                          -- set for a moment like signup-sent or demo-click instead of a page view
  visitor text not null                  -- scrambled code for this person today (see above)
);
create index if not exists tt_web_hits_day on public.tt_web_hits (day);
alter table public.tt_web_hits enable row level security;   -- no policies: only the functions below read or write it
revoke all on public.tt_web_hits from anon, authenticated;

create or replace function public.tt_log_web(p_path text, p_ref text default null, p_source text default null, p_event text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text := coalesce(h ->> 'cf-connecting-ip', split_part(h ->> 'x-forwarded-for', ',', 1), h ->> 'x-real-ip', '');
  d date := (now() at time zone 'Europe/London')::date;
  v text;
begin
  if p_path is null or p_path !~ '^/' then return; end if;
  -- a little protection from one phone filling the table: at most 300 rows a day per visitor
  v := encode(extensions.digest(d::text || '|' || trim(ip) || '|' || coalesce(h ->> 'user-agent', '') || '|' || (select salt from public.tt_web_salt), 'sha256'), 'hex');
  v := left(v, 32);
  if (select count(*) from public.tt_web_hits where day = d and visitor = v) >= 300 then return; end if;
  insert into public.tt_web_hits (day, path, ref, source, event, visitor)
  values (d, left(p_path, 200),
          nullif(left(regexp_replace(lower(coalesce(p_ref, '')), '[^a-z0-9_.-]', '', 'g'), 40), ''),
          nullif(left(regexp_replace(lower(coalesce(p_source, '')), '[^a-z0-9.-]', '', 'g'), 80), ''),
          nullif(left(regexp_replace(lower(coalesce(p_event, '')), '[^a-z0-9_-]', '', 'g'), 40), ''),
          v);
end $$;

create or replace function public.tt_web_stats() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  t date := (now() at time zone 'Europe/London')::date;
  r json;
begin
  if not public.tt_is_admin() then return null; end if;
  with pv as (select * from public.tt_web_hits where event is null),
       m as (select * from pv where day > t - 30)
  select json_build_object(
    'since', (select min(day) from public.tt_web_hits),
    'views_today', (select count(*) from pv where day = t),
    'visitors_today', (select count(distinct visitor) from pv where day = t),
    'views7', (select count(*) from pv where day > t - 7),
    'visitors7', (select count(distinct (day, visitor)) from pv where day > t - 7),
    'views30', (select count(*) from m),
    'visitors30', (select count(distinct (day, visitor)) from m),
    'views', (select count(*) from pv),
    'visitors', (select count(distinct (day, visitor)) from pv),
    'last_view', (select max(at) from pv),
    'days', (select coalesce(json_agg(x order by x.day), '[]') from (
        select g::date as day, count(m.id) as views, count(distinct m.visitor) as visitors
        from generate_series(t - 29, t, interval '1 day') g left join m on m.day = g::date group by g) x),
    'sources', (select coalesce(json_agg(x order by x.visitors desc, x.name), '[]') from (
        select name, count(distinct (day, visitor)) as visitors, count(*) as views from (
          select day, visitor, case when ref is not null then 'ref: ' || ref when source is not null then source else '(direct or unknown)' end as name
          from m) s group by name order by 2 desc limit 15) x),
    'pages', (select coalesce(json_agg(x order by x.views desc), '[]') from (
        select path, count(*) as views, count(distinct (day, visitor)) as visitors from m group by path order by 2 desc limit 12) x),
    'events', (select coalesce(json_agg(x order by x.count desc), '[]') from (
        select event as name, count(*) as count from public.tt_web_hits where event is not null and day > t - 30 group by event) x)
  ) into r;
  return r;
end $$;

revoke execute on function public.tt_log_web(text, text, text, text), public.tt_web_stats() from public;
grant execute on function public.tt_log_web(text, text, text, text) to anon, authenticated;
grant execute on function public.tt_web_stats() to authenticated;
