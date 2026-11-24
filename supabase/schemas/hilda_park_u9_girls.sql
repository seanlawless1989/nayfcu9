-- Team schema hilda_park_u9_girls: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists hilda_park_u9_girls;
grant usage on schema hilda_park_u9_girls to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on functions to anon, authenticated, service_role;

-- ===================== 1_schema.sql =====================
-- Newton Aycliffe U9s: database setup. Paste into Supabase > SQL Editor and click Run.

create table if not exists hilda_park_u9_girls.players (
  id      text primary key,
  name    text not null,
  num     integer,
  current boolean not null default true
);

create table if not exists hilda_park_u9_girls.matches (
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
create table if not exists hilda_park_u9_girls.coaches (
  email text primary key
);

alter table hilda_park_u9_girls.players enable row level security;
alter table hilda_park_u9_girls.matches enable row level security;
alter table hilda_park_u9_girls.coaches enable row level security;

create or replace function hilda_park_u9_girls.is_coach() returns boolean
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select exists (select 1 from hilda_park_u9_girls.coaches where email = lower(auth.jwt() ->> 'email'));
$$;

-- Everyone (including parents who aren't signed in) can read results and the squad.
-- To make the site coaches-only, change "to anon, authenticated using (true)" to "to authenticated using (hilda_park_u9_girls.is_coach())".
drop policy if exists "read players" on hilda_park_u9_girls.players;
create policy "read players" on hilda_park_u9_girls.players for select to anon, authenticated using (true);
drop policy if exists "read matches" on hilda_park_u9_girls.matches;
create policy "read matches" on hilda_park_u9_girls.matches for select to anon, authenticated using (true);

-- Only coaches can change anything.
drop policy if exists "coaches write players" on hilda_park_u9_girls.players;
create policy "coaches write players" on hilda_park_u9_girls.players for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches write matches" on hilda_park_u9_girls.matches;
create policy "coaches write matches" on hilda_park_u9_girls.matches for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());

-- A signed-in coach can see their own row (the site uses this to show the coach tools).
drop policy if exists "see own coach row" on hilda_park_u9_girls.coaches;
create policy "see own coach row" on hilda_park_u9_girls.coaches for select to authenticated using (email = lower(auth.jwt() ->> 'email'));

-- >>> Change this to your email, then run. Add a line per coach.

-- Only emails on the coaches list can create a sign-in account.

-- Added 2026-10: assists per player, e.g. {"Lydia": 1}. Safe to re-run on an existing database.
alter table hilda_park_u9_girls.matches add column if not exists assists jsonb not null default '{}'::jsonb;
alter table hilda_park_u9_girls.matches add column if not exists postponed boolean not null default false;

-- Added 2026-10: tournaments (games link to one via matches.tournament_id) and an honours board.
alter table hilda_park_u9_girls.matches add column if not exists tournament_id text;
alter table hilda_park_u9_girls.matches add column if not exists stage text default '';   -- Group stage, Semi final, Final...
create table if not exists hilda_park_u9_girls.tournaments(
  id text primary key, name text not null default '', date date, venue text default '',
  potm text,                    -- player of the tournament
  trophy text default '',       -- Winners, Runners-up, ... blank = none
  notes text default '', updated timestamptz not null default now());
create table if not exists hilda_park_u9_girls.honours(
  id text primary key, date date, title text not null default '', achievement text default '', notes text default '', updated timestamptz not null default now());
-- Added 2026-10-19: tournaments can run over 2 or 3 days (end_date is blank for a one-day tournament).
alter table hilda_park_u9_girls.tournaments add column if not exists end_date date;
alter table hilda_park_u9_girls.tournaments drop constraint if exists tournaments_end_after_start;
alter table hilda_park_u9_girls.tournaments add constraint tournaments_end_after_start check (end_date is null or end_date >= date);
-- Added 2026-10-26: the teams entered and their groups ("" = groups not drawn yet), see 14_tournament_teams.sql.
alter table hilda_park_u9_girls.tournaments add column if not exists teams jsonb not null default '[]'::jsonb;
-- Added 2026-10-31: the squad picked for the whole tournament, see 15_tournament_squad.sql.
alter table hilda_park_u9_girls.tournaments add column if not exists squad jsonb;
-- Added 2026-11-01: one report for the whole tournament, see 23_tournament_report.sql.
alter table hilda_park_u9_girls.tournaments add column if not exists report text;
-- Added 2026-11-08: details for parents (meet time, kit, what to bring...), see 35_tournament_details.sql.
alter table hilda_park_u9_girls.tournaments add column if not exists matchday jsonb;
alter table hilda_park_u9_girls.tournaments enable row level security;
alter table hilda_park_u9_girls.honours enable row level security;
drop policy if exists "read tournaments" on hilda_park_u9_girls.tournaments;
create policy "read tournaments" on hilda_park_u9_girls.tournaments for select to anon, authenticated using (true);
drop policy if exists "coaches write tournaments" on hilda_park_u9_girls.tournaments;
create policy "coaches write tournaments" on hilda_park_u9_girls.tournaments for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
drop policy if exists "read honours" on hilda_park_u9_girls.honours;
create policy "read honours" on hilda_park_u9_girls.honours for select to anon, authenticated using (true);
drop policy if exists "coaches write honours" on hilda_park_u9_girls.honours;
create policy "coaches write honours" on hilda_park_u9_girls.honours for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.tournaments, hilda_park_u9_girls.honours to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.tournaments, hilda_park_u9_girls.honours to authenticated;

-- ---------- Oct 2026: playing time, keepers, availability ----------
alter table hilda_park_u9_girls.matches add column if not exists quarters jsonb default '{}'::jsonb;
alter table hilda_park_u9_girls.matches add column if not exists gk text;
alter table hilda_park_u9_girls.matches add column if not exists saves integer;

create table if not exists hilda_park_u9_girls.availability(
  match_id text not null,
  player text not null,
  status text not null check (status in ('yes','no','maybe')),
  updated timestamptz default now(),
  primary key(match_id, player)
);
alter table hilda_park_u9_girls.availability enable row level security;
-- Only coaches can see answers; parents answer through set_availability below.
drop policy if exists "coaches read availability" on hilda_park_u9_girls.availability;
create policy "coaches read availability" on hilda_park_u9_girls.availability for select using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches write availability" on hilda_park_u9_girls.availability;
create policy "coaches write availability" on hilda_park_u9_girls.availability for all using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());

create or replace function hilda_park_u9_girls.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated) values (p_match, p_player, p_status, now())
  on conflict (match_id, player) do update set status = excluded.status, updated = now();
end $$;
grant execute on function hilda_park_u9_girls.set_availability(text,text,text) to anon, authenticated;

-- Keepers per game (more than one allowed): {"Name": 1 = clean sheet, 0 = conceded}
alter table hilda_park_u9_girls.matches add column if not exists keepers jsonb default '{}'::jsonb;

-- Halves played per player {"Name": 0-2} (replaces the unused quarters column), and the squad picked before a fixture
alter table hilda_park_u9_girls.matches add column if not exists halves jsonb default '{}'::jsonb;
alter table hilda_park_u9_girls.matches add column if not exists squad jsonb;

-- Live match state, public so parents can follow: {status, half, halfStart, halfLen, form, slots, squad, events, mins}
alter table hilda_park_u9_girls.matches add column if not exists live jsonb;

-- Opposition badges, shared across the site (small PNG data URLs), public read, coach write
create table if not exists hilda_park_u9_girls.badges(key text primary key, name text, img text not null, updated timestamptz default now());
alter table hilda_park_u9_girls.badges enable row level security;
drop policy if exists "public read badges" on hilda_park_u9_girls.badges;
create policy "public read badges" on hilda_park_u9_girls.badges for select using (true);
drop policy if exists "coaches write badges" on hilda_park_u9_girls.badges;
create policy "coaches write badges" on hilda_park_u9_girls.badges for all using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());

-- Player photos: coaches only (never public)
create table if not exists hilda_park_u9_girls.player_photos(player text primary key, img text not null, updated timestamptz default now());
alter table hilda_park_u9_girls.player_photos enable row level security;
-- 2026-10-17: Sean asked for photos to be visible to everyone (they were coach-only); only coaches can add or change them.
drop policy if exists "everyone reads photos" on hilda_park_u9_girls.player_photos;
create policy "everyone reads photos" on hilda_park_u9_girls.player_photos for select using (true);
grant select on hilda_park_u9_girls.player_photos to anon;
drop policy if exists "coaches write photos" on hilda_park_u9_girls.player_photos;
create policy "coaches write photos" on hilda_park_u9_girls.player_photos for all using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select, insert, update, delete on hilda_park_u9_girls.player_photos to authenticated;

-- Website visits: one row per day (UK time), counts only, nothing about who visited.
-- views = times the site was opened; visitors = phones/computers that opened it that day (the site remembers "seen today" in the browser).
create table if not exists hilda_park_u9_girls.page_views(day date primary key, views int not null default 0, visitors int not null default 0);
alter table hilda_park_u9_girls.page_views enable row level security;
drop policy if exists "coaches read page views" on hilda_park_u9_girls.page_views;
create policy "coaches read page views" on hilda_park_u9_girls.page_views for select to authenticated using (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.page_views to authenticated;

create or replace function hilda_park_u9_girls.log_view(p_new boolean)
returns void language sql security definer set search_path = hilda_park_u9_girls as $$
  insert into page_views(day, views, visitors) values ((now() at time zone 'Europe/London')::date, 1, case when p_new then 1 else 0 end)
  on conflict (day) do update set views = page_views.views + 1, visitors = page_views.visitors + case when p_new then 1 else 0 end;
$$;
revoke execute on function hilda_park_u9_girls.log_view(boolean) from public;
grant execute on function hilda_park_u9_girls.log_view(boolean) to anon, authenticated;

-- Added 2026-10-17: match report written by a coach on the match page (public, unlike notes).
alter table hilda_park_u9_girls.matches add column if not exists report text;

-- Added 2026-10-19: match preview written by a coach before the game (public).
alter table hilda_park_u9_girls.matches add column if not exists preview text;

-- ===================== 3_notifications.sql =====================
-- Newton Aycliffe U9s: match alerts (phone notifications). Safe to re-run.
-- Families turn alerts on from the site. Each phone's push address is stored here; nothing about
-- the family or the child is stored. The "notify" edge function (supabase/functions/notify) sends them.

create table if not exists hilda_park_u9_girls.push_subs (
  endpoint   text primary key,            -- the phone's push address, issued by Google/Apple/Mozilla
  p256dh     text not null,
  auth       text not null,
  reminders  boolean not null default true,   -- kick-off reminders
  live       boolean not null default true,   -- kick-off, goals, half time, full time
  created    timestamptz not null default now(),
  last_ok    timestamptz
);
alter table hilda_park_u9_girls.push_subs enable row level security;   -- no policies: only the edge function can read it

-- What has already been sent for each match, so nobody gets the same alert twice.
create table if not exists hilda_park_u9_girls.push_log (
  match_id  text primary key,
  last_at   bigint not null default 0,    -- "at" (ms) of the newest live event already sent
  reminded  boolean not null default false
);
alter table hilda_park_u9_girls.push_log enable row level security;

-- The match-alerts key pair. The public half is also in docs/config.js; the private half must never leave the database.
-- Fill it in once with a fresh pair (npx web-push generate-vapid-keys); left empty here on purpose.
create table if not exists hilda_park_u9_girls.push_keys (
  id          int primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null
);
alter table hilda_park_u9_girls.push_keys enable row level security;   -- no policies: only the edge function can read it
revoke all on hilda_park_u9_girls.push_keys from anon, authenticated;

-- Parents (not signed in) turn alerts on and off through these two functions.
create or replace function hilda_park_u9_girls.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare host text := substring(p_endpoint from '^https://([^/:]+)/');
begin
  if host is null or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100
     or not (host = 'fcm.googleapis.com' or host like '%.push.services.mozilla.com' or host = 'web.push.apple.com'
             or host like '%.push.apple.com' or host like '%.notify.windows.com') then
    raise exception 'Not a push address';
  end if;
  insert into hilda_park_u9_girls.push_subs (endpoint, p256dh, auth, reminders, live)
  values (p_endpoint, p_p256dh, p_auth, coalesce(p_reminders, true), coalesce(p_live, true))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    reminders = excluded.reminders, live = excluded.live;
end $$;

create or replace function hilda_park_u9_girls.push_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path = hilda_park_u9_girls as $$
  delete from hilda_park_u9_girls.push_subs where endpoint = p_endpoint;
$$;

revoke all on function hilda_park_u9_girls.push_subscribe(text, text, text, boolean, boolean) from public;
revoke all on function hilda_park_u9_girls.push_unsubscribe(text) from public;
grant execute on function hilda_park_u9_girls.push_subscribe(text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function hilda_park_u9_girls.push_unsubscribe(text) to anon, authenticated;

-- Used by the edge function to claim a batch of live events before sending, so two calls
-- at the same moment can't both send the same goal.
create or replace function hilda_park_u9_girls.push_claim_events(p_match text, p_from bigint, p_to bigint)
returns boolean language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  insert into hilda_park_u9_girls.push_log (match_id, last_at) values (p_match, 0) on conflict do nothing;
  update hilda_park_u9_girls.push_log set last_at = p_to where match_id = p_match and last_at = p_from;
  return found;
end $$;

-- Kick-off reminders go at 10 and 2 minutes before; reminders_sent records which have gone for each match.
alter table hilda_park_u9_girls.push_log add column if not exists reminders_sent int[] not null default '{}';
drop function if exists hilda_park_u9_girls.push_claim_reminder(text);
create or replace function hilda_park_u9_girls.push_claim_reminder(p_match text, p_mins int)
returns boolean language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  insert into hilda_park_u9_girls.push_log (match_id) values (p_match) on conflict do nothing;
  update hilda_park_u9_girls.push_log set reminders_sent = reminders_sent || p_mins
    where match_id = p_match and not (p_mins = any(reminders_sent));
  return found;
end $$;
revoke all on function hilda_park_u9_girls.push_claim_events(text, bigint, bigint) from public, anon, authenticated;
-- Squad and player-of-the-match alerts: what was last sent for each match, so a re-save only alerts when it changed.
alter table hilda_park_u9_girls.push_log add column if not exists squad_sent jsonb;
alter table hilda_park_u9_girls.push_log add column if not exists potm_sent text;
-- 0 = already sent as it is, 1 = first time, 2 = changed since it was sent
create or replace function hilda_park_u9_girls.push_claim_squad(p_match text, p_squad jsonb)
returns int language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare prev jsonb;
begin
  insert into hilda_park_u9_girls.push_log (match_id) values (p_match) on conflict do nothing;
  select squad_sent into prev from hilda_park_u9_girls.push_log where match_id = p_match for update;
  if prev is not distinct from p_squad then return 0; end if;
  update hilda_park_u9_girls.push_log set squad_sent = p_squad where match_id = p_match;
  return case when prev is null then 1 else 2 end;
end $$;
create or replace function hilda_park_u9_girls.push_claim_potm(p_match text, p_potm text)
returns boolean language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  insert into hilda_park_u9_girls.push_log (match_id) values (p_match) on conflict do nothing;
  update hilda_park_u9_girls.push_log set potm_sent = p_potm where match_id = p_match and potm_sent is distinct from p_potm;
  return found;
end $$;
revoke all on function hilda_park_u9_girls.push_claim_squad(text, jsonb) from public, anon, authenticated;
revoke all on function hilda_park_u9_girls.push_claim_potm(text, text) from public, anon, authenticated;

revoke all on function hilda_park_u9_girls.push_claim_reminder(text, int) from public, anon, authenticated;


-- ===================== 4_gallery_training.sql =====================
-- Added 2026-10-17: photo gallery, training info and the calendar feed. Safe to re-run.

-- ---------- Photo gallery ----------
-- Coaches upload match-day photos against a game; everyone can see them (parents' photo consent confirmed 17 Oct 2026).
-- The files live in the public "gallery" storage bucket: <match id>/<photo id>.jpg plus a small <photo id>_t.jpg thumbnail.
-- The site re-draws every photo before upload, which also strips location data from phone pictures.
create table if not exists hilda_park_u9_girls.match_photos(
  id       uuid primary key default gen_random_uuid(),
  match_id text not null,            -- matches.id (no foreign key, so live-match saves never wait on it)
  path     text not null,            -- full size, in the gallery bucket
  thumb    text not null,            -- thumbnail, in the gallery bucket
  caption  text default '',
  w int, h int,
  created  timestamptz not null default now()
);
create index if not exists match_photos_match on hilda_park_u9_girls.match_photos(match_id);
alter table hilda_park_u9_girls.match_photos enable row level security;
drop policy if exists "everyone reads match photos" on hilda_park_u9_girls.match_photos;
create policy "everyone reads match photos" on hilda_park_u9_girls.match_photos for select using (true);
drop policy if exists "coaches write match photos" on hilda_park_u9_girls.match_photos;
create policy "coaches write match photos" on hilda_park_u9_girls.match_photos for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.match_photos to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.match_photos to authenticated;
revoke insert, update, delete, truncate on hilda_park_u9_girls.match_photos from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hilda_park_u9_girls-gallery', 'hilda_park_u9_girls-gallery', true, 5242880, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];
drop policy if exists "hilda_park_u9_girls coaches upload gallery" on storage.objects;
create policy "hilda_park_u9_girls coaches upload gallery" on storage.objects for insert to authenticated with check (bucket_id = 'hilda_park_u9_girls-gallery' and hilda_park_u9_girls.is_coach());
drop policy if exists "hilda_park_u9_girls coaches see gallery" on storage.objects;
create policy "hilda_park_u9_girls coaches see gallery" on storage.objects for select to authenticated using (bucket_id = 'hilda_park_u9_girls-gallery' and hilda_park_u9_girls.is_coach());
drop policy if exists "hilda_park_u9_girls coaches delete gallery" on storage.objects;
create policy "hilda_park_u9_girls coaches delete gallery" on storage.objects for delete to authenticated using (bucket_id = 'hilda_park_u9_girls-gallery' and hilda_park_u9_girls.is_coach());

-- ---------- Training ----------
-- One row, shown on the Training page and added to the calendar feed every week until "until".
create table if not exists hilda_park_u9_girls.training(
  id      int primary key default 1 check (id = 1),
  day     text not null default 'Wednesday',
  start   text not null default '18:00',
  finish  text not null default '19:00',
  venue   text default '',
  kit     text default '',
  notes   text default '',
  until   date,                      -- last session in this pattern (blank = no end)
  off     date[] not null default '{}', -- weeks with no training
  updated timestamptz not null default now()
);
alter table hilda_park_u9_girls.training enable row level security;
drop policy if exists "everyone reads training" on hilda_park_u9_girls.training;
create policy "everyone reads training" on hilda_park_u9_girls.training for select using (true);
drop policy if exists "coaches write training" on hilda_park_u9_girls.training;
create policy "coaches write training" on hilda_park_u9_girls.training for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.training to anon, authenticated;
grant insert, update on hilda_park_u9_girls.training to authenticated;
revoke insert, update, delete, truncate on hilda_park_u9_girls.training from anon;

insert into hilda_park_u9_girls.training (id) values (1) on conflict (id) do nothing;   -- coaches fill this in on the Training page

-- ---------- Calendar feed ----------
-- The "calendar" edge function (supabase/functions/calendar) reads matches, tournaments and training with the
-- public key and serves them as an .ics feed that phones subscribe to. It runs with verify_jwt off because
-- calendar apps can't send a key; it only reads data that is already hilda_park_u9_girls.

-- ===================== 5_help_requests.sql =====================
-- Added 2026-10-17: "Help and changes" requests from coaches. Safe to re-run.
-- Coaches send a request from the site's Help page. A scheduled Claude task reads new rows,
-- makes small data fixes itself, opens a pull request for code changes, and writes the answer
-- back into "reply" so the coach sees it on the same page. Big, unclear or destructive asks wait for Sean.
create table if not exists hilda_park_u9_girls.help_requests(
  id         uuid primary key default gen_random_uuid(),
  created    timestamptz not null default now(),
  email      text not null default lower(auth.jwt() ->> 'email'),   -- the coach who sent it
  kind       text not null default 'change' check (kind in ('fix','change','question','problem')),
  body       text not null check (length(body) between 3 and 4000),
  page       text default '',          -- which part of the site they were on
  screenshot text,                     -- optional small JPEG data URL (the site shrinks it first)
  status     text not null default 'new' check (status in ('new','working','waiting','done','declined')),
  reply      text default '',          -- Claude's or Sean's answer, shown to coaches
  link       text default '',          -- pull request or page to look at, if any
  updated    timestamptz not null default now()
);
create index if not exists help_requests_status on hilda_park_u9_girls.help_requests(status, created);
alter table hilda_park_u9_girls.help_requests enable row level security;

-- Coaches see every request (they run the team together) and can add their own.
-- Only the database owner (the scheduled task, or Sean in the dashboard) changes status and replies.
drop policy if exists "coaches read help" on hilda_park_u9_girls.help_requests;
create policy "coaches read help" on hilda_park_u9_girls.help_requests for select to authenticated using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches add help" on hilda_park_u9_girls.help_requests;
create policy "coaches add help" on hilda_park_u9_girls.help_requests for insert to authenticated
  with check (hilda_park_u9_girls.is_coach() and email = lower(auth.jwt() ->> 'email') and status = 'new' and coalesce(reply,'') = '' and coalesce(link,'') = '');
revoke all on hilda_park_u9_girls.help_requests from anon;
grant select, insert on hilda_park_u9_girls.help_requests to authenticated;
revoke update, delete, truncate on hilda_park_u9_girls.help_requests from authenticated;

-- ===================== 6_match_updated.sql =====================
-- Keep matches.updated current on every change, so the calendar feed (supabase/functions/calendar) can tell
-- phones which games changed (LAST-MODIFIED and SEQUENCE). Before this, "updated" stayed at the insert time.
create or replace function hilda_park_u9_girls.touch_updated() returns trigger language plpgsql set search_path = '' as $$
begin new.updated := now(); return new; end $$;

drop trigger if exists matches_touch_updated on hilda_park_u9_girls.matches;
create trigger matches_touch_updated before update on hilda_park_u9_girls.matches
  for each row when (old.* is distinct from new.*) execute function hilda_park_u9_girls.touch_updated();

-- ===================== 7_team_setup.sql =====================
-- Added 2026-10-19: Team setup, filled in by a coach on the site instead of editing team.js. Safe to re-run.
-- The site reads team_settings on load and lays it over docs/team.js, so a coach's answers show straight away.
-- A new team's row starts with ready = false: visitors see "being set up" until a coach finishes setup,
-- including the welfare officer's sign-off. With no row at all (Newton Aycliffe), the site just uses team.js.

-- ---------- What the site looks like ----------
create table if not exists hilda_park_u9_girls.team_settings(
  id         int primary key default 1 check (id = 1),
  settings   jsonb not null default '{}'::jsonb,   -- same shape as TEAM in team.js (name, colours, crest as a data URL, kits...)
  ready      boolean not null default false,       -- false: only coaches see the site
  updated    timestamptz not null default now(),
  updated_by text default ''
);
alter table hilda_park_u9_girls.team_settings enable row level security;
drop policy if exists "everyone reads team settings" on hilda_park_u9_girls.team_settings;
create policy "everyone reads team settings" on hilda_park_u9_girls.team_settings for select using (true);
drop policy if exists "coaches write team settings" on hilda_park_u9_girls.team_settings;
create policy "coaches write team settings" on hilda_park_u9_girls.team_settings for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.team_settings to anon, authenticated;
grant insert, update on hilda_park_u9_girls.team_settings to authenticated;
revoke insert, update, delete, truncate on hilda_park_u9_girls.team_settings from anon;

-- ---------- Welfare sign-off and terms (coaches only, never public) ----------
create table if not exists hilda_park_u9_girls.team_signoff(
  id               int primary key default 1 check (id = 1),
  welfare_name     text not null default '',
  welfare_email    text not null default '',
  public_scores    boolean not null default false,
  welfare_agreed   boolean not null default false,   -- the welfare officer has read how children's details are handled and agreed
  terms_agreed     boolean not null default false,
  dpa_agreed       boolean not null default false,   -- data processing agreement: the club is the controller
  agreed_by        text not null default '',          -- name and role of the person agreeing for the club
  coach_email      text not null default lower(auth.jwt() ->> 'email'),
  agreed_at        timestamptz not null default now()
);
alter table hilda_park_u9_girls.team_signoff enable row level security;
drop policy if exists "coaches read signoff" on hilda_park_u9_girls.team_signoff;
create policy "coaches read signoff" on hilda_park_u9_girls.team_signoff for select to authenticated using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches write signoff" on hilda_park_u9_girls.team_signoff;
create policy "coaches write signoff" on hilda_park_u9_girls.team_signoff for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke all on hilda_park_u9_girls.team_signoff from anon;
grant select, insert, update on hilda_park_u9_girls.team_signoff to authenticated;

-- ---------- Coaches can manage the coach list from the site ----------
create or replace function hilda_park_u9_girls.list_coaches() returns setof text
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select email from hilda_park_u9_girls.coaches where hilda_park_u9_girls.is_coach() order by email;
$$;
create or replace function hilda_park_u9_girls.add_coach(new_email text) returns void
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can add coaches'; end if;
  if coalesce(new_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email address'; end if;
  insert into hilda_park_u9_girls.coaches (email) values (lower(trim(new_email))) on conflict do nothing;
end $$;
create or replace function hilda_park_u9_girls.remove_coach(old_email text) returns void
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can remove coaches'; end if;
  if lower(old_email) = lower(auth.jwt() ->> 'email') then raise exception 'You can''t remove yourself'; end if;
  delete from hilda_park_u9_girls.coaches where email = lower(old_email);
end $$;
revoke execute on function hilda_park_u9_girls.list_coaches(), hilda_park_u9_girls.add_coach(text), hilda_park_u9_girls.remove_coach(text) from public, anon;
grant execute on function hilda_park_u9_girls.list_coaches(), hilda_park_u9_girls.add_coach(text), hilda_park_u9_girls.remove_coach(text) to authenticated;

insert into hilda_park_u9_girls.team_settings (id, ready) values (1, false) on conflict (id) do nothing;

-- ===================== 8_multi_day_tournaments.sql =====================
-- Tournaments that run over 2 or 3 days. A tournament runs from "date" (the first day) to "end_date" (the last
-- day); end_date stays blank for a one-day tournament. Each game keeps its own date, which falls on one of the days.
-- The calendar feed (supabase/functions/calendar) reads end_date, so run this before deploying that function.
alter table hilda_park_u9_girls.tournaments add column if not exists end_date date;
alter table hilda_park_u9_girls.tournaments drop constraint if exists tournaments_end_after_start;
alter table hilda_park_u9_girls.tournaments add constraint tournaments_end_after_start check (end_date is null or end_date >= date);

-- ===================== 9_matchday_and_more.sql =====================
-- Added 2026-10-19: matchday details, postponement alerts, alert choices, training attendance and parent votes.
-- Safe to re-run. Run it once on every team's database (SQL editor), then redeploy the notify edge function.

-- ---------- Matchday details on each fixture ----------
-- {"meet": "09:45", "kit": "home" (a key of TEAM.kits) or "Training kit", "pitch": "3", "postcode": "DL1 4PZ"}
-- The postcode is only used on the parent's phone for directions and the kick-off weather forecast.
alter table hilda_park_u9_girls.matches add column if not exists matchday jsonb;

-- ---------- "Postponed" alert, sent once when a coach marks an upcoming game postponed ----------
alter table hilda_park_u9_girls.push_log add column if not exists postponed_sent boolean not null default false;
create or replace function hilda_park_u9_girls.push_claim_postponed(p_match text, p_postponed boolean)
returns boolean language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  insert into hilda_park_u9_girls.push_log (match_id) values (p_match) on conflict do nothing;
  if not p_postponed then  -- back on: a later postponement can alert again
    update hilda_park_u9_girls.push_log set postponed_sent = false where match_id = p_match; return false;
  end if;
  update hilda_park_u9_girls.push_log set postponed_sent = true where match_id = p_match and not postponed_sent;
  return found;
end $$;
revoke all on function hilda_park_u9_girls.push_claim_postponed(text, boolean) from public, anon, authenticated;

-- ---------- Alert choices per phone ----------
-- reminders (squad, kick-off, postponed) and live (everything on match day) were already there.
-- goals: just the goals. results: full time and player of the match. "live" still covers both.
alter table hilda_park_u9_girls.push_subs add column if not exists goals boolean not null default false;
alter table hilda_park_u9_girls.push_subs add column if not exists results boolean not null default false;
create or replace function hilda_park_u9_girls.push_subscribe2(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean, p_goals boolean, p_results boolean)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  perform hilda_park_u9_girls.push_subscribe(p_endpoint, p_p256dh, p_auth, p_reminders, p_live);  -- checks it's a real push address
  update hilda_park_u9_girls.push_subs set goals = coalesce(p_goals, false), results = coalesce(p_results, false) where endpoint = p_endpoint;
end $$;
revoke all on function hilda_park_u9_girls.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean) from public;
grant execute on function hilda_park_u9_girls.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean) to anon, authenticated;

-- ---------- Training attendance (coaches only) ----------
-- One row per player who came to a session. Shown to coaches next to playing time, never to parents.
create table if not exists hilda_park_u9_girls.training_attendance(
  day     date not null,
  player  text not null,
  updated timestamptz not null default now(),
  primary key(day, player)
);
alter table hilda_park_u9_girls.training_attendance enable row level security;
drop policy if exists "coaches read attendance" on hilda_park_u9_girls.training_attendance;
create policy "coaches read attendance" on hilda_park_u9_girls.training_attendance for select to authenticated using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches write attendance" on hilda_park_u9_girls.training_attendance;
create policy "coaches write attendance" on hilda_park_u9_girls.training_attendance for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select, insert, update, delete on hilda_park_u9_girls.training_attendance to authenticated;
revoke all on hilda_park_u9_girls.training_attendance from anon;

-- ---------- Parent votes: goal of the month, players' player of the season ----------
-- Coaches open a vote with a list of choices (first names only). Each phone gets one vote, using a random id kept
-- on that phone; nothing about the parent is stored. Totals are shown to coaches, and to everyone once the vote closes.
create table if not exists hilda_park_u9_girls.polls(
  id       text primary key,
  kind     text not null default 'other',        -- gotm, potss or other
  title    text not null,
  options  jsonb not null default '[]'::jsonb,   -- ["Jack v Meadow Park (23')", ...]
  closes   timestamptz,                           -- voting stops then (blank = until a coach closes it)
  closed   boolean not null default false,
  created  timestamptz not null default now()
);
alter table hilda_park_u9_girls.polls enable row level security;
drop policy if exists "everyone reads polls" on hilda_park_u9_girls.polls;
create policy "everyone reads polls" on hilda_park_u9_girls.polls for select using (true);
drop policy if exists "coaches write polls" on hilda_park_u9_girls.polls;
create policy "coaches write polls" on hilda_park_u9_girls.polls for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.polls to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.polls to authenticated;

create table if not exists hilda_park_u9_girls.poll_votes(
  poll_id text not null,
  voter   text not null,      -- a random id made on the phone
  choice  int  not null,
  updated timestamptz not null default now(),
  primary key(poll_id, voter)
);
alter table hilda_park_u9_girls.poll_votes enable row level security;   -- no policies: votes only go in through cast_vote
revoke all on hilda_park_u9_girls.poll_votes from anon, authenticated;

create or replace function hilda_park_u9_girls.cast_vote(p_poll text, p_voter text, p_choice int)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare p hilda_park_u9_girls.polls;
begin
  select * into p from hilda_park_u9_girls.polls where id = p_poll;
  if p.id is null or p.closed or (p.closes is not null and p.closes < now()) then raise exception 'This vote has closed'; end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(p.options) then raise exception 'bad choice'; end if;
  if length(p_voter) < 16 or length(p_voter) > 64 then raise exception 'bad voter'; end if;
  insert into hilda_park_u9_girls.poll_votes(poll_id, voter, choice) values (p_poll, p_voter, p_choice)
  on conflict (poll_id, voter) do update set choice = excluded.choice, updated = now();
end $$;
grant execute on function hilda_park_u9_girls.cast_vote(text, text, int) to anon, authenticated;

-- totals per choice: coaches any time, everyone else once the vote has closed
create or replace function hilda_park_u9_girls.poll_totals(p_poll text)
returns table(choice int, votes bigint) language sql security definer set search_path = hilda_park_u9_girls as $$
  select v.choice, count(*) from hilda_park_u9_girls.poll_votes v join hilda_park_u9_girls.polls p on p.id = v.poll_id
  where v.poll_id = p_poll and (hilda_park_u9_girls.is_coach() or p.closed or (p.closes is not null and p.closes < now()))
  group by v.choice;
$$;
grant execute on function hilda_park_u9_girls.poll_totals(text) to anon, authenticated;

-- ---------- Sponsor report (coaches only) ----------
-- One row each time a coach saves or copies a matchday graphic, with the sponsors drawn on it.
-- Put next to website visits (page_views) it shows a sponsor how often they were seen.
create table if not exists hilda_park_u9_girls.post_log(
  id       bigint generated always as identity primary key,
  day      date not null default (now() at time zone 'Europe/London')::date,
  kind     text not null,                         -- squad, ft, potm, month, ms
  sponsors text[] not null default '{}',
  created  timestamptz not null default now()
);
alter table hilda_park_u9_girls.post_log enable row level security;
drop policy if exists "coaches read post log" on hilda_park_u9_girls.post_log;
create policy "coaches read post log" on hilda_park_u9_girls.post_log for select to authenticated using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches add to post log" on hilda_park_u9_girls.post_log;
create policy "coaches add to post log" on hilda_park_u9_girls.post_log for insert to authenticated with check (hilda_park_u9_girls.is_coach());
grant select, insert on hilda_park_u9_girls.post_log to authenticated;
revoke all on hilda_park_u9_girls.post_log from anon;

-- ===================== 10_parent_login.sql =====================
-- Added 2026-10-21: parent login with family codes. Safe to re-run.
-- Each player gets a private family code from the coach. A parent types it once on the site's Parents page; the
-- phone gets an anonymous Supabase sign-in (no email, no name) linked to that child. Signed-in parents answer
-- availability for their own children only, and each family gets one vote. Nothing about the parent is stored.
-- Also tick Authentication > Sign In / Providers > "Allow anonymous sign-ins" in the Supabase dashboard.

-- ---------- Anonymous sign-ins are allowed; email sign-ins are still coaches only ----------

-- ---------- Team switch: once codes are handed out, a coach turns "parents must sign in" on ----------
create table if not exists hilda_park_u9_girls.parent_settings(
  id       int primary key default 1 check (id = 1),
  required boolean not null default false   -- true: availability and votes need a family code
);
insert into hilda_park_u9_girls.parent_settings (id) values (1) on conflict do nothing;
alter table hilda_park_u9_girls.parent_settings enable row level security;
drop policy if exists "everyone reads parent settings" on hilda_park_u9_girls.parent_settings;
create policy "everyone reads parent settings" on hilda_park_u9_girls.parent_settings for select using (true);
drop policy if exists "coaches change parent settings" on hilda_park_u9_girls.parent_settings;
create policy "coaches change parent settings" on hilda_park_u9_girls.parent_settings for update to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.parent_settings to anon, authenticated;
grant update on hilda_park_u9_girls.parent_settings to authenticated;

-- ---------- One family code per player (coaches only) ----------
create table if not exists hilda_park_u9_girls.family_codes(
  player_id text primary key references hilda_park_u9_girls.players(id) on delete cascade,
  code      text not null unique,   -- six letters and numbers, e.g. 7K3M9Q, shown as 7K3-M9Q
  created   timestamptz not null default now()
);
alter table hilda_park_u9_girls.family_codes enable row level security;   -- no policies: coaches use family_overview()
revoke all on hilda_park_u9_girls.family_codes from anon, authenticated;

-- ---------- Which phone belongs to which child ----------
create table if not exists hilda_park_u9_girls.parent_links(
  uid       uuid not null references auth.users(id) on delete cascade,   -- the phone's anonymous sign-in
  player_id text not null references hilda_park_u9_girls.players(id) on delete cascade,
  linked    timestamptz not null default now(),
  primary key(uid, player_id)
);
alter table hilda_park_u9_girls.parent_links enable row level security;   -- no policies: everything goes through the functions below
revoke all on hilda_park_u9_girls.parent_links from anon, authenticated;

-- wrong codes, so nobody can guess their way in: five tries an hour per phone
create table if not exists hilda_park_u9_girls.parent_tries(
  uid uuid not null,
  at  timestamptz not null default now()
);
create index if not exists parent_tries_uid on hilda_park_u9_girls.parent_tries(uid, at);
alter table hilda_park_u9_girls.parent_tries enable row level security;
revoke all on hilda_park_u9_girls.parent_tries from anon, authenticated;

create or replace function hilda_park_u9_girls.parents_required() returns boolean
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select coalesce((select required from hilda_park_u9_girls.parent_settings where id = 1), false);
$$;

-- the current players this phone is linked to, by name
create or replace function hilda_park_u9_girls.my_children() returns setof text
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select p.name from hilda_park_u9_girls.parent_links l join hilda_park_u9_girls.players p on p.id = l.player_id
  where l.uid = auth.uid() and p.current order by p.num nulls last, p.name;
$$;

create or replace function hilda_park_u9_girls.is_parent_of(p_player text) returns boolean
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select exists (select 1 from hilda_park_u9_girls.parent_links l join hilda_park_u9_girls.players p on p.id = l.player_id
                 where l.uid = auth.uid() and p.name = p_player and p.current);
$$;

-- one vote per family: the phone's first linked child stands for the family
create or replace function hilda_park_u9_girls.family_key() returns text
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select 'family:' || min(l.player_id) from hilda_park_u9_girls.parent_links l join hilda_park_u9_girls.players p on p.id = l.player_id
  where l.uid = auth.uid() and p.current;
$$;

-- a parent types a code: link this phone to that child and return the child's name (null for a wrong code;
-- it doesn't raise an error, so the wrong try is still counted)
create or replace function hilda_park_u9_girls.link_family(p_code text) returns text
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); pid text; pname text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from hilda_park_u9_girls.parent_tries where at < now() - interval '1 hour';
  if (select count(*) from hilda_park_u9_girls.parent_tries where uid = auth.uid()) >= 5 then
    raise exception 'Too many tries. Wait an hour, or ask the coach to check the code.';
  end if;
  select f.player_id, p.name into pid, pname from hilda_park_u9_girls.family_codes f join hilda_park_u9_girls.players p on p.id = f.player_id
  where f.code = c and p.current;
  if pid is null then
    insert into hilda_park_u9_girls.parent_tries(uid) values (auth.uid());
    return null;
  end if;
  insert into hilda_park_u9_girls.parent_links(uid, player_id) values (auth.uid(), pid) on conflict do nothing;
  return pname;
end $$;

-- a parent removes a child from this phone (or all of them, when p_player is null)
create or replace function hilda_park_u9_girls.unlink_family(p_player text) returns void
language sql security definer set search_path = hilda_park_u9_girls as $$
  delete from hilda_park_u9_girls.parent_links l using hilda_park_u9_girls.players p
  where l.uid = auth.uid() and p.id = l.player_id and (p_player is null or p.name = p_player);
$$;

-- this phone's own availability answers, so a parent sees what they said
create or replace function hilda_park_u9_girls.my_availability() returns table(match_id text, player text, status text)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select a.match_id, a.player, a.status from hilda_park_u9_girls.availability a where hilda_park_u9_girls.is_parent_of(a.player);
$$;

-- ---------- Coaches: see and reset codes ----------
create or replace function hilda_park_u9_girls.new_family_code(p_player text) returns text
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare abc text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; c text; i int;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can make family codes'; end if;
  if not exists (select 1 from hilda_park_u9_girls.players where id = p_player) then raise exception 'unknown player'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from hilda_park_u9_girls.family_codes where code = c);
  end loop;
  delete from hilda_park_u9_girls.parent_links where player_id = p_player;   -- phones using the old code lose access
  insert into hilda_park_u9_girls.family_codes(player_id, code, created) values (p_player, c, now())
  on conflict (player_id) do update set code = excluded.code, created = excluded.created;
  return c;
end $$;

-- every current player with their code (made now if they haven't got one) and how many phones are linked
create or replace function hilda_park_u9_girls.family_overview() returns table(player_id text, player text, num int, code text, phones bigint)
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare r record;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can see family codes'; end if;
  for r in select p.id from hilda_park_u9_girls.players p where p.current and not exists (select 1 from hilda_park_u9_girls.family_codes f where f.player_id = p.id) loop
    perform hilda_park_u9_girls.new_family_code(r.id);
  end loop;
  return query
    select p.id, p.name, p.num, f.code, (select count(*) from hilda_park_u9_girls.parent_links l where l.player_id = p.id)
    from hilda_park_u9_girls.players p join hilda_park_u9_girls.family_codes f on f.player_id = p.id
    where p.current order by p.num nulls last, p.name;
end $$;

-- ---------- Availability: parents answer for their own children ----------
create or replace function hilda_park_u9_girls.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (hilda_park_u9_girls.is_coach() or hilda_park_u9_girls.is_parent_of(p_player) or not hilda_park_u9_girls.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  if not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated) values (p_match, p_player, p_status, now())
  on conflict (match_id, player) do update set status = excluded.status, updated = now();
end $$;

-- ---------- Votes: one per family once signed in ----------
create or replace function hilda_park_u9_girls.cast_vote(p_poll text, p_voter text, p_choice int)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare p hilda_park_u9_girls.polls; v text := hilda_park_u9_girls.family_key();
begin
  select * into p from hilda_park_u9_girls.polls where id = p_poll;
  if p.id is null or p.closed or (p.closes is not null and p.closes < now()) then raise exception 'This vote has closed'; end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(p.options) then raise exception 'bad choice'; end if;
  if v is null then
    if hilda_park_u9_girls.parents_required() then raise exception 'Sign in with your family code to vote'; end if;
    v := p_voter;
    if length(v) < 16 or length(v) > 64 then raise exception 'bad voter'; end if;
  end if;
  insert into hilda_park_u9_girls.poll_votes(poll_id, voter, choice) values (p_poll, v, p_choice)
  on conflict (poll_id, voter) do update set choice = excluded.choice, updated = now();
end $$;

-- the family's own votes, so every linked phone shows what the family chose
create or replace function hilda_park_u9_girls.my_votes() returns table(poll_id text, choice int)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select v.poll_id, v.choice from hilda_park_u9_girls.poll_votes v where v.voter = hilda_park_u9_girls.family_key();
$$;

revoke execute on function hilda_park_u9_girls.parents_required(), hilda_park_u9_girls.my_children(), hilda_park_u9_girls.is_parent_of(text), hilda_park_u9_girls.family_key(),
  hilda_park_u9_girls.link_family(text), hilda_park_u9_girls.unlink_family(text), hilda_park_u9_girls.my_availability(), hilda_park_u9_girls.new_family_code(text),
  hilda_park_u9_girls.family_overview(), hilda_park_u9_girls.my_votes() from public, anon;
grant execute on function hilda_park_u9_girls.my_children(), hilda_park_u9_girls.is_parent_of(text), hilda_park_u9_girls.link_family(text), hilda_park_u9_girls.unlink_family(text),
  hilda_park_u9_girls.my_availability(), hilda_park_u9_girls.new_family_code(text), hilda_park_u9_girls.family_overview(), hilda_park_u9_girls.my_votes() to authenticated;
grant execute on function hilda_park_u9_girls.parents_required() to anon, authenticated;
grant execute on function hilda_park_u9_girls.set_availability(text,text,text), hilda_park_u9_girls.cast_vote(text,text,int) to anon, authenticated;

-- ===================== 11_rugby.sql =====================
-- Added 2026-10-22: rugby union and rugby league (TEAM.sport in team.js, or the sport on the Team setup page). Safe to re-run.
-- A rugby team keeps each player's tries in matches.played (where football keeps goals) and the score in points.
-- Each player's kicks go here: {"Mia": {"con": 2, "pen": 1, "drop": 0}} (conversions, penalty goals, drop goals).
-- Football teams can run this too: the column just stays empty.
alter table hilda_park_u9_girls.matches add column if not exists kicks jsonb not null default '{}'::jsonb;

-- ===================== 12_preview_alert.sql =====================
-- Added 2026-10-23: "Match preview" alert, sent once per game the first time a coach saves a preview.
-- Safe to re-run. Run it once on every team's database (SQL editor), then redeploy the notify edge function.
-- Goes to phones with Reminders on (the same ones that get the squad and kick-off alerts).
alter table hilda_park_u9_girls.push_log add column if not exists preview_sent boolean not null default false;
create or replace function hilda_park_u9_girls.push_claim_preview(p_match text)
returns boolean language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  insert into hilda_park_u9_girls.push_log (match_id) values (p_match) on conflict do nothing;
  update hilda_park_u9_girls.push_log set preview_sent = true where match_id = p_match and not preview_sent;
  return found;
end $$;
revoke all on function hilda_park_u9_girls.push_claim_preview(text) from public, anon, authenticated;

-- ===================== 13_cheers.sql =====================
-- Added 2026-10-24: supporter cheers. Safe to re-run. Run it once on every team's database (SQL editor).
-- Anyone with the site link can send a ready-made cheer to the team in the week before a game and during it, with
-- their own first name if they like. The words are picked from a list in the site (no typing), and cheers go to the
-- whole team, never to a named child. Limits: 3 cheers per phone every 10 minutes, 30 a minute and 200 a game in all.
-- A coach can hide any cheer, or turn cheers off for the team. Cheers are deleted 30 days after they're sent.

-- ---------- Team switch: a coach can turn cheers off ----------
create table if not exists hilda_park_u9_girls.cheer_settings(
  id    int primary key default 1 check (id = 1),
  muted boolean not null default false   -- true: nobody can send cheers and none are shown
);
insert into hilda_park_u9_girls.cheer_settings (id) values (1) on conflict do nothing;
alter table hilda_park_u9_girls.cheer_settings enable row level security;
drop policy if exists "everyone reads cheer settings" on hilda_park_u9_girls.cheer_settings;
create policy "everyone reads cheer settings" on hilda_park_u9_girls.cheer_settings for select using (true);
drop policy if exists "coaches change cheer settings" on hilda_park_u9_girls.cheer_settings;
create policy "coaches change cheer settings" on hilda_park_u9_girls.cheer_settings for update to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.cheer_settings to anon, authenticated;
grant update on hilda_park_u9_girls.cheer_settings to authenticated;

-- ---------- The cheers ----------
create table if not exists hilda_park_u9_girls.cheers(
  id       bigint generated always as identity primary key,
  match_id text not null references hilda_park_u9_girls.matches(id) on delete cascade,
  cheer    smallint not null,   -- which ready-made cheer (its place in the site's list)
  name     text,                -- the sender's own first name, if they gave one
  voter    text not null,       -- a random code made on the sender's phone, only for the limits
  at       timestamptz not null default now(),
  hidden   boolean not null default false
);
create index if not exists cheers_match on hilda_park_u9_girls.cheers(match_id, id);
create index if not exists cheers_voter on hilda_park_u9_girls.cheers(voter, at);
alter table hilda_park_u9_girls.cheers enable row level security;   -- no policies: everything goes through the functions below
revoke all on hilda_park_u9_girls.cheers from anon, authenticated;

create or replace function hilda_park_u9_girls.send_cheer(p_match text, p_voter text, p_cheer int, p_name text)
returns bigint language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare d date; today date := (now() at time zone 'Europe/London')::date;
        n text := left(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[^A-Za-zÀ-ÖØ-öø-ÿ'' -]', '', 'g'), '\s+', ' ', 'g')), 20);
        new_id bigint;
begin
  if (select muted from hilda_park_u9_girls.cheer_settings where id = 1) then raise exception 'Cheers are off for this team'; end if;
  if n = '' then raise exception 'Add your first name'; end if;
  if p_cheer is null or p_cheer < 0 or p_cheer > 49 then raise exception 'Pick a cheer'; end if;
  if p_voter is null or length(p_voter) not between 8 and 64 then raise exception 'This phone can''t send cheers'; end if;
  select date into d from hilda_park_u9_girls.matches where id = p_match;
  if d is null or d < today or d > today + 7 then raise exception 'Cheers open a week before the game'; end if;
  delete from hilda_park_u9_girls.cheers where at < now() - interval '30 days';
  if (select count(*) from hilda_park_u9_girls.cheers where voter = p_voter and at > now() - interval '10 minutes') >= 3 then
    raise exception 'Slow down: 3 cheers every 10 minutes';
  end if;
  if (select count(*) from hilda_park_u9_girls.cheers where match_id = p_match and at > now() - interval '1 minute') >= 30
     or (select count(*) from hilda_park_u9_girls.cheers where match_id = p_match) >= 200 then
    raise exception 'Lots of cheers already. Try again later';
  end if;
  insert into hilda_park_u9_girls.cheers(match_id, cheer, name, voter) values (p_match, p_cheer, nullif(n, ''), p_voter) returning id into new_id;
  return new_id;
end $$;

-- the latest 50 cheers for a game (never the phone codes)
create or replace function hilda_park_u9_girls.cheers_for(p_match text) returns table(id bigint, cheer smallint, name text, at timestamptz)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select * from (select c.id, c.cheer, c.name, c.at from hilda_park_u9_girls.cheers c
                 where c.match_id = p_match and not c.hidden and not coalesce((select muted from hilda_park_u9_girls.cheer_settings where id = 1), false)
                 order by c.id desc limit 50) x order by id;
$$;

create or replace function hilda_park_u9_girls.hide_cheer(p_id bigint) returns void
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Coaches only'; end if;
  update hilda_park_u9_girls.cheers set hidden = true where id = p_id;
end $$;

revoke all on function hilda_park_u9_girls.send_cheer(text,text,int,text), hilda_park_u9_girls.cheers_for(text), hilda_park_u9_girls.hide_cheer(bigint) from public;
grant execute on function hilda_park_u9_girls.send_cheer(text,text,int,text), hilda_park_u9_girls.cheers_for(text) to anon, authenticated;
grant execute on function hilda_park_u9_girls.hide_cheer(bigint) to authenticated;

-- ===================== 14_tournament_teams.sql =====================
-- Added 2026-10-26: the teams entered in a tournament, and which group each is in. Safe to re-run.
-- A list like [{"name":"Beamish","group":"A"}, ...]. group is "" until the groups are drawn, and the site then shows
-- "Groups to be drawn". Coaches change it on the Edit tournament form; everyone can read it (it's on the public page).
alter table hilda_park_u9_girls.tournaments add column if not exists teams jsonb not null default '[]'::jsonb;
alter table hilda_park_u9_girls.tournaments drop constraint if exists tournaments_teams_is_list;
alter table hilda_park_u9_girls.tournaments add constraint tournaments_teams_is_list check (jsonb_typeof(teams) = 'array' and jsonb_array_length(teams) <= 64);
notify pgrst, 'reload schema';

-- ===================== 15_tournament_squad.sql =====================
-- Added 2026-10-31: the squad picked for a tournament, before its games are on the site. Safe to re-run.
-- A list of first names, like matches.squad. Coaches pick it from the tournament card (Pick squad), parents see it on
-- the tournament card, and every game added to the tournament starts with it. Everyone can read it (it's on the public page).
alter table hilda_park_u9_girls.tournaments add column if not exists squad jsonb;
alter table hilda_park_u9_girls.tournaments drop constraint if exists tournaments_squad_is_list;
alter table hilda_park_u9_girls.tournaments add constraint tournaments_squad_is_list check (squad is null or (jsonb_typeof(squad) = 'array' and jsonb_array_length(squad) <= 60));
notify pgrst, 'reload schema';

-- ===================== 16_availability_alerts.sql =====================
-- Added 2026-10-31: availability alerts, training availability and reminders to answer. Safe to re-run.
-- 1. A coach can have an alert on their phone each time a parent says whether their child can make a game or training.
-- 2. Parents answer for training as well as games (training_availability; only coaches see the answers).
-- 3. Reminders to answer go the Wednesday evening before a game and 24 hours before training. A phone signed in
--    with a family code gets one while its own child hasn't answered; phones that aren't signed in and coaches'
--    phones don't get them.
-- Run it on every team's database (and for every team schema), then redeploy the notify edge function.

-- ---------- Which sign-in turned alerts on ----------
-- uid: the phone's sign-in when alerts were turned on or changed (a parent's family-code sign-in, or a coach).
-- It's how a reminder knows which child the phone is for. Nothing else about the parent is stored.
alter table hilda_park_u9_girls.push_subs add column if not exists uid uuid references auth.users(id) on delete set null;
alter table hilda_park_u9_girls.push_subs add column if not exists coach boolean not null default false;   -- a coach's phone
alter table hilda_park_u9_girls.push_subs add column if not exists avail boolean not null default false;   -- a coach wants availability answers

drop function if exists hilda_park_u9_girls.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean);
create or replace function hilda_park_u9_girls.push_subscribe2(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean,
                                                  p_goals boolean, p_results boolean, p_avail boolean default null)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare c boolean := hilda_park_u9_girls.is_coach();
begin
  perform hilda_park_u9_girls.push_subscribe(p_endpoint, p_p256dh, p_auth, p_reminders, p_live);  -- checks it's a real push address
  update hilda_park_u9_girls.push_subs set goals = coalesce(p_goals, false), results = coalesce(p_results, false),
    uid = auth.uid(), coach = c,
    avail = c and (case when p_avail is null then avail else p_avail end)   -- null: an older page that doesn't know about it
  where endpoint = p_endpoint;
end $$;
revoke all on function hilda_park_u9_girls.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function hilda_park_u9_girls.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;

-- ---------- Training availability ----------
create table if not exists hilda_park_u9_girls.training_availability(
  day     date not null,
  player  text not null,
  status  text not null check (status in ('yes','no','maybe')),
  updated timestamptz not null default now(),
  primary key(day, player)
);
alter table hilda_park_u9_girls.training_availability enable row level security;
drop policy if exists "coaches read training availability" on hilda_park_u9_girls.training_availability;
create policy "coaches read training availability" on hilda_park_u9_girls.training_availability for select using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches write training availability" on hilda_park_u9_girls.training_availability;
create policy "coaches write training availability" on hilda_park_u9_girls.training_availability for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
-- anon can "read" it (and gets no rows): that's how the site knows the feature is switched on
grant select on hilda_park_u9_girls.training_availability to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.training_availability to authenticated;
revoke insert, update, delete, truncate on hilda_park_u9_girls.training_availability from anon;

-- a parent answers for their own child (or anyone, while "parents must sign in" is off), for a real upcoming session
create or replace function hilda_park_u9_girls.set_training_availability(p_day date, p_player text, p_status text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare t hilda_park_u9_girls.training;
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (hilda_park_u9_girls.is_coach() or hilda_park_u9_girls.is_parent_of(p_player) or not hilda_park_u9_girls.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  select * into t from hilda_park_u9_girls.training where id = 1;
  if t.id is null or p_day < current_date - 1 or p_day > current_date + 60 or trim(to_char(p_day, 'Day')) <> t.day
     or p_day = any(t.off) or (t.until is not null and p_day > t.until) then
    raise exception 'unknown training session';
  end if;
  if not exists (select 1 from hilda_park_u9_girls.players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into hilda_park_u9_girls.training_availability(day, player, status, updated) values (p_day, p_player, p_status, now())
  on conflict (day, player) do update set status = excluded.status, updated = now();
end $$;
grant execute on function hilda_park_u9_girls.set_training_availability(date, text, text) to anon, authenticated;

-- this phone's own training answers
create or replace function hilda_park_u9_girls.my_training_availability() returns table(day date, player text, status text)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select a.day, a.player, a.status from hilda_park_u9_girls.training_availability a where a.day >= current_date - 1 and hilda_park_u9_girls.is_parent_of(a.player);
$$;
revoke execute on function hilda_park_u9_girls.my_training_availability() from public, anon;
grant execute on function hilda_park_u9_girls.my_training_availability() to authenticated;

-- ---------- Used by the notify edge function only ----------
-- Once-only and changed-since-sent markers, keyed by text in push_log:
--   "av:<match>|<player>" and "tav:<day>|<player>": the answer last sent to coaches
--   "avr:<match>" and "trr:<day>": the reminder to answer has gone
alter table hilda_park_u9_girls.push_log add column if not exists note_sent text;
create or replace function hilda_park_u9_girls.push_claim_note(p_key text, p_value text)
returns boolean language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  insert into hilda_park_u9_girls.push_log (match_id) values (p_key) on conflict do nothing;
  update hilda_park_u9_girls.push_log set note_sent = p_value where match_id = p_key and note_sent is distinct from p_value;
  return found;
end $$;
revoke all on function hilda_park_u9_girls.push_claim_note(text, text) from public, anon, authenticated;

-- phones of current coaches who asked for availability answers
create or replace function hilda_park_u9_girls.avail_coach_targets()
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select s.endpoint, s.p256dh, s.auth from hilda_park_u9_girls.push_subs s
  join auth.users u on u.id = s.uid
  where s.avail and exists (select 1 from hilda_park_u9_girls.coaches c where c.email = lower(u.email));
$$;
revoke all on function hilda_park_u9_girls.avail_coach_targets() from public, anon, authenticated;

-- who to remind about a game (p_match) or a training session (p_day), and which of their children haven't answered.
-- Phones with Reminders on, not coaches, signed in with a family code, and only while one of their own children is
-- still to answer. Phones not signed in never get one: they could be anyone's (grandparents, fans).
create or replace function hilda_park_u9_girls.avail_reminder_targets(p_match text, p_day date)
returns table(endpoint text, p256dh text, auth text, kids text[])
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  with waiting as (
    select p.id, p.name, p.num from hilda_park_u9_girls.players p
    where p.current
      and not (p_match is not null and exists (select 1 from hilda_park_u9_girls.availability a where a.match_id = p_match and a.player = p.name))
      and not (p_day is not null and exists (select 1 from hilda_park_u9_girls.training_availability t where t.day = p_day and t.player = p.name))
  )
  select s.endpoint, s.p256dh, s.auth, x.kids
  from hilda_park_u9_girls.push_subs s
  cross join lateral (
    select count(*) as linked,
           coalesce(array_agg(w.name order by w.num nulls last, w.name) filter (where w.id is not null), '{}') as kids
    from hilda_park_u9_girls.parent_links l
    join hilda_park_u9_girls.players p on p.id = l.player_id and p.current
    left join waiting w on w.id = p.id
    where s.uid is not null and l.uid = s.uid
  ) x
  where s.reminders and not s.coach
    and x.linked > 0 and cardinality(x.kids) > 0;   -- only phones signed in with a family code (Sean, 31 Oct)
$$;
revoke all on function hilda_park_u9_girls.avail_reminder_targets(text, date) from public, anon, authenticated;

-- The team's name and alert settings for the notify function, for a team that shares this project in its own schema
-- (the project's own team uses the notify function's secrets). Same shape as TEAM in team.js:
-- {"name": "...", "ageGroup": "...", "publicScores": false, "sport": "football", "potm": {"sponsor": "", "icon": "🏆"}}
create table if not exists hilda_park_u9_girls.alert_team(
  id       int primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb
);
alter table hilda_park_u9_girls.alert_team enable row level security;   -- no policies: only the edge function reads it
revoke all on hilda_park_u9_girls.alert_team from anon, authenticated;


-- ===================== 17_sponsors.sql =====================
-- Added 2026-10-31: team sponsors. Safe to re-run. Run it once on every team's database (SQL editor).
-- Coaches add, change and remove the team's sponsors on the Sponsors page (name, logo, an optional link and an
-- optional line on what they sponsor). Everyone sees them in the "Thank you to our sponsors" strip on the home page.
-- Logos are small pictures shrunk on the coach's phone and kept here as text, like opposition badges.
-- Nothing about children goes in this table.
create table if not exists hilda_park_u9_girls.sponsors(
  id      bigint generated always as identity primary key,
  name    text not null check (length(btrim(name)) between 1 and 80),
  logo    text check (logo is null or length(logo) <= 400000),
  url     text check (url is null or (url ~* '^https?://' and length(url) <= 300)),
  about   text check (about is null or length(about) <= 60),   -- e.g. "Home kit" or "Player of the match"
  sort    int not null default 0,
  created timestamptz not null default now()
);
alter table hilda_park_u9_girls.sponsors enable row level security;
drop policy if exists "everyone reads sponsors" on hilda_park_u9_girls.sponsors;
create policy "everyone reads sponsors" on hilda_park_u9_girls.sponsors for select using (true);
drop policy if exists "coaches write sponsors" on hilda_park_u9_girls.sponsors;
create policy "coaches write sponsors" on hilda_park_u9_girls.sponsors for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.sponsors to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.sponsors to authenticated;

-- ===================== 18_player_ratings.sql =====================
-- Added 2026-11-01: coach ratings. Safe to re-run. Run it once on every team's database (SQL editor).
-- After each game the coaches give every player who played a score out of 10. The Player ratings page adds them up
-- over the season (totals and averages) to help pick the coaches' player of the year.
-- COACHES ONLY: nobody else can read a single row. Visitors (anon) have no rights on the table at all, and parents
-- signed in with a family code are "authenticated" but is_coach() is false for them, so the rules refuse them too.
create table if not exists hilda_park_u9_girls.player_ratings(
  match_id text not null references hilda_park_u9_girls.matches(id) on delete cascade,
  player   text not null check (length(btrim(player)) between 1 and 60),   -- first name, as in matches.played
  score    smallint not null check (score between 1 and 10),
  updated  timestamptz not null default now(),
  primary key (match_id, player)
);
alter table hilda_park_u9_girls.player_ratings enable row level security;
drop policy if exists "coaches only read ratings" on hilda_park_u9_girls.player_ratings;
create policy "coaches only read ratings" on hilda_park_u9_girls.player_ratings for select to authenticated using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches only write ratings" on hilda_park_u9_girls.player_ratings;
create policy "coaches only write ratings" on hilda_park_u9_girls.player_ratings for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke all on hilda_park_u9_girls.player_ratings from anon, public;
grant select, insert, update, delete on hilda_park_u9_girls.player_ratings to authenticated;

-- ===================== 19_player_birthdays.sql =====================
-- Added 2026-11-01: player birthdays. Safe to re-run. Run it once on every team's database (SQL editor).
-- Coaches can note each player's birthday so the site reminds them when one is coming up.
-- DAY AND MONTH ONLY, never the year: no date of birth and no age is stored anywhere.
-- COACHES ONLY: nobody else can read a single row. Visitors (anon) have no rights on the table at all, and parents
-- signed in with a family code are "authenticated" but is_coach() is false for them, so the rules refuse them too.
create table if not exists hilda_park_u9_girls.player_birthdays(
  player  text primary key check (length(btrim(player)) between 1 and 60),   -- first name, as in players.name
  bday    text not null check (bday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),   -- "MM-DD", e.g. "03-14"
  updated timestamptz not null default now()
);
alter table hilda_park_u9_girls.player_birthdays enable row level security;
drop policy if exists "coaches only read birthdays" on hilda_park_u9_girls.player_birthdays;
create policy "coaches only read birthdays" on hilda_park_u9_girls.player_birthdays for select to authenticated using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches only write birthdays" on hilda_park_u9_girls.player_birthdays;
create policy "coaches only write birthdays" on hilda_park_u9_girls.player_birthdays for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke all on hilda_park_u9_girls.player_birthdays from anon, public;
grant select, insert, update, delete on hilda_park_u9_girls.player_birthdays to authenticated;

-- ===================== 20_player_of_month.sql =====================
-- Added 2026-11-01: player of the month. Safe to re-run. Run it once on every team's database (SQL editor).
-- Coaches pick one player each month on the Player of the month page, with an optional line on why. Everyone sees it
-- on the home page, the honours board and the player's own page, and coaches make a poster for Facebook or WhatsApp.
-- First names only, like everything else on the site.
create table if not exists hilda_park_u9_girls.player_of_month(
  month   text primary key check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),   -- e.g. '2026-10' for October 2026
  player  text not null check (length(btrim(player)) between 1 and 60),
  note    text check (note is null or length(note) <= 160),               -- e.g. "Brilliant in goal all month"
  updated timestamptz not null default now()
);
alter table hilda_park_u9_girls.player_of_month enable row level security;
drop policy if exists "everyone reads player of the month" on hilda_park_u9_girls.player_of_month;
create policy "everyone reads player of the month" on hilda_park_u9_girls.player_of_month for select using (true);
drop policy if exists "coaches write player of the month" on hilda_park_u9_girls.player_of_month;
create policy "coaches write player of the month" on hilda_park_u9_girls.player_of_month for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.player_of_month to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.player_of_month to authenticated;

-- ===================== 21_kit_sizes.sql =====================
-- Added 2026-11-01: kit sizes. Safe to re-run. Run it once on every team's database (SQL editor).
-- Coaches, or each family for their own child, note the player's shirt, shorts and socks size (and anything else, e.g. gloves) so ordering kit is easy.
-- The Kit sizes page adds them up into an order list they can copy for the kit supplier.
-- WHO CAN SEE IT: the team's signed-in coaches see and change everyone's sizes. A parent signed in with a family code
-- sees and changes only their own child's sizes (is_parent_of). Visitors (anon) have no rights on the table at all.
create table if not exists hilda_park_u9_girls.player_kit(
  player  text primary key check (length(btrim(player)) between 1 and 60),   -- first name, as in players.name
  shirt   text check (length(shirt) <= 20),
  shorts  text check (length(shorts) <= 20),
  socks   text check (length(socks) <= 20),
  notes   text check (length(notes) <= 120),
  updated timestamptz not null default now()
);
alter table hilda_park_u9_girls.player_kit enable row level security;
drop policy if exists "coaches only read kit sizes" on hilda_park_u9_girls.player_kit;
drop policy if exists "coaches only write kit sizes" on hilda_park_u9_girls.player_kit;
drop policy if exists "coaches and own family read kit sizes" on hilda_park_u9_girls.player_kit;
create policy "coaches and own family read kit sizes" on hilda_park_u9_girls.player_kit for select to authenticated
  using (hilda_park_u9_girls.is_coach() or hilda_park_u9_girls.is_parent_of(player));
drop policy if exists "coaches and own family write kit sizes" on hilda_park_u9_girls.player_kit;
create policy "coaches and own family write kit sizes" on hilda_park_u9_girls.player_kit for all to authenticated
  using (hilda_park_u9_girls.is_coach() or hilda_park_u9_girls.is_parent_of(player)) with check (hilda_park_u9_girls.is_coach() or hilda_park_u9_girls.is_parent_of(player));
revoke all on hilda_park_u9_girls.player_kit from anon, public;
grant select, insert, update, delete on hilda_park_u9_girls.player_kit to authenticated;

-- ===================== 22_coach_availability.sql =====================
-- Added 2026-11-01: coaches answer availability for any player. Safe to re-run. Run it on every team's database
-- (and for every team schema, tools/team_schema_sql.py --only 22_coach_availability.sql).
-- A parent often tells the coach on WhatsApp or at training instead of using the site. A signed-in coach can now set
-- (or change, or clear) any current player's answer for a game or training, and it counts exactly like the parent's:
-- Pick squad, the "not answered yet" list and the reminders all use it, and a parent signed in with the family code
-- sees the answer on their own phone.
-- by_coach marks an answer a coach set, so the coaches can see who said it. A parent answering again clears the mark.

alter table hilda_park_u9_girls.availability add column if not exists by_coach boolean not null default false;
alter table hilda_park_u9_girls.training_availability add column if not exists by_coach boolean not null default false;

create or replace function hilda_park_u9_girls.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare c boolean := hilda_park_u9_girls.is_coach();
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (c or hilda_park_u9_girls.is_parent_of(p_player) or not hilda_park_u9_girls.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  if not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated, by_coach) values (p_match, p_player, p_status, now(), c)
  on conflict (match_id, player) do update set status = excluded.status, updated = now(), by_coach = excluded.by_coach;
end $$;
grant execute on function hilda_park_u9_girls.set_availability(text,text,text) to anon, authenticated;

create or replace function hilda_park_u9_girls.set_training_availability(p_day date, p_player text, p_status text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare t hilda_park_u9_girls.training; c boolean := hilda_park_u9_girls.is_coach();
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (c or hilda_park_u9_girls.is_parent_of(p_player) or not hilda_park_u9_girls.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  select * into t from hilda_park_u9_girls.training where id = 1;
  if t.id is null or p_day < current_date - 1 or p_day > current_date + 60 or trim(to_char(p_day, 'Day')) <> t.day
     or p_day = any(t.off) or (t.until is not null and p_day > t.until) then
    raise exception 'unknown training session';
  end if;
  if not exists (select 1 from hilda_park_u9_girls.players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into hilda_park_u9_girls.training_availability(day, player, status, updated, by_coach) values (p_day, p_player, p_status, now(), c)
  on conflict (day, player) do update set status = excluded.status, updated = now(), by_coach = excluded.by_coach;
end $$;
grant execute on function hilda_park_u9_girls.set_training_availability(date, text, text) to anon, authenticated;

-- ===================== 23_tournament_report.sql =====================
-- Added 2026-11-01: one report for a whole tournament, instead of a report for each of its games. Safe to re-run.
-- Coaches write it from the tournament card (Write tournament report); everyone can read it (it's on the public page,
-- at ?tour=<id>), like matches.report.
alter table hilda_park_u9_girls.tournaments add column if not exists report text;
alter table hilda_park_u9_girls.tournaments drop constraint if exists tournaments_report_length;
alter table hilda_park_u9_girls.tournaments add constraint tournaments_report_length check (report is null or length(report) <= 20000);
notify pgrst, 'reload schema';

-- ===================== 24_shared_coaches.sql =====================
-- Added 2026-11: sister teams whose coaches run both sites share one coach list.
-- Team setup step 5 already writes hilda_park_u9_girls.coaches, which is the list sign-in checks (the sign-up check and
-- is_coach), so a coach added there can sign in straight away. This adds hilda_park_u9_girls.coach_share: the schemas of other
-- teams in this project that use the same coaches (e.g. Newton Aycliffe U11s Wildcats and Pumas). Adding or removing
-- a coach on one site then does the same on the others. Only the database owner fills coach_share in; the site
-- can't read or change it. Safe to re-run.
create table if not exists hilda_park_u9_girls.coach_share (schema_name text primary key);
alter table hilda_park_u9_girls.coach_share enable row level security;   -- no policies: hidden from the site
revoke all on hilda_park_u9_girls.coach_share from anon, authenticated;

create or replace function hilda_park_u9_girls.add_coach(new_email text) returns void
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare em text := lower(trim(coalesce(new_email, ''))); s text;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can add coaches'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email address'; end if;
  insert into hilda_park_u9_girls.coaches (email) values (em) on conflict do nothing;
  for s in select schema_name from hilda_park_u9_girls.coach_share loop
    if to_regclass(format('%I.coaches', s)) is not null then
      execute format('insert into %I.coaches (email) values ($1) on conflict do nothing', s) using em;
    end if;
  end loop;
end $$;

create or replace function hilda_park_u9_girls.remove_coach(old_email text) returns void
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare em text := lower(trim(coalesce(old_email, ''))); s text;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can remove coaches'; end if;
  if em = lower(auth.jwt() ->> 'email') then raise exception 'You can''t remove yourself'; end if;
  delete from hilda_park_u9_girls.coaches where email = em;
  for s in select schema_name from hilda_park_u9_girls.coach_share loop
    if to_regclass(format('%I.coaches', s)) is not null then
      execute format('delete from %I.coaches where email = $1', s) using em;
    end if;
  end loop;
end $$;

-- which sites a coach added here also goes on (Team setup shows it), as site names are not stored: just a count
create or replace function hilda_park_u9_girls.coach_share_count() returns int
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select case when hilda_park_u9_girls.is_coach() then (select count(*)::int from hilda_park_u9_girls.coach_share) else 0 end;
$$;
revoke execute on function hilda_park_u9_girls.add_coach(text), hilda_park_u9_girls.remove_coach(text), hilda_park_u9_girls.coach_share_count() from public, anon;
grant execute on function hilda_park_u9_girls.add_coach(text), hilda_park_u9_girls.remove_coach(text), hilda_park_u9_girls.coach_share_count() to authenticated;

-- ===================== 25_active_days.sql =====================
-- Added 2026-11: how many coaches and parents use the site. One row per signed-in person per day: a coach, or a
-- parent's phone linked by a family code. Plain visitors are already counted in page_views (1_schema.sql).
-- Only the user id, the day and how many times the site was opened that day are kept, never names or emails.
-- Coaches see the totals on the home page's Website visits card (active_summary); the rows themselves are hidden.
-- Safe to re-run.
create table if not exists hilda_park_u9_girls.active_days(
  day date not null default (now() at time zone 'Europe/London')::date,
  uid uuid not null,
  role text not null check (role in ('coach', 'parent')),
  opens int not null default 1,
  primary key (day, uid));
alter table hilda_park_u9_girls.active_days enable row level security;   -- no policies: only the functions below touch it
revoke all on hilda_park_u9_girls.active_days from anon, authenticated;

-- the site calls this once per page load when someone is signed in
create or replace function hilda_park_u9_girls.log_active() returns void
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare r text;
begin
  if auth.uid() is null then return; end if;
  if hilda_park_u9_girls.is_coach() then r := 'coach';
  elsif exists (select 1 from hilda_park_u9_girls.parent_links where uid = auth.uid()) then r := 'parent';
  else return; end if;
  insert into hilda_park_u9_girls.active_days as a (day, uid, role) values ((now() at time zone 'Europe/London')::date, auth.uid(), r)
  on conflict (day, uid) do update set opens = a.opens + 1, role = excluded.role;
end $$;

-- coaches only: people signed in per day, plus how many different coaches and parents overall and in the last 7 days
create or replace function hilda_park_u9_girls.active_summary() returns json
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select case when not hilda_park_u9_girls.is_coach() then null else json_build_object(
    'since', (select min(day) from hilda_park_u9_girls.active_days),
    'days', coalesce((select json_agg(d order by d.day) from (
        select day, count(*) filter (where role = 'coach') as coaches, count(*) filter (where role = 'parent') as parents,
               coalesce(sum(opens), 0) as opens
        from hilda_park_u9_girls.active_days group by day) d), '[]'::json),
    'coaches', (select count(distinct uid) from hilda_park_u9_girls.active_days where role = 'coach'),
    'parents', (select count(distinct uid) from hilda_park_u9_girls.active_days where role = 'parent'),
    'coaches7', (select count(distinct uid) from hilda_park_u9_girls.active_days where role = 'coach' and day > (now() at time zone 'Europe/London')::date - 7),
    'parents7', (select count(distinct uid) from hilda_park_u9_girls.active_days where role = 'parent' and day > (now() at time zone 'Europe/London')::date - 7))
  end;
$$;
revoke execute on function hilda_park_u9_girls.log_active(), hilda_park_u9_girls.active_summary() from public, anon;
grant execute on function hilda_park_u9_girls.log_active(), hilda_park_u9_girls.active_summary() to authenticated;

-- a head start from what's already known: the day each parent's phone was linked, and each coach's latest sign-in
insert into hilda_park_u9_girls.active_days (day, uid, role)
  select distinct (linked at time zone 'Europe/London')::date, uid, 'parent' from hilda_park_u9_girls.parent_links where linked is not null
  on conflict do nothing;
insert into hilda_park_u9_girls.active_days (day, uid, role)
  select (u.last_sign_in_at at time zone 'Europe/London')::date, u.id, 'coach'
  from auth.users u join hilda_park_u9_girls.coaches c on c.email = lower(u.email)
  where u.last_sign_in_at is not null and not coalesce(u.is_anonymous, false)
  on conflict do nothing;

-- ===================== 27_my_badges.sql =====================
-- Added 2026-11: badges for coaches and parents who keep coming back (the Medals page and the "Your badges" strip).
-- A signed-in coach or parent's phone reads back only its OWN days from active_days (25_active_days.sql), to count
-- days, weeks in a row and match days. Nobody can read anyone else's days; coaches still only get the totals.
-- Player medals need nothing here: the site works them out from the games. Safe to re-run.
create or replace function hilda_park_u9_girls.my_days() returns json
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select coalesce(json_agg(day order by day), '[]'::json) from hilda_park_u9_girls.active_days where uid = auth.uid() and auth.uid() is not null;
$$;
revoke execute on function hilda_park_u9_girls.my_days() from public, anon;
grant execute on function hilda_park_u9_girls.my_days() to authenticated;

-- ===================== 29_coach_photos.sql =====================
-- Added 2026-11-04: Coach photos, a private photo store for the team's coaches. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 29_coach_photos.sql).
-- Coaches keep match, training and team photos here to share among themselves (for graphics, the end-of-season
-- night and so on). NOTHING here is ever shown on the site.
-- WHO CAN SEE IT: only the team's signed-in coaches (is_coach()). Visitors (anon) and parents signed in with a family
-- code have no rights on the table or the files at all. The storage bucket is PRIVATE: there are no public links, and
-- the site opens each picture with a signed link that runs out after an hour.
-- The site re-draws every photo before upload, which also strips the location data phones put in pictures.
create table if not exists hilda_park_u9_girls.coach_photos(
  id       uuid primary key default gen_random_uuid(),
  album    text not null default '' check (length(album) <= 80),   -- e.g. "v Beamish, Sat 24 Oct" or "Training"
  match_id text,                                                    -- matches.id when the album is a game (no foreign key)
  path     text not null,                                           -- full size, in the coach-photos bucket
  thumb    text not null,                                           -- small copy, in the coach-photos bucket
  caption  text not null default '' check (length(caption) <= 200),
  w int, h int,
  created  timestamptz not null default now()
);
create index if not exists coach_photos_album on hilda_park_u9_girls.coach_photos(album);
alter table hilda_park_u9_girls.coach_photos enable row level security;
drop policy if exists "coaches only coach photos" on hilda_park_u9_girls.coach_photos;
create policy "coaches only coach photos" on hilda_park_u9_girls.coach_photos for all to authenticated
  using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke all on hilda_park_u9_girls.coach_photos from anon, public;
grant select, insert, update, delete on hilda_park_u9_girls.coach_photos to authenticated;

-- videos (added 2026-11-21): the phone's own MP4 / MOV file, up to 50 MB, with a JPEG thumbnail made from it.
-- The site blanks out the file's metadata (where it was filmed) before upload. Photos have kind 'photo'.
alter table hilda_park_u9_girls.coach_photos add column if not exists kind text not null default 'photo';
alter table hilda_park_u9_girls.coach_photos add column if not exists secs int;                -- a video's length in seconds
alter table hilda_park_u9_girls.coach_photos drop constraint if exists coach_photos_kind_check;
alter table hilda_park_u9_girls.coach_photos add constraint coach_photos_kind_check check (kind in ('photo', 'video'));

-- the files: a private bucket (public = false), JPEG photos and phone videos up to 50 MB
-- (the project's Storage > Settings > Global file size limit must be at least 50 MB too)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hilda_park_u9_girls-coach-photos', 'hilda_park_u9_girls-coach-photos', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/3gpp'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/3gpp'];
drop policy if exists "hilda_park_u9_girls coaches see coach-photos" on storage.objects;
create policy "hilda_park_u9_girls coaches see coach-photos" on storage.objects for select to authenticated
  using (bucket_id = 'hilda_park_u9_girls-coach-photos' and hilda_park_u9_girls.is_coach());
drop policy if exists "hilda_park_u9_girls coaches upload coach-photos" on storage.objects;
create policy "hilda_park_u9_girls coaches upload coach-photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'hilda_park_u9_girls-coach-photos' and hilda_park_u9_girls.is_coach());
drop policy if exists "hilda_park_u9_girls coaches delete coach-photos" on storage.objects;
create policy "hilda_park_u9_girls coaches delete coach-photos" on storage.objects for delete to authenticated
  using (bucket_id = 'hilda_park_u9_girls-coach-photos' and hilda_park_u9_girls.is_coach());

-- ===================== 30_tournament_availability.sql =====================
-- Added 2026-11-04: parents (and coaches) answer availability for a whole tournament, just like a game. Safe to re-run.
-- Run it on every team's database (and for every team schema, tools/team_schema_sql.py --only 30_tournament_availability.sql).
-- The answers go in the usual availability table with match_id "t:<tournament id>", so the coach counts, "not answered
-- yet", Chase replies, Pick squad, coach alerts and the Wednesday reminders all work the same way. Answers stay open
-- until the tournament's last day is over. Nothing else changes: the table, its RLS and my_availability() already
-- take any match_id.

create or replace function hilda_park_u9_girls.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare c boolean := hilda_park_u9_girls.is_coach();
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (c or hilda_park_u9_girls.is_parent_of(p_player) or not hilda_park_u9_girls.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  if p_match like 't:%' then
    if not exists (select 1 from tournaments where id = substr(p_match, 3)
                   and greatest(date, end_date) >= current_date - 1) then raise exception 'unknown fixture'; end if;
  elsif not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated, by_coach) values (p_match, p_player, p_status, now(), c)
  on conflict (match_id, player) do update set status = excluded.status, updated = now(), by_coach = excluded.by_coach;
end $$;
grant execute on function hilda_park_u9_girls.set_availability(text,text,text) to anon, authenticated;
notify pgrst, 'reload schema';

-- ===================== 31_fixture_change.sql =====================
-- Fixture changes: when a coach changes an upcoming game's date, kick-off or venue (by hand, or by pasting the league's
-- Full-Time fixtures into "Import league fixtures"), the notify function tells parents with alerts on.
-- push_log.fixture_sig holds "date|ko|venue" as last told, so the same change is only ever sent once.
-- Re-runnable. Run on every team (tools/team_schema_sql.py --only 31_fixture_change.sql for teams in their own schema).
alter table hilda_park_u9_girls.push_log add column if not exists fixture_sig text;

-- Returns what the game was ("date|ko|venue") when it has changed since parents were last told, otherwise null.
-- p_was is what the coach's phone saw before the change; it is only used the first time (nothing told yet).
create or replace function hilda_park_u9_girls.push_claim_fixture(p_match text, p_was text)
returns text language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare cur text; old text;
begin
  select m.date::text || '|' || coalesce(trim(m.ko), '') || '|' || coalesce(trim(m.venue), '') into cur
    from hilda_park_u9_girls.matches m where m.id = p_match;
  if cur is null then return null; end if;
  insert into hilda_park_u9_girls.push_log (match_id) values (p_match) on conflict do nothing;
  select fixture_sig into old from hilda_park_u9_girls.push_log where match_id = p_match for update;
  old := coalesce(old, p_was);
  update hilda_park_u9_girls.push_log set fixture_sig = cur where match_id = p_match;
  if old is null or old = cur then return null; end if;
  return old;
end $$;
revoke all on function hilda_park_u9_girls.push_claim_fixture(text, text) from public, anon, authenticated;

-- ===================== 32_fundraiser.sql =====================
-- Added 2026-11-04: pitch fundraiser. Safe to re-run. Run it once on every team's database (SQL editor), or for a team
-- in its own schema: python3 tools/team_schema_sql.py <schema> --only 32_fundraiser.sql
--
-- Supporters buy a square on a picture of the team's pitch and put a name (and an optional message) on it.
-- It's a donation to the club, not a raffle: there are no prizes, no draw and no odds, so no gambling licence is needed.
-- Never add a prize to this. A prize makes it a lottery, and running a lottery for a club needs a Gambling Commission licence.
--
-- Money never comes through Touchline Tales. Each club links its own Stripe account (Stripe Connect, the club's account
-- pays Stripe's card fee) and supporters pay the club directly. Our fee (5%, nothing for Newton Aycliffe teams) is taken
-- by Stripe on each payment. All of that lives in the "fundraiser" edge function; this file only holds the pitch.
--
--   fundraisers    what the money is for, the goal, square prices, pitch size. Coaches set these up.
--   fund_squares   one row per square bought (or held for 35 minutes while someone pays). Only the edge function adds
--                  rows. Coaches see everything, including the supporter's email for a thank-you, and approve messages.
--   fund_board     what everyone sees: which squares are taken, the name on each (or "Anonymous"), and the message once
--                  a coach has approved it. Never the email or the amount.
--   fund_account   the club's Stripe account id. Only the edge function reads or writes it.
-- Nothing about children goes in these tables. The page asks supporters not to put children's surnames on squares.

create table if not exists hilda_park_u9_girls.fundraisers(
  id      bigint generated always as identity primary key,
  title   text not null check (length(btrim(title)) between 1 and 80),         -- what it's for, e.g. "New 9v9 goals"
  about   text check (about is null or length(about) <= 400),
  goal    int  not null check (goal between 10 and 1000000),                   -- pounds
  price   int  not null check (price between 100 and 100000),                  -- pence per square
  gold    int  check (gold is null or gold between 100 and 500000),            -- pence for a gold square, null = none
  cols    int  not null default 20 check (cols between 5 and 50),
  rows    int  not null default 10 check (rows between 5 and 40),
  ends    date,
  status  text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  created timestamptz not null default now()
);
alter table hilda_park_u9_girls.fundraisers enable row level security;
drop policy if exists "everyone reads live fundraisers" on hilda_park_u9_girls.fundraisers;
create policy "everyone reads live fundraisers" on hilda_park_u9_girls.fundraisers for select using (status <> 'draft' or hilda_park_u9_girls.is_coach());
drop policy if exists "coaches write fundraisers" on hilda_park_u9_girls.fundraisers;
create policy "coaches write fundraisers" on hilda_park_u9_girls.fundraisers for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.fundraisers to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.fundraisers to authenticated;

create table if not exists hilda_park_u9_girls.fund_squares(
  id         bigint generated always as identity primary key,
  fundraiser bigint not null references hilda_park_u9_girls.fundraisers(id) on delete cascade,
  idx        int check (idx is null or idx >= 0),          -- square number, left to right then top to bottom; null = paid but its square was lost
  state      text not null default 'held' check (state in ('held', 'paid', 'refunded')),
  name       text not null check (length(btrim(name)) between 1 and 30),
  message    text check (message is null or length(message) <= 80),
  anon       boolean not null default false,               -- show as "Anonymous"
  gold       boolean not null default false,
  amount     int,                                          -- pence the supporter paid, card fee included
  fee        int,                                          -- pence Touchline Tales kept
  email      text check (email is null or length(email) <= 200),
  approved   boolean not null default false,               -- the message shows once a coach approves it
  hidden     boolean not null default false,               -- a coach hid the name and message
  session    text,                                         -- Stripe checkout session
  payment    text,                                         -- Stripe payment intent, for refunds
  held_until timestamptz,
  created    timestamptz not null default now(),
  paid_at    timestamptz
);
create unique index if not exists fund_squares_one_per_square on hilda_park_u9_girls.fund_squares(fundraiser, idx) where state in ('held', 'paid') and idx is not null;
create index if not exists fund_squares_session on hilda_park_u9_girls.fund_squares(session);
alter table hilda_park_u9_girls.fund_squares enable row level security;
drop policy if exists "coaches read squares" on hilda_park_u9_girls.fund_squares;
create policy "coaches read squares" on hilda_park_u9_girls.fund_squares for select to authenticated using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches moderate squares" on hilda_park_u9_girls.fund_squares;
create policy "coaches moderate squares" on hilda_park_u9_girls.fund_squares for update to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke all on hilda_park_u9_girls.fund_squares from anon;
grant select on hilda_park_u9_girls.fund_squares to authenticated;
-- coaches only ever change these two; everything else is the edge function's
revoke update on hilda_park_u9_girls.fund_squares from authenticated;
grant update (approved, hidden) on hilda_park_u9_girls.fund_squares to authenticated;

-- what everyone sees. A view runs as its owner, so it can read past the coaches-only rule above, but only these columns.
create or replace view hilda_park_u9_girls.fund_board as
  select s.fundraiser, s.idx, s.gold, s.state,
         case when s.state <> 'paid' then null when s.hidden then 'A supporter' when s.anon then 'Anonymous' else s.name end as name,
         case when s.state = 'paid' and s.approved and not s.hidden then s.message end as message,
         s.paid_at
    from hilda_park_u9_girls.fund_squares s
    join hilda_park_u9_girls.fundraisers f on f.id = s.fundraiser and f.status <> 'draft'
   where s.idx is not null and (s.state = 'paid' or (s.state = 'held' and s.held_until > now()));
grant select on hilda_park_u9_girls.fund_board to anon, authenticated;

-- money raised so far (pence before fees), so the progress bar doesn't need every row
create or replace function hilda_park_u9_girls.fund_total(p_fundraiser bigint) returns json
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select json_build_object('raised', coalesce(sum(case when s.gold then coalesce(f.gold, f.price) else f.price end), 0), 'squares', count(*))
    from hilda_park_u9_girls.fund_squares s join hilda_park_u9_girls.fundraisers f on f.id = s.fundraiser
   where s.fundraiser = p_fundraiser and s.state = 'paid' and f.status <> 'draft';
$$;
grant execute on function hilda_park_u9_girls.fund_total(bigint) to anon, authenticated;

create table if not exists hilda_park_u9_girls.fund_account(
  id      int primary key default 1 check (id = 1),
  stripe  text,                                   -- the club's Stripe account id (acct_...)
  ready   boolean not null default false,         -- Stripe says it can take payments
  updated timestamptz not null default now()
);
alter table hilda_park_u9_girls.fund_account enable row level security;   -- no policies: only the edge function (service role) uses it
revoke all on hilda_park_u9_girls.fund_account from anon, authenticated;

-- ===================== 33_team_photos.sql =====================
-- Added 2026-11-07: Team photos. Families and coaches share match-day photos on the Photos page. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 33_team_photos.sql).
-- Needs 10_parent_login.sql (family codes) and the usual is_coach().
-- WHO CAN SEE IT: only the team's signed-in coaches, and families signed in with a family code (a phone linked to a
-- current player). Visitors (anon), and anonymous phones that never typed a right code, have no rights at all.
-- The storage bucket is PRIVATE: no public links, and the site opens each picture with a signed link that runs out after an hour.
-- SAFEGUARDS:
--   * photos go straight on for the team's families (no coach approval, Sean 7 Nov 2026)
--   * any family can ask for a photo to come down (flag_team_photo): it goes to 'waiting' straight away, so only the
--     coaches and the phone that added it can see it, until a coach puts it back or deletes it
--   * coaches can put back, caption and delete any photo; a parent can delete the ones their phone added
--   * at most 40 photos a day from one parent's phone, of which at most 10 videos
--   * no names are stored: uploader is the phone's anonymous sign-in id
-- The site re-draws every photo before upload, which also strips the location data phones put in pictures.
-- The old public "gallery" (match_photos, public bucket) is separate and stays archived.
create table if not exists hilda_park_u9_girls.team_photos(
  id       uuid primary key default gen_random_uuid(),
  match_id text not null check (length(match_id) <= 80),           -- matches.id, or 't:' || tournaments.id (no foreign key)
  path     text not null,                                           -- full size, in the team-photos bucket
  thumb    text not null,                                           -- small copy, in the team-photos bucket
  caption  text not null default '' check (length(caption) <= 200),
  w int, h int,
  status   text not null default 'waiting' check (status in ('waiting', 'approved')),
  flagged  boolean not null default false,                          -- a family asked for it to come down
  by_coach boolean not null default false,
  uploader uuid default auth.uid(),
  created  timestamptz not null default now(),
  checked  timestamptz                                              -- when a coach last put it back
);
create index if not exists team_photos_match on hilda_park_u9_girls.team_photos(match_id);
create index if not exists team_photos_uploader on hilda_park_u9_girls.team_photos(uploader, created);

-- a phone signed in with a family code for a current player
create or replace function hilda_park_u9_girls.is_family() returns boolean
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select auth.uid() is not null and exists (select 1 from hilda_park_u9_girls.parent_links l join hilda_park_u9_girls.players p on p.id = l.player_id
                                            where l.uid = auth.uid() and p.current);
$$;

-- can this person open this file? (used by the storage rules below)
create or replace function hilda_park_u9_girls.can_see_team_photo(p_name text) returns boolean
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select hilda_park_u9_girls.is_coach() or (hilda_park_u9_girls.is_family() and exists (
    select 1 from hilda_park_u9_girls.team_photos f where (f.path = p_name or f.thumb = p_name)
      and (f.status = 'approved' or f.uploader = auth.uid())));
$$;

-- at most 40 a day from one parent's phone, at most 10 of them videos
create or replace function hilda_park_u9_girls.team_photos_limit() returns trigger
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  if not hilda_park_u9_girls.is_coach() and (select count(*) from hilda_park_u9_girls.team_photos
       where uploader = auth.uid() and created > now() - interval '1 day') >= 40 then
    raise exception 'That is the most photos one phone can add in a day';
  end if;
  -- videos are bigger, so at most 10 a day from one parent's phone (within the 40)
  if new.kind = 'video' and not hilda_park_u9_girls.is_coach() and (select count(*) from hilda_park_u9_girls.team_photos
       where uploader = auth.uid() and kind = 'video' and created > now() - interval '1 day') >= 10 then
    raise exception 'That is the most videos one phone can add in a day';
  end if;
  return new;
end $$;
drop trigger if exists team_photos_limit on hilda_park_u9_girls.team_photos;
create trigger team_photos_limit before insert on hilda_park_u9_girls.team_photos for each row execute function hilda_park_u9_girls.team_photos_limit();

-- a family asks for an approved photo to come down: hidden from everyone but the coaches straight away
create or replace function hilda_park_u9_girls.flag_team_photo(p_id uuid) returns void
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
begin
  if not (hilda_park_u9_girls.is_family() or hilda_park_u9_girls.is_coach()) then raise exception 'Sign in with your family code first'; end if;
  update hilda_park_u9_girls.team_photos set flagged = true, status = 'waiting' where id = p_id and status = 'approved';
end $$;

alter table hilda_park_u9_girls.team_photos enable row level security;
drop policy if exists "coaches and families see team photos" on hilda_park_u9_girls.team_photos;
create policy "coaches and families see team photos" on hilda_park_u9_girls.team_photos for select to authenticated
  using (hilda_park_u9_girls.is_coach() or (hilda_park_u9_girls.is_family() and (status = 'approved' or uploader = auth.uid())));
drop policy if exists "coaches and families add team photos" on hilda_park_u9_girls.team_photos;
create policy "coaches and families add team photos" on hilda_park_u9_girls.team_photos for insert to authenticated
  with check (uploader = auth.uid() and (hilda_park_u9_girls.is_coach()
    or (hilda_park_u9_girls.is_family() and not by_coach and not flagged and checked is null)));
drop policy if exists "coaches change team photos" on hilda_park_u9_girls.team_photos;
create policy "coaches change team photos" on hilda_park_u9_girls.team_photos for update to authenticated
  using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches and uploaders delete team photos" on hilda_park_u9_girls.team_photos;
create policy "coaches and uploaders delete team photos" on hilda_park_u9_girls.team_photos for delete to authenticated
  using (hilda_park_u9_girls.is_coach() or (uploader = auth.uid() and hilda_park_u9_girls.is_family()));
revoke all on hilda_park_u9_girls.team_photos from anon, public;
grant select, insert, update, delete on hilda_park_u9_girls.team_photos to authenticated;
revoke execute on function hilda_park_u9_girls.is_family(), hilda_park_u9_girls.can_see_team_photo(text), hilda_park_u9_girls.team_photos_limit(), hilda_park_u9_girls.flag_team_photo(uuid) from public, anon;
grant execute on function hilda_park_u9_girls.is_family(), hilda_park_u9_girls.can_see_team_photo(text), hilda_park_u9_girls.flag_team_photo(uuid) to authenticated;

-- videos (added 2026-11-21): the phone's own MP4 / MOV file, up to 50 MB, with a JPEG thumbnail made from it.
-- The site blanks out the file's metadata (where it was filmed) before upload. Photos have kind 'photo'.
alter table hilda_park_u9_girls.team_photos add column if not exists kind text not null default 'photo';
alter table hilda_park_u9_girls.team_photos add column if not exists secs int;                -- a video's length in seconds
alter table hilda_park_u9_girls.team_photos drop constraint if exists team_photos_kind_check;
alter table hilda_park_u9_girls.team_photos add constraint team_photos_kind_check check (kind in ('photo', 'video'));

-- the files: a private bucket (public = false), JPEG photos and phone videos up to 50 MB
-- (the project's Storage > Settings > Global file size limit must be at least 50 MB too)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hilda_park_u9_girls-team-photos', 'hilda_park_u9_girls-team-photos', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/3gpp'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/3gpp'];
drop policy if exists "hilda_park_u9_girls families see team-photos" on storage.objects;
create policy "hilda_park_u9_girls families see team-photos" on storage.objects for select to authenticated
  using (bucket_id = 'hilda_park_u9_girls-team-photos' and hilda_park_u9_girls.can_see_team_photo(name));
drop policy if exists "hilda_park_u9_girls families upload team-photos" on storage.objects;
create policy "hilda_park_u9_girls families upload team-photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'hilda_park_u9_girls-team-photos' and (hilda_park_u9_girls.is_coach() or hilda_park_u9_girls.is_family()));
drop policy if exists "hilda_park_u9_girls families delete team-photos" on storage.objects;
create policy "hilda_park_u9_girls families delete team-photos" on storage.objects for delete to authenticated
  using (bucket_id = 'hilda_park_u9_girls-team-photos' and (hilda_park_u9_girls.is_coach() or (owner_id = auth.uid()::text and hilda_park_u9_girls.is_family())));

-- ===================== 34_training_only.sql =====================
-- Added 2026-11-07: Training-only players. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 34_training_only.sql).
-- Needs 16_availability_alerts.sql.
-- A training-only player (players.training = true) is in the squad for training: family code, training availability,
-- training reminders, birthdays and kit sizes all work. They are left out of everything to do with games: game and
-- tournament availability, Pick squad, the live match screen, stats, votes and graphics. A coach sets it on the
-- Squad page (In squad / Training only / Left). For a new player who isn't registered to play games yet.
alter table hilda_park_u9_girls.players add column if not exists training boolean not null default false;

-- as in 16_availability_alerts.sql, but a game reminder (p_match) skips training-only players
create or replace function hilda_park_u9_girls.avail_reminder_targets(p_match text, p_day date)
returns table(endpoint text, p256dh text, auth text, kids text[])
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  with waiting as (
    select p.id, p.name, p.num from hilda_park_u9_girls.players p
    where p.current
      and not (p_match is not null and p.training)
      and not (p_match is not null and exists (select 1 from hilda_park_u9_girls.availability a where a.match_id = p_match and a.player = p.name))
      and not (p_day is not null and exists (select 1 from hilda_park_u9_girls.training_availability t where t.day = p_day and t.player = p.name))
  )
  select s.endpoint, s.p256dh, s.auth, x.kids
  from hilda_park_u9_girls.push_subs s
  cross join lateral (
    select count(*) as linked,
           coalesce(array_agg(w.name order by w.num nulls last, w.name) filter (where w.id is not null), '{}') as kids
    from hilda_park_u9_girls.parent_links l
    join hilda_park_u9_girls.players p on p.id = l.player_id and p.current
    left join waiting w on w.id = p.id
    where s.uid is not null and l.uid = s.uid
  ) x
  where s.reminders and not s.coach
    and x.linked > 0 and cardinality(x.kids) > 0;   -- only phones signed in with a family code (Sean, 31 Oct)
$$;
revoke all on function hilda_park_u9_girls.avail_reminder_targets(text, date) from public, anon, authenticated;

-- ===================== 35_tournament_details.sql =====================
-- Added 2026-11-08: tournament details for parents. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 35_tournament_details.sql).
-- tournaments.matchday holds what parents need on the day, like matches.matchday does for a game:
-- {meet, finish, where, kit, bring, address, postcode, parking, cost, notice}. Coaches set it on Edit tournament;
-- everyone can read it (tournament card, home page, ?tour= page, parents' message). Tournament games use the
-- tournament's meet time, kit and postcode unless the game has its own.
alter table hilda_park_u9_girls.tournaments add column if not exists matchday jsonb;
notify pgrst, 'reload schema';

-- ===================== 36_coach_own_availability.sql =====================
-- Added 2026-11-11: coaches say whether THEY can make each game, tournament and training session. Safe to re-run.
-- Run it on every team's database (and for every team schema, tools/team_schema_sql.py --only 36_coach_own_availability.sql).
-- Players' answers stay in availability / training_availability. This is the coaches' own answers, one row per coach
-- per thing: item is the match id for a game, "t:<tournament id>" for a tournament, "tr:<yyyy-mm-dd>" for training.
-- Only signed-in coaches can see or set them, and only through the functions below.
alter table hilda_park_u9_girls.coaches add column if not exists name text;   -- first name shown to the other coaches

create table if not exists hilda_park_u9_girls.coach_availability (
  item    text not null,
  email   text not null,
  status  text not null check (status in ('yes','no','maybe')),
  updated timestamptz not null default now(),
  primary key (item, email));
alter table hilda_park_u9_girls.coach_availability enable row level security;   -- no policies: functions only
revoke all on hilda_park_u9_girls.coach_availability from anon, authenticated;

-- every coach's answers for things still to come, with the name they gave (blank = use the email)
create or replace function hilda_park_u9_girls.coach_availability_list()
returns table(item text, email text, name text, status text)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select a.item, a.email, coalesce(c.name, ''), a.status
  from hilda_park_u9_girls.coach_availability a left join hilda_park_u9_girls.coaches c on c.email = a.email
  where hilda_park_u9_girls.is_coach()
    and (case when a.item like 'tr:%' then substr(a.item, 4) >= to_char(current_date - 1, 'YYYY-MM-DD')
              when a.item like 't:%' then exists (select 1 from hilda_park_u9_girls.tournaments t where t.id = substr(a.item, 3)
                                                  and coalesce(t.date, current_date) >= current_date - 7)
              else exists (select 1 from hilda_park_u9_girls.matches m where m.id = a.item and m.date >= current_date - 1) end);
$$;

-- the team's coaches and their names, so the site can show who hasn't answered yet
create or replace function hilda_park_u9_girls.coach_team()
returns table(email text, name text)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select c.email, coalesce(c.name, '') from hilda_park_u9_girls.coaches c where hilda_park_u9_girls.is_coach() order by c.email;
$$;

-- the signed-in coach answers for themselves; p_status null or '' clears the answer
create or replace function hilda_park_u9_girls.set_coach_availability(p_item text, p_status text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare em text := lower(auth.jwt() ->> 'email'); d date;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can do this'; end if;
  if coalesce(p_status, '') = '' then delete from hilda_park_u9_girls.coach_availability where item = p_item and email = em; return; end if;
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if p_item like 'tr:%' then
    begin d := substr(p_item, 4)::date; exception when others then raise exception 'unknown training session'; end;
    if d < current_date - 1 or d > current_date + 120 then raise exception 'unknown training session'; end if;
  elsif p_item like 't:%' then
    if not exists (select 1 from hilda_park_u9_girls.tournaments where id = substr(p_item, 3)) then raise exception 'unknown tournament'; end if;
  elsif not exists (select 1 from hilda_park_u9_girls.matches where id = p_item and date >= current_date - 1) then
    raise exception 'unknown fixture';
  end if;
  insert into hilda_park_u9_girls.coach_availability(item, email, status, updated) values (p_item, em, p_status, now())
  on conflict (item, email) do update set status = excluded.status, updated = now();
end $$;

-- the name other coaches see next to your answers (also saved on sister sites that share the coach list)
create or replace function hilda_park_u9_girls.set_my_coach_name(p_name text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare em text := lower(auth.jwt() ->> 'email'); nm text := nullif(left(trim(coalesce(p_name, '')), 40), ''); s text;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can do this'; end if;
  update hilda_park_u9_girls.coaches set name = nm where email = em;
  if to_regclass('hilda_park_u9_girls.coach_share') is not null then
    for s in execute 'select schema_name from hilda_park_u9_girls.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists name text', s);
        execute format('update %I.coaches set name = $1 where email = $2', s) using nm, em;
      end if;
    end loop;
  end if;
end $$;

revoke execute on function hilda_park_u9_girls.coach_availability_list(), hilda_park_u9_girls.coach_team(), hilda_park_u9_girls.set_coach_availability(text, text), hilda_park_u9_girls.set_my_coach_name(text) from public, anon;
grant execute on function hilda_park_u9_girls.coach_availability_list(), hilda_park_u9_girls.coach_team(), hilda_park_u9_girls.set_coach_availability(text, text), hilda_park_u9_girls.set_my_coach_name(text) to authenticated;

-- ===================== 37_coach_roles.sql =====================
-- Added 2026-11-11: each login on the coaches list says whether they coach at games and training, or are an admin
-- (they run the site but don't come to games, e.g. a club secretary). Safe to re-run. Run it on every team's
-- database (and for every team schema, tools/team_schema_sql.py --only 37_coach_roles.sql).
-- Admins keep everything a coach can do on the site; they just aren't asked whether they can make each game or
-- training session, and they don't show in the coaches' "not answered yet" list. Blank = not chosen yet (shown as a coach).
alter table hilda_park_u9_girls.coaches add column if not exists coach_role text check (coach_role in ('coach','admin'));

drop function if exists hilda_park_u9_girls.coach_team();
create or replace function hilda_park_u9_girls.coach_team()
returns table(email text, name text, role text)
language sql stable security definer set search_path = hilda_park_u9_girls as $$
  select c.email, coalesce(c.name, ''), coalesce(c.coach_role, '') from hilda_park_u9_girls.coaches c where hilda_park_u9_girls.is_coach() order by c.email;
$$;

-- the signed-in login says what they are (also saved on sister sites that share the coach list)
create or replace function hilda_park_u9_girls.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin') then raise exception 'bad role'; end if;
  update hilda_park_u9_girls.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' then delete from hilda_park_u9_girls.coach_availability where email = em; end if;
  if to_regclass('hilda_park_u9_girls.coach_share') is not null then
    for s in execute 'select schema_name from hilda_park_u9_girls.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;

revoke execute on function hilda_park_u9_girls.coach_team(), hilda_park_u9_girls.set_my_coach_role(text) from public, anon;
grant execute on function hilda_park_u9_girls.coach_team(), hilda_park_u9_girls.set_my_coach_role(text) to authenticated;

-- ===================== 38_team_staff.sql =====================
-- Added 2026-11-11: Coaches and managers on the Squad page, each with a name, a role and a photo, like the players. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 38_team_staff.sql).
-- Everyone can see this list (it's shown on the Squad and Players pages, the same as player photos). Only the team's
-- signed-in coaches can add, change or remove people. It's a display list only: it doesn't give anyone a coach sign-in
-- (that's the coaches table, from Team setup), and it never holds an email address.
create table if not exists hilda_park_u9_girls.team_staff(
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  role text not null default 'Coach' check (length(role) <= 40),
  img text check (img is null or length(img) < 400000),   -- small square JPEG data URL, made on the phone (300px)
  sort int not null default 0,
  updated timestamptz not null default now()
);
alter table hilda_park_u9_girls.team_staff enable row level security;
drop policy if exists "everyone reads staff" on hilda_park_u9_girls.team_staff;
create policy "everyone reads staff" on hilda_park_u9_girls.team_staff for select using (true);
drop policy if exists "coaches write staff" on hilda_park_u9_girls.team_staff;
create policy "coaches write staff" on hilda_park_u9_girls.team_staff for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
grant select on hilda_park_u9_girls.team_staff to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.team_staff to authenticated;

-- ===================== 39_coach_notes.sql =====================
-- Added 2026-11-16: coaches' own notes for the Data hub and match pages. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 39_coach_notes.sql).
-- One row per (kind, k), with a small JSON body:
--   kind 'fc'  four corner wheel, k = player|term ("Isobel|Autumn 2026-27"), data = {tech, phys, psych, soc: 1-5, note}
--   kind 'pos' where a player can play, k = player, data = {z: [zone numbers]}
--   kind 'opp' notes on an opposition, k = their name in lower case, data = {t: notes, at: date}
-- COACHES ONLY: visitors (anon) have no rights at all, and parents signed in with a family code are "authenticated" but
-- is_coach() is false for them, so the rules refuse them too.
create table if not exists hilda_park_u9_girls.coach_notes(
  kind    text not null check (kind in ('fc','pos','opp')),
  k       text not null check (length(btrim(k)) between 1 and 120),
  data    jsonb not null default '{}'::jsonb check (length(data::text) < 4000),
  updated timestamptz not null default now(),
  primary key (kind, k)
);
alter table hilda_park_u9_girls.coach_notes enable row level security;
drop policy if exists "coaches only read notes" on hilda_park_u9_girls.coach_notes;
create policy "coaches only read notes" on hilda_park_u9_girls.coach_notes for select to authenticated using (hilda_park_u9_girls.is_coach());
drop policy if exists "coaches only write notes" on hilda_park_u9_girls.coach_notes;
create policy "coaches only write notes" on hilda_park_u9_girls.coach_notes for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke all on hilda_park_u9_girls.coach_notes from anon, public;
grant select, insert, update, delete on hilda_park_u9_girls.coach_notes to authenticated;

-- ===================== 40_cheer_name_required.sql =====================
-- Every cheer now needs the sender's first name (16 Nov 2026). Same send_cheer as 13_cheers.sql, plus the name check.
-- Safe to run more than once.

create or replace function hilda_park_u9_girls.send_cheer(p_match text, p_voter text, p_cheer int, p_name text)
returns bigint language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare d date; today date := (now() at time zone 'Europe/London')::date;
        n text := left(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[^A-Za-zÀ-ÖØ-öø-ÿ'' -]', '', 'g'), '\s+', ' ', 'g')), 20);
        new_id bigint;
begin
  if (select muted from hilda_park_u9_girls.cheer_settings where id = 1) then raise exception 'Cheers are off for this team'; end if;
  if n = '' then raise exception 'Add your first name'; end if;
  if p_cheer is null or p_cheer < 0 or p_cheer > 49 then raise exception 'Pick a cheer'; end if;
  if p_voter is null or length(p_voter) not between 8 and 64 then raise exception 'This phone can''t send cheers'; end if;
  select date into d from hilda_park_u9_girls.matches where id = p_match;
  if d is null or d < today or d > today + 7 then raise exception 'Cheers open a week before the game'; end if;
  delete from hilda_park_u9_girls.cheers where at < now() - interval '30 days';
  if (select count(*) from hilda_park_u9_girls.cheers where voter = p_voter and at > now() - interval '10 minutes') >= 3 then
    raise exception 'Slow down: 3 cheers every 10 minutes';
  end if;
  if (select count(*) from hilda_park_u9_girls.cheers where match_id = p_match and at > now() - interval '1 minute') >= 30
     or (select count(*) from hilda_park_u9_girls.cheers where match_id = p_match) >= 200 then
    raise exception 'Lots of cheers already. Try again later';
  end if;
  insert into hilda_park_u9_girls.cheers(match_id, cheer, name, voter) values (p_match, p_cheer, nullif(n, ''), p_voter) returning id into new_id;
  return new_id;
end $$;

-- ===================== 42_formations.sql =====================
-- Added 2026-11-19: coaches' own formations (Live match line-ups and the tactics board). Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 42_formations.sql).
-- One row per formation: name (what the button says) and data = {label: ["GK","LB",...], xy: [[x,y],...]}, keeper first.
-- Everyone can READ them, because parents' match pages draw the line-up in the formation the coach picked.
-- Only coaches can add, change or delete them. Nothing about any child is stored here.
create table if not exists hilda_park_u9_girls.formations(
  name    text primary key check (length(btrim(name)) between 1 and 18),
  data    jsonb not null default '{}'::jsonb check (length(data::text) < 2000),
  updated timestamptz not null default now()
);
alter table hilda_park_u9_girls.formations enable row level security;
drop policy if exists "everyone reads formations" on hilda_park_u9_girls.formations;
create policy "everyone reads formations" on hilda_park_u9_girls.formations for select using (true);
drop policy if exists "coaches write formations" on hilda_park_u9_girls.formations;
create policy "coaches write formations" on hilda_park_u9_girls.formations for all to authenticated using (hilda_park_u9_girls.is_coach()) with check (hilda_park_u9_girls.is_coach());
revoke insert, update, delete, truncate on hilda_park_u9_girls.formations from anon;
grant select on hilda_park_u9_girls.formations to anon, authenticated;
grant insert, update, delete on hilda_park_u9_girls.formations to authenticated;

-- ===================== match alerts name for this team =====================
insert into hilda_park_u9_girls.alert_team (id, settings)
values (1, '{"name": "Hilda Park", "ageGroup": "Under 9s", "publicScores": false, "sport": "football", "potm": {"sponsor": "", "icon": "🏆"}}'::jsonb)
on conflict (id) do update set settings = excluded.settings;

select 'Hilda Park U9s Girls set up' as done, (select count(*) from hilda_park_u9_girls.coaches) as coaches, (select count(*) from hilda_park_u9_girls.matches) as games;
