-- Team schema na_u11_wildcats: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists na_u11_wildcats;
grant usage on schema na_u11_wildcats to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on functions to anon, authenticated, service_role;

-- ===================== 1_schema.sql =====================
-- Newton Aycliffe U9s: database setup. Paste into Supabase > SQL Editor and click Run.

create table if not exists na_u11_wildcats.players (
  id      text primary key,
  name    text not null,
  num     integer,
  current boolean not null default true
);

create table if not exists na_u11_wildcats.matches (
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
create table if not exists na_u11_wildcats.coaches (
  email text primary key
);

alter table na_u11_wildcats.players enable row level security;
alter table na_u11_wildcats.matches enable row level security;
alter table na_u11_wildcats.coaches enable row level security;

create or replace function na_u11_wildcats.is_coach() returns boolean
language sql stable security definer set search_path = na_u11_wildcats as $$
  select exists (select 1 from na_u11_wildcats.coaches where email = lower(auth.jwt() ->> 'email'));
$$;

-- Everyone (including parents who aren't signed in) can read results and the squad.
-- To make the site coaches-only, change "to anon, authenticated using (true)" to "to authenticated using (na_u11_wildcats.is_coach())".
drop policy if exists "read players" on na_u11_wildcats.players;
create policy "read players" on na_u11_wildcats.players for select to anon, authenticated using (true);
drop policy if exists "read matches" on na_u11_wildcats.matches;
create policy "read matches" on na_u11_wildcats.matches for select to anon, authenticated using (true);

-- Only coaches can change anything.
drop policy if exists "coaches write players" on na_u11_wildcats.players;
create policy "coaches write players" on na_u11_wildcats.players for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
drop policy if exists "coaches write matches" on na_u11_wildcats.matches;
create policy "coaches write matches" on na_u11_wildcats.matches for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());

-- A signed-in coach can see their own row (the site uses this to show the coach tools).
drop policy if exists "see own coach row" on na_u11_wildcats.coaches;
create policy "see own coach row" on na_u11_wildcats.coaches for select to authenticated using (email = lower(auth.jwt() ->> 'email'));

-- >>> Change this to your email, then run. Add a line per coach.

-- Only emails on the coaches list can create a sign-in account.

-- Added 2026-10: assists per player, e.g. {"Lydia": 1}. Safe to re-run on an existing database.
alter table na_u11_wildcats.matches add column if not exists assists jsonb not null default '{}'::jsonb;
alter table na_u11_wildcats.matches add column if not exists postponed boolean not null default false;

-- Added 2026-10: tournaments (games link to one via matches.tournament_id) and an honours board.
alter table na_u11_wildcats.matches add column if not exists tournament_id text;
alter table na_u11_wildcats.matches add column if not exists stage text default '';   -- Group stage, Semi final, Final...
create table if not exists na_u11_wildcats.tournaments(
  id text primary key, name text not null default '', date date, venue text default '',
  potm text,                    -- player of the tournament
  trophy text default '',       -- Winners, Runners-up, ... blank = none
  notes text default '', updated timestamptz not null default now());
create table if not exists na_u11_wildcats.honours(
  id text primary key, date date, title text not null default '', achievement text default '', notes text default '', updated timestamptz not null default now());
-- Added 2026-10-19: tournaments can run over 2 or 3 days (end_date is blank for a one-day tournament).
alter table na_u11_wildcats.tournaments add column if not exists end_date date;
alter table na_u11_wildcats.tournaments drop constraint if exists tournaments_end_after_start;
alter table na_u11_wildcats.tournaments add constraint tournaments_end_after_start check (end_date is null or end_date >= date);
-- Added 2026-10-26: the teams entered and their groups ("" = groups not drawn yet), see 14_tournament_teams.sql.
alter table na_u11_wildcats.tournaments add column if not exists teams jsonb not null default '[]'::jsonb;
-- Added 2026-10-31: the squad picked for the whole tournament, see 15_tournament_squad.sql.
alter table na_u11_wildcats.tournaments add column if not exists squad jsonb;
alter table na_u11_wildcats.tournaments enable row level security;
alter table na_u11_wildcats.honours enable row level security;
drop policy if exists "read tournaments" on na_u11_wildcats.tournaments;
create policy "read tournaments" on na_u11_wildcats.tournaments for select to anon, authenticated using (true);
drop policy if exists "coaches write tournaments" on na_u11_wildcats.tournaments;
create policy "coaches write tournaments" on na_u11_wildcats.tournaments for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
drop policy if exists "read honours" on na_u11_wildcats.honours;
create policy "read honours" on na_u11_wildcats.honours for select to anon, authenticated using (true);
drop policy if exists "coaches write honours" on na_u11_wildcats.honours;
create policy "coaches write honours" on na_u11_wildcats.honours for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select on na_u11_wildcats.tournaments, na_u11_wildcats.honours to anon, authenticated;
grant insert, update, delete on na_u11_wildcats.tournaments, na_u11_wildcats.honours to authenticated;

-- ---------- Oct 2026: playing time, keepers, availability ----------
alter table na_u11_wildcats.matches add column if not exists quarters jsonb default '{}'::jsonb;
alter table na_u11_wildcats.matches add column if not exists gk text;
alter table na_u11_wildcats.matches add column if not exists saves integer;

create table if not exists na_u11_wildcats.availability(
  match_id text not null,
  player text not null,
  status text not null check (status in ('yes','no','maybe')),
  updated timestamptz default now(),
  primary key(match_id, player)
);
alter table na_u11_wildcats.availability enable row level security;
-- Only coaches can see answers; parents answer through set_availability below.
create policy "coaches read availability" on na_u11_wildcats.availability for select using (na_u11_wildcats.is_coach());
create policy "coaches write availability" on na_u11_wildcats.availability for all using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());

create or replace function na_u11_wildcats.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated) values (p_match, p_player, p_status, now())
  on conflict (match_id, player) do update set status = excluded.status, updated = now();
end $$;
grant execute on function na_u11_wildcats.set_availability(text,text,text) to anon, authenticated;

-- Keepers per game (more than one allowed): {"Name": 1 = clean sheet, 0 = conceded}
alter table na_u11_wildcats.matches add column if not exists keepers jsonb default '{}'::jsonb;

-- Halves played per player {"Name": 0-2} (replaces the unused quarters column), and the squad picked before a fixture
alter table na_u11_wildcats.matches add column if not exists halves jsonb default '{}'::jsonb;
alter table na_u11_wildcats.matches add column if not exists squad jsonb;

-- Live match state, public so parents can follow: {status, half, halfStart, halfLen, form, slots, squad, events, mins}
alter table na_u11_wildcats.matches add column if not exists live jsonb;

-- Opposition badges, shared across the site (small PNG data URLs), public read, coach write
create table if not exists na_u11_wildcats.badges(key text primary key, name text, img text not null, updated timestamptz default now());
alter table na_u11_wildcats.badges enable row level security;
create policy "public read badges" on na_u11_wildcats.badges for select using (true);
create policy "coaches write badges" on na_u11_wildcats.badges for all using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());

-- Player photos: coaches only (never public)
create table if not exists na_u11_wildcats.player_photos(player text primary key, img text not null, updated timestamptz default now());
alter table na_u11_wildcats.player_photos enable row level security;
-- 2026-10-17: Sean asked for photos to be visible to everyone (they were coach-only); only coaches can add or change them.
create policy "everyone reads photos" on na_u11_wildcats.player_photos for select using (true);
grant select on na_u11_wildcats.player_photos to anon;
create policy "coaches write photos" on na_u11_wildcats.player_photos for all using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select, insert, update, delete on na_u11_wildcats.player_photos to authenticated;

-- Website visits: one row per day (UK time), counts only, nothing about who visited.
-- views = times the site was opened; visitors = phones/computers that opened it that day (the site remembers "seen today" in the browser).
create table if not exists na_u11_wildcats.page_views(day date primary key, views int not null default 0, visitors int not null default 0);
alter table na_u11_wildcats.page_views enable row level security;
create policy "coaches read page views" on na_u11_wildcats.page_views for select to authenticated using (na_u11_wildcats.is_coach());
grant select on na_u11_wildcats.page_views to authenticated;

create or replace function na_u11_wildcats.log_view(p_new boolean)
returns void language sql security definer set search_path = na_u11_wildcats as $$
  insert into page_views(day, views, visitors) values ((now() at time zone 'Europe/London')::date, 1, case when p_new then 1 else 0 end)
  on conflict (day) do update set views = page_views.views + 1, visitors = page_views.visitors + case when p_new then 1 else 0 end;
$$;
revoke execute on function na_u11_wildcats.log_view(boolean) from public;
grant execute on function na_u11_wildcats.log_view(boolean) to anon, authenticated;

-- Added 2026-10-17: match report written by a coach on the match page (public, unlike notes).
alter table na_u11_wildcats.matches add column if not exists report text;

-- Added 2026-10-19: match preview written by a coach before the game (public).
alter table na_u11_wildcats.matches add column if not exists preview text;

-- ===================== 3_notifications.sql =====================
-- Newton Aycliffe U9s: match alerts (phone notifications). Safe to re-run.
-- Families turn alerts on from the site. Each phone's push address is stored here; nothing about
-- the family or the child is stored. The "notify" edge function (supabase/functions/notify) sends them.

create table if not exists na_u11_wildcats.push_subs (
  endpoint   text primary key,            -- the phone's push address, issued by Google/Apple/Mozilla
  p256dh     text not null,
  auth       text not null,
  reminders  boolean not null default true,   -- kick-off reminders
  live       boolean not null default true,   -- kick-off, goals, half time, full time
  created    timestamptz not null default now(),
  last_ok    timestamptz
);
alter table na_u11_wildcats.push_subs enable row level security;   -- no policies: only the edge function can read it

-- What has already been sent for each match, so nobody gets the same alert twice.
create table if not exists na_u11_wildcats.push_log (
  match_id  text primary key,
  last_at   bigint not null default 0,    -- "at" (ms) of the newest live event already sent
  reminded  boolean not null default false
);
alter table na_u11_wildcats.push_log enable row level security;

-- The match-alerts key pair. The public half is also in docs/config.js; the private half must never leave the database.
-- Fill it in once with a fresh pair (npx web-push generate-vapid-keys); left empty here on purpose.
create table if not exists na_u11_wildcats.push_keys (
  id          int primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null
);
alter table na_u11_wildcats.push_keys enable row level security;   -- no policies: only the edge function can read it
revoke all on na_u11_wildcats.push_keys from anon, authenticated;

-- Parents (not signed in) turn alerts on and off through these two functions.
create or replace function na_u11_wildcats.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
declare host text := substring(p_endpoint from '^https://([^/:]+)/');
begin
  if host is null or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100
     or not (host = 'fcm.googleapis.com' or host like '%.push.services.mozilla.com' or host = 'web.push.apple.com'
             or host like '%.push.apple.com' or host like '%.notify.windows.com') then
    raise exception 'Not a push address';
  end if;
  insert into na_u11_wildcats.push_subs (endpoint, p256dh, auth, reminders, live)
  values (p_endpoint, p_p256dh, p_auth, coalesce(p_reminders, true), coalesce(p_live, true))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    reminders = excluded.reminders, live = excluded.live;
end $$;

create or replace function na_u11_wildcats.push_unsubscribe(p_endpoint text)
returns void language sql security definer set search_path = na_u11_wildcats as $$
  delete from na_u11_wildcats.push_subs where endpoint = p_endpoint;
$$;

revoke all on function na_u11_wildcats.push_subscribe(text, text, text, boolean, boolean) from public;
revoke all on function na_u11_wildcats.push_unsubscribe(text) from public;
grant execute on function na_u11_wildcats.push_subscribe(text, text, text, boolean, boolean) to anon, authenticated;
grant execute on function na_u11_wildcats.push_unsubscribe(text) to anon, authenticated;

-- Used by the edge function to claim a batch of live events before sending, so two calls
-- at the same moment can't both send the same goal.
create or replace function na_u11_wildcats.push_claim_events(p_match text, p_from bigint, p_to bigint)
returns boolean language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  insert into na_u11_wildcats.push_log (match_id, last_at) values (p_match, 0) on conflict do nothing;
  update na_u11_wildcats.push_log set last_at = p_to where match_id = p_match and last_at = p_from;
  return found;
end $$;

-- Kick-off reminders go at 10 and 2 minutes before; reminders_sent records which have gone for each match.
alter table na_u11_wildcats.push_log add column if not exists reminders_sent int[] not null default '{}';
drop function if exists na_u11_wildcats.push_claim_reminder(text);
create or replace function na_u11_wildcats.push_claim_reminder(p_match text, p_mins int)
returns boolean language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  insert into na_u11_wildcats.push_log (match_id) values (p_match) on conflict do nothing;
  update na_u11_wildcats.push_log set reminders_sent = reminders_sent || p_mins
    where match_id = p_match and not (p_mins = any(reminders_sent));
  return found;
end $$;
revoke all on function na_u11_wildcats.push_claim_events(text, bigint, bigint) from public, anon, authenticated;
-- Squad and player-of-the-match alerts: what was last sent for each match, so a re-save only alerts when it changed.
alter table na_u11_wildcats.push_log add column if not exists squad_sent jsonb;
alter table na_u11_wildcats.push_log add column if not exists potm_sent text;
-- 0 = already sent as it is, 1 = first time, 2 = changed since it was sent
create or replace function na_u11_wildcats.push_claim_squad(p_match text, p_squad jsonb)
returns int language plpgsql security definer set search_path = na_u11_wildcats as $$
declare prev jsonb;
begin
  insert into na_u11_wildcats.push_log (match_id) values (p_match) on conflict do nothing;
  select squad_sent into prev from na_u11_wildcats.push_log where match_id = p_match for update;
  if prev is not distinct from p_squad then return 0; end if;
  update na_u11_wildcats.push_log set squad_sent = p_squad where match_id = p_match;
  return case when prev is null then 1 else 2 end;
end $$;
create or replace function na_u11_wildcats.push_claim_potm(p_match text, p_potm text)
returns boolean language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  insert into na_u11_wildcats.push_log (match_id) values (p_match) on conflict do nothing;
  update na_u11_wildcats.push_log set potm_sent = p_potm where match_id = p_match and potm_sent is distinct from p_potm;
  return found;
end $$;
revoke all on function na_u11_wildcats.push_claim_squad(text, jsonb) from public, anon, authenticated;
revoke all on function na_u11_wildcats.push_claim_potm(text, text) from public, anon, authenticated;

revoke all on function na_u11_wildcats.push_claim_reminder(text, int) from public, anon, authenticated;


-- ===================== 4_gallery_training.sql =====================
-- Added 2026-10-17: photo gallery, training info and the calendar feed. Safe to re-run.

-- ---------- Photo gallery ----------
-- Coaches upload match-day photos against a game; everyone can see them (parents' photo consent confirmed 17 Oct 2026).
-- The files live in the public "gallery" storage bucket: <match id>/<photo id>.jpg plus a small <photo id>_t.jpg thumbnail.
-- The site re-draws every photo before upload, which also strips location data from phone pictures.
create table if not exists na_u11_wildcats.match_photos(
  id       uuid primary key default gen_random_uuid(),
  match_id text not null,            -- matches.id (no foreign key, so live-match saves never wait on it)
  path     text not null,            -- full size, in the gallery bucket
  thumb    text not null,            -- thumbnail, in the gallery bucket
  caption  text default '',
  w int, h int,
  created  timestamptz not null default now()
);
create index if not exists match_photos_match on na_u11_wildcats.match_photos(match_id);
alter table na_u11_wildcats.match_photos enable row level security;
drop policy if exists "everyone reads match photos" on na_u11_wildcats.match_photos;
create policy "everyone reads match photos" on na_u11_wildcats.match_photos for select using (true);
drop policy if exists "coaches write match photos" on na_u11_wildcats.match_photos;
create policy "coaches write match photos" on na_u11_wildcats.match_photos for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select on na_u11_wildcats.match_photos to anon, authenticated;
grant insert, update, delete on na_u11_wildcats.match_photos to authenticated;
revoke insert, update, delete, truncate on na_u11_wildcats.match_photos from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('na_u11_wildcats-gallery', 'na_u11_wildcats-gallery', true, 5242880, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];
drop policy if exists "na_u11_wildcats coaches upload gallery" on storage.objects;
create policy "na_u11_wildcats coaches upload gallery" on storage.objects for insert to authenticated with check (bucket_id = 'na_u11_wildcats-gallery' and na_u11_wildcats.is_coach());
drop policy if exists "na_u11_wildcats coaches see gallery" on storage.objects;
create policy "na_u11_wildcats coaches see gallery" on storage.objects for select to authenticated using (bucket_id = 'na_u11_wildcats-gallery' and na_u11_wildcats.is_coach());
drop policy if exists "na_u11_wildcats coaches delete gallery" on storage.objects;
create policy "na_u11_wildcats coaches delete gallery" on storage.objects for delete to authenticated using (bucket_id = 'na_u11_wildcats-gallery' and na_u11_wildcats.is_coach());

-- ---------- Training ----------
-- One row, shown on the Training page and added to the calendar feed every week until "until".
create table if not exists na_u11_wildcats.training(
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
alter table na_u11_wildcats.training enable row level security;
drop policy if exists "everyone reads training" on na_u11_wildcats.training;
create policy "everyone reads training" on na_u11_wildcats.training for select using (true);
drop policy if exists "coaches write training" on na_u11_wildcats.training;
create policy "coaches write training" on na_u11_wildcats.training for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select on na_u11_wildcats.training to anon, authenticated;
grant insert, update on na_u11_wildcats.training to authenticated;
revoke insert, update, delete, truncate on na_u11_wildcats.training from anon;

insert into na_u11_wildcats.training (id) values (1) on conflict (id) do nothing;   -- coaches fill this in on the Training page

-- ---------- Calendar feed ----------
-- The "calendar" edge function (supabase/functions/calendar) reads matches, tournaments and training with the
-- public key and serves them as an .ics feed that phones subscribe to. It runs with verify_jwt off because
-- calendar apps can't send a key; it only reads data that is already na_u11_wildcats.

-- ===================== 5_help_requests.sql =====================
-- Added 2026-10-17: "Help and changes" requests from coaches. Safe to re-run.
-- Coaches send a request from the site's Help page. A scheduled Claude task reads new rows,
-- makes small data fixes itself, opens a pull request for code changes, and writes the answer
-- back into "reply" so the coach sees it on the same page. Big, unclear or destructive asks wait for Sean.
create table if not exists na_u11_wildcats.help_requests(
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
create index if not exists help_requests_status on na_u11_wildcats.help_requests(status, created);
alter table na_u11_wildcats.help_requests enable row level security;

-- Coaches see every request (they run the team together) and can add their own.
-- Only the database owner (the scheduled task, or Sean in the dashboard) changes status and replies.
drop policy if exists "coaches read help" on na_u11_wildcats.help_requests;
create policy "coaches read help" on na_u11_wildcats.help_requests for select to authenticated using (na_u11_wildcats.is_coach());
drop policy if exists "coaches add help" on na_u11_wildcats.help_requests;
create policy "coaches add help" on na_u11_wildcats.help_requests for insert to authenticated
  with check (na_u11_wildcats.is_coach() and email = lower(auth.jwt() ->> 'email') and status = 'new' and coalesce(reply,'') = '' and coalesce(link,'') = '');
revoke all on na_u11_wildcats.help_requests from anon;
grant select, insert on na_u11_wildcats.help_requests to authenticated;
revoke update, delete, truncate on na_u11_wildcats.help_requests from authenticated;

-- ===================== 6_match_updated.sql =====================
-- Keep matches.updated current on every change, so the calendar feed (supabase/functions/calendar) can tell
-- phones which games changed (LAST-MODIFIED and SEQUENCE). Before this, "updated" stayed at the insert time.
create or replace function na_u11_wildcats.touch_updated() returns trigger language plpgsql set search_path = '' as $$
begin new.updated := now(); return new; end $$;

drop trigger if exists matches_touch_updated on na_u11_wildcats.matches;
create trigger matches_touch_updated before update on na_u11_wildcats.matches
  for each row when (old.* is distinct from new.*) execute function na_u11_wildcats.touch_updated();

-- ===================== 7_team_setup.sql =====================
-- Added 2026-10-19: Team setup, filled in by a coach on the site instead of editing team.js. Safe to re-run.
-- The site reads team_settings on load and lays it over docs/team.js, so a coach's answers show straight away.
-- A new team's row starts with ready = false: visitors see "being set up" until a coach finishes setup,
-- including the welfare officer's sign-off. With no row at all (Newton Aycliffe), the site just uses team.js.

-- ---------- What the site looks like ----------
create table if not exists na_u11_wildcats.team_settings(
  id         int primary key default 1 check (id = 1),
  settings   jsonb not null default '{}'::jsonb,   -- same shape as TEAM in team.js (name, colours, crest as a data URL, kits...)
  ready      boolean not null default false,       -- false: only coaches see the site
  updated    timestamptz not null default now(),
  updated_by text default ''
);
alter table na_u11_wildcats.team_settings enable row level security;
drop policy if exists "everyone reads team settings" on na_u11_wildcats.team_settings;
create policy "everyone reads team settings" on na_u11_wildcats.team_settings for select using (true);
drop policy if exists "coaches write team settings" on na_u11_wildcats.team_settings;
create policy "coaches write team settings" on na_u11_wildcats.team_settings for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select on na_u11_wildcats.team_settings to anon, authenticated;
grant insert, update on na_u11_wildcats.team_settings to authenticated;
revoke insert, update, delete, truncate on na_u11_wildcats.team_settings from anon;

-- ---------- Welfare sign-off and terms (coaches only, never public) ----------
create table if not exists na_u11_wildcats.team_signoff(
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
alter table na_u11_wildcats.team_signoff enable row level security;
drop policy if exists "coaches read signoff" on na_u11_wildcats.team_signoff;
create policy "coaches read signoff" on na_u11_wildcats.team_signoff for select to authenticated using (na_u11_wildcats.is_coach());
drop policy if exists "coaches write signoff" on na_u11_wildcats.team_signoff;
create policy "coaches write signoff" on na_u11_wildcats.team_signoff for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
revoke all on na_u11_wildcats.team_signoff from anon;
grant select, insert, update on na_u11_wildcats.team_signoff to authenticated;

-- ---------- Coaches can manage the coach list from the site ----------
create or replace function na_u11_wildcats.list_coaches() returns setof text
language sql stable security definer set search_path = na_u11_wildcats as $$
  select email from na_u11_wildcats.coaches where na_u11_wildcats.is_coach() order by email;
$$;
create or replace function na_u11_wildcats.add_coach(new_email text) returns void
language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Only coaches can add coaches'; end if;
  if coalesce(new_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email address'; end if;
  insert into na_u11_wildcats.coaches (email) values (lower(trim(new_email))) on conflict do nothing;
end $$;
create or replace function na_u11_wildcats.remove_coach(old_email text) returns void
language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Only coaches can remove coaches'; end if;
  if lower(old_email) = lower(auth.jwt() ->> 'email') then raise exception 'You can''t remove yourself'; end if;
  delete from na_u11_wildcats.coaches where email = lower(old_email);
end $$;
revoke execute on function na_u11_wildcats.list_coaches(), na_u11_wildcats.add_coach(text), na_u11_wildcats.remove_coach(text) from public, anon;
grant execute on function na_u11_wildcats.list_coaches(), na_u11_wildcats.add_coach(text), na_u11_wildcats.remove_coach(text) to authenticated;

insert into na_u11_wildcats.team_settings (id, ready) values (1, false) on conflict (id) do nothing;

-- ===================== 8_multi_day_tournaments.sql =====================
-- Tournaments that run over 2 or 3 days. A tournament runs from "date" (the first day) to "end_date" (the last
-- day); end_date stays blank for a one-day tournament. Each game keeps its own date, which falls on one of the days.
-- The calendar feed (supabase/functions/calendar) reads end_date, so run this before deploying that function.
alter table na_u11_wildcats.tournaments add column if not exists end_date date;
alter table na_u11_wildcats.tournaments drop constraint if exists tournaments_end_after_start;
alter table na_u11_wildcats.tournaments add constraint tournaments_end_after_start check (end_date is null or end_date >= date);

-- ===================== 9_matchday_and_more.sql =====================
-- Added 2026-10-19: matchday details, postponement alerts, alert choices, training attendance and parent votes.
-- Safe to re-run. Run it once on every team's database (SQL editor), then redeploy the notify edge function.

-- ---------- Matchday details on each fixture ----------
-- {"meet": "09:45", "kit": "home" (a key of TEAM.kits) or "Training kit", "pitch": "3", "postcode": "DL1 4PZ"}
-- The postcode is only used on the parent's phone for directions and the kick-off weather forecast.
alter table na_u11_wildcats.matches add column if not exists matchday jsonb;

-- ---------- "Postponed" alert, sent once when a coach marks an upcoming game postponed ----------
alter table na_u11_wildcats.push_log add column if not exists postponed_sent boolean not null default false;
create or replace function na_u11_wildcats.push_claim_postponed(p_match text, p_postponed boolean)
returns boolean language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  insert into na_u11_wildcats.push_log (match_id) values (p_match) on conflict do nothing;
  if not p_postponed then  -- back on: a later postponement can alert again
    update na_u11_wildcats.push_log set postponed_sent = false where match_id = p_match; return false;
  end if;
  update na_u11_wildcats.push_log set postponed_sent = true where match_id = p_match and not postponed_sent;
  return found;
end $$;
revoke all on function na_u11_wildcats.push_claim_postponed(text, boolean) from public, anon, authenticated;

-- ---------- Alert choices per phone ----------
-- reminders (squad, kick-off, postponed) and live (everything on match day) were already there.
-- goals: just the goals. results: full time and player of the match. "live" still covers both.
alter table na_u11_wildcats.push_subs add column if not exists goals boolean not null default false;
alter table na_u11_wildcats.push_subs add column if not exists results boolean not null default false;
create or replace function na_u11_wildcats.push_subscribe2(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean, p_goals boolean, p_results boolean)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  perform na_u11_wildcats.push_subscribe(p_endpoint, p_p256dh, p_auth, p_reminders, p_live);  -- checks it's a real push address
  update na_u11_wildcats.push_subs set goals = coalesce(p_goals, false), results = coalesce(p_results, false) where endpoint = p_endpoint;
end $$;
revoke all on function na_u11_wildcats.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean) from public;
grant execute on function na_u11_wildcats.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean) to anon, authenticated;

-- ---------- Training attendance (coaches only) ----------
-- One row per player who came to a session. Shown to coaches next to playing time, never to parents.
create table if not exists na_u11_wildcats.training_attendance(
  day     date not null,
  player  text not null,
  updated timestamptz not null default now(),
  primary key(day, player)
);
alter table na_u11_wildcats.training_attendance enable row level security;
drop policy if exists "coaches read attendance" on na_u11_wildcats.training_attendance;
create policy "coaches read attendance" on na_u11_wildcats.training_attendance for select to authenticated using (na_u11_wildcats.is_coach());
drop policy if exists "coaches write attendance" on na_u11_wildcats.training_attendance;
create policy "coaches write attendance" on na_u11_wildcats.training_attendance for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select, insert, update, delete on na_u11_wildcats.training_attendance to authenticated;
revoke all on na_u11_wildcats.training_attendance from anon;

-- ---------- Parent votes: goal of the month, players' player of the season ----------
-- Coaches open a vote with a list of choices (first names only). Each phone gets one vote, using a random id kept
-- on that phone; nothing about the parent is stored. Totals are shown to coaches, and to everyone once the vote closes.
create table if not exists na_u11_wildcats.polls(
  id       text primary key,
  kind     text not null default 'other',        -- gotm, potss or other
  title    text not null,
  options  jsonb not null default '[]'::jsonb,   -- ["Jack v Meadow Park (23')", ...]
  closes   timestamptz,                           -- voting stops then (blank = until a coach closes it)
  closed   boolean not null default false,
  created  timestamptz not null default now()
);
alter table na_u11_wildcats.polls enable row level security;
drop policy if exists "everyone reads polls" on na_u11_wildcats.polls;
create policy "everyone reads polls" on na_u11_wildcats.polls for select using (true);
drop policy if exists "coaches write polls" on na_u11_wildcats.polls;
create policy "coaches write polls" on na_u11_wildcats.polls for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select on na_u11_wildcats.polls to anon, authenticated;
grant insert, update, delete on na_u11_wildcats.polls to authenticated;

create table if not exists na_u11_wildcats.poll_votes(
  poll_id text not null,
  voter   text not null,      -- a random id made on the phone
  choice  int  not null,
  updated timestamptz not null default now(),
  primary key(poll_id, voter)
);
alter table na_u11_wildcats.poll_votes enable row level security;   -- no policies: votes only go in through cast_vote
revoke all on na_u11_wildcats.poll_votes from anon, authenticated;

create or replace function na_u11_wildcats.cast_vote(p_poll text, p_voter text, p_choice int)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
declare p na_u11_wildcats.polls;
begin
  select * into p from na_u11_wildcats.polls where id = p_poll;
  if p.id is null or p.closed or (p.closes is not null and p.closes < now()) then raise exception 'This vote has closed'; end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(p.options) then raise exception 'bad choice'; end if;
  if length(p_voter) < 16 or length(p_voter) > 64 then raise exception 'bad voter'; end if;
  insert into na_u11_wildcats.poll_votes(poll_id, voter, choice) values (p_poll, p_voter, p_choice)
  on conflict (poll_id, voter) do update set choice = excluded.choice, updated = now();
end $$;
grant execute on function na_u11_wildcats.cast_vote(text, text, int) to anon, authenticated;

-- totals per choice: coaches any time, everyone else once the vote has closed
create or replace function na_u11_wildcats.poll_totals(p_poll text)
returns table(choice int, votes bigint) language sql security definer set search_path = na_u11_wildcats as $$
  select v.choice, count(*) from na_u11_wildcats.poll_votes v join na_u11_wildcats.polls p on p.id = v.poll_id
  where v.poll_id = p_poll and (na_u11_wildcats.is_coach() or p.closed or (p.closes is not null and p.closes < now()))
  group by v.choice;
$$;
grant execute on function na_u11_wildcats.poll_totals(text) to anon, authenticated;

-- ---------- Sponsor report (coaches only) ----------
-- One row each time a coach saves or copies a matchday graphic, with the sponsors drawn on it.
-- Put next to website visits (page_views) it shows a sponsor how often they were seen.
create table if not exists na_u11_wildcats.post_log(
  id       bigint generated always as identity primary key,
  day      date not null default (now() at time zone 'Europe/London')::date,
  kind     text not null,                         -- squad, ft, potm, month, ms
  sponsors text[] not null default '{}',
  created  timestamptz not null default now()
);
alter table na_u11_wildcats.post_log enable row level security;
drop policy if exists "coaches read post log" on na_u11_wildcats.post_log;
create policy "coaches read post log" on na_u11_wildcats.post_log for select to authenticated using (na_u11_wildcats.is_coach());
drop policy if exists "coaches add to post log" on na_u11_wildcats.post_log;
create policy "coaches add to post log" on na_u11_wildcats.post_log for insert to authenticated with check (na_u11_wildcats.is_coach());
grant select, insert on na_u11_wildcats.post_log to authenticated;
revoke all on na_u11_wildcats.post_log from anon;

-- ===================== 10_parent_login.sql =====================
-- Added 2026-10-21: parent login with family codes. Safe to re-run.
-- Each player gets a private family code from the coach. A parent types it once on the site's Parents page; the
-- phone gets an anonymous Supabase sign-in (no email, no name) linked to that child. Signed-in parents answer
-- availability for their own children only, and each family gets one vote. Nothing about the parent is stored.
-- Also tick Authentication > Sign In / Providers > "Allow anonymous sign-ins" in the Supabase dashboard.

-- ---------- Anonymous sign-ins are allowed; email sign-ins are still coaches only ----------

-- ---------- Team switch: once codes are handed out, a coach turns "parents must sign in" on ----------
create table if not exists na_u11_wildcats.parent_settings(
  id       int primary key default 1 check (id = 1),
  required boolean not null default false   -- true: availability and votes need a family code
);
insert into na_u11_wildcats.parent_settings (id) values (1) on conflict do nothing;
alter table na_u11_wildcats.parent_settings enable row level security;
drop policy if exists "everyone reads parent settings" on na_u11_wildcats.parent_settings;
create policy "everyone reads parent settings" on na_u11_wildcats.parent_settings for select using (true);
drop policy if exists "coaches change parent settings" on na_u11_wildcats.parent_settings;
create policy "coaches change parent settings" on na_u11_wildcats.parent_settings for update to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select on na_u11_wildcats.parent_settings to anon, authenticated;
grant update on na_u11_wildcats.parent_settings to authenticated;

-- ---------- One family code per player (coaches only) ----------
create table if not exists na_u11_wildcats.family_codes(
  player_id text primary key references na_u11_wildcats.players(id) on delete cascade,
  code      text not null unique,   -- six letters and numbers, e.g. 7K3M9Q, shown as 7K3-M9Q
  created   timestamptz not null default now()
);
alter table na_u11_wildcats.family_codes enable row level security;   -- no policies: coaches use family_overview()
revoke all on na_u11_wildcats.family_codes from anon, authenticated;

-- ---------- Which phone belongs to which child ----------
create table if not exists na_u11_wildcats.parent_links(
  uid       uuid not null references auth.users(id) on delete cascade,   -- the phone's anonymous sign-in
  player_id text not null references na_u11_wildcats.players(id) on delete cascade,
  linked    timestamptz not null default now(),
  primary key(uid, player_id)
);
alter table na_u11_wildcats.parent_links enable row level security;   -- no policies: everything goes through the functions below
revoke all on na_u11_wildcats.parent_links from anon, authenticated;

-- wrong codes, so nobody can guess their way in: five tries an hour per phone
create table if not exists na_u11_wildcats.parent_tries(
  uid uuid not null,
  at  timestamptz not null default now()
);
create index if not exists parent_tries_uid on na_u11_wildcats.parent_tries(uid, at);
alter table na_u11_wildcats.parent_tries enable row level security;
revoke all on na_u11_wildcats.parent_tries from anon, authenticated;

create or replace function na_u11_wildcats.parents_required() returns boolean
language sql stable security definer set search_path = na_u11_wildcats as $$
  select coalesce((select required from na_u11_wildcats.parent_settings where id = 1), false);
$$;

-- the current players this phone is linked to, by name
create or replace function na_u11_wildcats.my_children() returns setof text
language sql stable security definer set search_path = na_u11_wildcats as $$
  select p.name from na_u11_wildcats.parent_links l join na_u11_wildcats.players p on p.id = l.player_id
  where l.uid = auth.uid() and p.current order by p.num nulls last, p.name;
$$;

create or replace function na_u11_wildcats.is_parent_of(p_player text) returns boolean
language sql stable security definer set search_path = na_u11_wildcats as $$
  select exists (select 1 from na_u11_wildcats.parent_links l join na_u11_wildcats.players p on p.id = l.player_id
                 where l.uid = auth.uid() and p.name = p_player and p.current);
$$;

-- one vote per family: the phone's first linked child stands for the family
create or replace function na_u11_wildcats.family_key() returns text
language sql stable security definer set search_path = na_u11_wildcats as $$
  select 'family:' || min(l.player_id) from na_u11_wildcats.parent_links l join na_u11_wildcats.players p on p.id = l.player_id
  where l.uid = auth.uid() and p.current;
$$;

-- a parent types a code: link this phone to that child and return the child's name (null for a wrong code;
-- it doesn't raise an error, so the wrong try is still counted)
create or replace function na_u11_wildcats.link_family(p_code text) returns text
language plpgsql security definer set search_path = na_u11_wildcats as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); pid text; pname text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from na_u11_wildcats.parent_tries where at < now() - interval '1 hour';
  if (select count(*) from na_u11_wildcats.parent_tries where uid = auth.uid()) >= 5 then
    raise exception 'Too many tries. Wait an hour, or ask the coach to check the code.';
  end if;
  select f.player_id, p.name into pid, pname from na_u11_wildcats.family_codes f join na_u11_wildcats.players p on p.id = f.player_id
  where f.code = c and p.current;
  if pid is null then
    insert into na_u11_wildcats.parent_tries(uid) values (auth.uid());
    return null;
  end if;
  insert into na_u11_wildcats.parent_links(uid, player_id) values (auth.uid(), pid) on conflict do nothing;
  return pname;
end $$;

-- a parent removes a child from this phone (or all of them, when p_player is null)
create or replace function na_u11_wildcats.unlink_family(p_player text) returns void
language sql security definer set search_path = na_u11_wildcats as $$
  delete from na_u11_wildcats.parent_links l using na_u11_wildcats.players p
  where l.uid = auth.uid() and p.id = l.player_id and (p_player is null or p.name = p_player);
$$;

-- this phone's own availability answers, so a parent sees what they said
create or replace function na_u11_wildcats.my_availability() returns table(match_id text, player text, status text)
language sql stable security definer set search_path = na_u11_wildcats as $$
  select a.match_id, a.player, a.status from na_u11_wildcats.availability a where na_u11_wildcats.is_parent_of(a.player);
$$;

-- ---------- Coaches: see and reset codes ----------
create or replace function na_u11_wildcats.new_family_code(p_player text) returns text
language plpgsql security definer set search_path = na_u11_wildcats as $$
declare abc text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; c text; i int;
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Only coaches can make family codes'; end if;
  if not exists (select 1 from na_u11_wildcats.players where id = p_player) then raise exception 'unknown player'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from na_u11_wildcats.family_codes where code = c);
  end loop;
  delete from na_u11_wildcats.parent_links where player_id = p_player;   -- phones using the old code lose access
  insert into na_u11_wildcats.family_codes(player_id, code, created) values (p_player, c, now())
  on conflict (player_id) do update set code = excluded.code, created = excluded.created;
  return c;
end $$;

-- every current player with their code (made now if they haven't got one) and how many phones are linked
create or replace function na_u11_wildcats.family_overview() returns table(player_id text, player text, num int, code text, phones bigint)
language plpgsql security definer set search_path = na_u11_wildcats as $$
declare r record;
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Only coaches can see family codes'; end if;
  for r in select p.id from na_u11_wildcats.players p where p.current and not exists (select 1 from na_u11_wildcats.family_codes f where f.player_id = p.id) loop
    perform na_u11_wildcats.new_family_code(r.id);
  end loop;
  return query
    select p.id, p.name, p.num, f.code, (select count(*) from na_u11_wildcats.parent_links l where l.player_id = p.id)
    from na_u11_wildcats.players p join na_u11_wildcats.family_codes f on f.player_id = p.id
    where p.current order by p.num nulls last, p.name;
end $$;

-- ---------- Availability: parents answer for their own children ----------
create or replace function na_u11_wildcats.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (na_u11_wildcats.is_coach() or na_u11_wildcats.is_parent_of(p_player) or not na_u11_wildcats.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  if not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated) values (p_match, p_player, p_status, now())
  on conflict (match_id, player) do update set status = excluded.status, updated = now();
end $$;

-- ---------- Votes: one per family once signed in ----------
create or replace function na_u11_wildcats.cast_vote(p_poll text, p_voter text, p_choice int)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
declare p na_u11_wildcats.polls; v text := na_u11_wildcats.family_key();
begin
  select * into p from na_u11_wildcats.polls where id = p_poll;
  if p.id is null or p.closed or (p.closes is not null and p.closes < now()) then raise exception 'This vote has closed'; end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(p.options) then raise exception 'bad choice'; end if;
  if v is null then
    if na_u11_wildcats.parents_required() then raise exception 'Sign in with your family code to vote'; end if;
    v := p_voter;
    if length(v) < 16 or length(v) > 64 then raise exception 'bad voter'; end if;
  end if;
  insert into na_u11_wildcats.poll_votes(poll_id, voter, choice) values (p_poll, v, p_choice)
  on conflict (poll_id, voter) do update set choice = excluded.choice, updated = now();
end $$;

-- the family's own votes, so every linked phone shows what the family chose
create or replace function na_u11_wildcats.my_votes() returns table(poll_id text, choice int)
language sql stable security definer set search_path = na_u11_wildcats as $$
  select v.poll_id, v.choice from na_u11_wildcats.poll_votes v where v.voter = na_u11_wildcats.family_key();
$$;

revoke execute on function na_u11_wildcats.parents_required(), na_u11_wildcats.my_children(), na_u11_wildcats.is_parent_of(text), na_u11_wildcats.family_key(),
  na_u11_wildcats.link_family(text), na_u11_wildcats.unlink_family(text), na_u11_wildcats.my_availability(), na_u11_wildcats.new_family_code(text),
  na_u11_wildcats.family_overview(), na_u11_wildcats.my_votes() from public, anon;
grant execute on function na_u11_wildcats.my_children(), na_u11_wildcats.is_parent_of(text), na_u11_wildcats.link_family(text), na_u11_wildcats.unlink_family(text),
  na_u11_wildcats.my_availability(), na_u11_wildcats.new_family_code(text), na_u11_wildcats.family_overview(), na_u11_wildcats.my_votes() to authenticated;
grant execute on function na_u11_wildcats.parents_required() to anon, authenticated;
grant execute on function na_u11_wildcats.set_availability(text,text,text), na_u11_wildcats.cast_vote(text,text,int) to anon, authenticated;

-- ===================== 11_rugby.sql =====================
-- Added 2026-10-22: rugby union and rugby league (TEAM.sport in team.js, or the sport on the Team setup page). Safe to re-run.
-- A rugby team keeps each player's tries in matches.played (where football keeps goals) and the score in points.
-- Each player's kicks go here: {"Mia": {"con": 2, "pen": 1, "drop": 0}} (conversions, penalty goals, drop goals).
-- Football teams can run this too: the column just stays empty.
alter table na_u11_wildcats.matches add column if not exists kicks jsonb not null default '{}'::jsonb;

-- ===================== 12_preview_alert.sql =====================
-- Added 2026-10-23: "Match preview" alert, sent once per game the first time a coach saves a preview.
-- Safe to re-run. Run it once on every team's database (SQL editor), then redeploy the notify edge function.
-- Goes to phones with Reminders on (the same ones that get the squad and kick-off alerts).
alter table na_u11_wildcats.push_log add column if not exists preview_sent boolean not null default false;
create or replace function na_u11_wildcats.push_claim_preview(p_match text)
returns boolean language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  insert into na_u11_wildcats.push_log (match_id) values (p_match) on conflict do nothing;
  update na_u11_wildcats.push_log set preview_sent = true where match_id = p_match and not preview_sent;
  return found;
end $$;
revoke all on function na_u11_wildcats.push_claim_preview(text) from public, anon, authenticated;

-- ===================== 13_cheers.sql =====================
-- Added 2026-10-24: supporter cheers. Safe to re-run. Run it once on every team's database (SQL editor).
-- Anyone with the site link can send a ready-made cheer to the team in the week before a game and during it, with
-- their own first name if they like. The words are picked from a list in the site (no typing), and cheers go to the
-- whole team, never to a named child. Limits: 3 cheers per phone every 10 minutes, 30 a minute and 200 a game in all.
-- A coach can hide any cheer, or turn cheers off for the team. Cheers are deleted 30 days after they're sent.

-- ---------- Team switch: a coach can turn cheers off ----------
create table if not exists na_u11_wildcats.cheer_settings(
  id    int primary key default 1 check (id = 1),
  muted boolean not null default false   -- true: nobody can send cheers and none are shown
);
insert into na_u11_wildcats.cheer_settings (id) values (1) on conflict do nothing;
alter table na_u11_wildcats.cheer_settings enable row level security;
drop policy if exists "everyone reads cheer settings" on na_u11_wildcats.cheer_settings;
create policy "everyone reads cheer settings" on na_u11_wildcats.cheer_settings for select using (true);
drop policy if exists "coaches change cheer settings" on na_u11_wildcats.cheer_settings;
create policy "coaches change cheer settings" on na_u11_wildcats.cheer_settings for update to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
grant select on na_u11_wildcats.cheer_settings to anon, authenticated;
grant update on na_u11_wildcats.cheer_settings to authenticated;

-- ---------- The cheers ----------
create table if not exists na_u11_wildcats.cheers(
  id       bigint generated always as identity primary key,
  match_id text not null references na_u11_wildcats.matches(id) on delete cascade,
  cheer    smallint not null,   -- which ready-made cheer (its place in the site's list)
  name     text,                -- the sender's own first name, if they gave one
  voter    text not null,       -- a random code made on the sender's phone, only for the limits
  at       timestamptz not null default now(),
  hidden   boolean not null default false
);
create index if not exists cheers_match on na_u11_wildcats.cheers(match_id, id);
create index if not exists cheers_voter on na_u11_wildcats.cheers(voter, at);
alter table na_u11_wildcats.cheers enable row level security;   -- no policies: everything goes through the functions below
revoke all on na_u11_wildcats.cheers from anon, authenticated;

create or replace function na_u11_wildcats.send_cheer(p_match text, p_voter text, p_cheer int, p_name text)
returns bigint language plpgsql security definer set search_path = na_u11_wildcats as $$
declare d date; today date := (now() at time zone 'Europe/London')::date;
        n text := left(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[^A-Za-zÀ-ÖØ-öø-ÿ'' -]', '', 'g'), '\s+', ' ', 'g')), 20);
        new_id bigint;
begin
  if (select muted from na_u11_wildcats.cheer_settings where id = 1) then raise exception 'Cheers are off for this team'; end if;
  if p_cheer is null or p_cheer < 0 or p_cheer > 49 then raise exception 'Pick a cheer'; end if;
  if p_voter is null or length(p_voter) not between 8 and 64 then raise exception 'This phone can''t send cheers'; end if;
  select date into d from na_u11_wildcats.matches where id = p_match;
  if d is null or d < today or d > today + 7 then raise exception 'Cheers open a week before the game'; end if;
  delete from na_u11_wildcats.cheers where at < now() - interval '30 days';
  if (select count(*) from na_u11_wildcats.cheers where voter = p_voter and at > now() - interval '10 minutes') >= 3 then
    raise exception 'Slow down: 3 cheers every 10 minutes';
  end if;
  if (select count(*) from na_u11_wildcats.cheers where match_id = p_match and at > now() - interval '1 minute') >= 30
     or (select count(*) from na_u11_wildcats.cheers where match_id = p_match) >= 200 then
    raise exception 'Lots of cheers already. Try again later';
  end if;
  insert into na_u11_wildcats.cheers(match_id, cheer, name, voter) values (p_match, p_cheer, nullif(n, ''), p_voter) returning id into new_id;
  return new_id;
end $$;

-- the latest 50 cheers for a game (never the phone codes)
create or replace function na_u11_wildcats.cheers_for(p_match text) returns table(id bigint, cheer smallint, name text, at timestamptz)
language sql stable security definer set search_path = na_u11_wildcats as $$
  select * from (select c.id, c.cheer, c.name, c.at from na_u11_wildcats.cheers c
                 where c.match_id = p_match and not c.hidden and not coalesce((select muted from na_u11_wildcats.cheer_settings where id = 1), false)
                 order by c.id desc limit 50) x order by id;
$$;

create or replace function na_u11_wildcats.hide_cheer(p_id bigint) returns void
language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Coaches only'; end if;
  update na_u11_wildcats.cheers set hidden = true where id = p_id;
end $$;

revoke all on function na_u11_wildcats.send_cheer(text,text,int,text), na_u11_wildcats.cheers_for(text), na_u11_wildcats.hide_cheer(bigint) from public;
grant execute on function na_u11_wildcats.send_cheer(text,text,int,text), na_u11_wildcats.cheers_for(text) to anon, authenticated;
grant execute on function na_u11_wildcats.hide_cheer(bigint) to authenticated;

-- ===================== 14_tournament_teams.sql =====================
-- Added 2026-10-26: the teams entered in a tournament, and which group each is in. Safe to re-run.
-- A list like [{"name":"Beamish","group":"A"}, ...]. group is "" until the groups are drawn, and the site then shows
-- "Groups to be drawn". Coaches change it on the Edit tournament form; everyone can read it (it's on the public page).
alter table na_u11_wildcats.tournaments add column if not exists teams jsonb not null default '[]'::jsonb;
alter table na_u11_wildcats.tournaments drop constraint if exists tournaments_teams_is_list;
alter table na_u11_wildcats.tournaments add constraint tournaments_teams_is_list check (jsonb_typeof(teams) = 'array' and jsonb_array_length(teams) <= 64);
notify pgrst, 'reload schema';

-- ===================== 15_tournament_squad.sql =====================
-- Added 2026-10-31: the squad picked for a tournament, before its games are on the site. Safe to re-run.
-- A list of first names, like matches.squad. Coaches pick it from the tournament card (Pick squad), parents see it on
-- the tournament card, and every game added to the tournament starts with it. Everyone can read it (it's on the public page).
alter table na_u11_wildcats.tournaments add column if not exists squad jsonb;
alter table na_u11_wildcats.tournaments drop constraint if exists tournaments_squad_is_list;
alter table na_u11_wildcats.tournaments add constraint tournaments_squad_is_list check (squad is null or (jsonb_typeof(squad) = 'array' and jsonb_array_length(squad) <= 60));
notify pgrst, 'reload schema';

-- ===================== 16_availability_alerts.sql =====================
-- Added 2026-10-31: availability alerts, training availability and reminders to answer. Safe to re-run.
-- 1. A coach can have an alert on their phone each time a parent says whether their child can make a game or training.
-- 2. Parents answer for training as well as games (training_availability; only coaches see the answers).
-- 3. Reminders to answer go the Wednesday evening before a game and 24 hours before training. A phone signed in
--    with a family code only gets one while its own child hasn't answered; a phone that isn't signed in gets one
--    while anyone in the squad is still to answer. Coaches' phones don't get them.
-- Run it on every team's database (and for every team schema), then redeploy the notify edge function.

-- ---------- Which sign-in turned alerts on ----------
-- uid: the phone's sign-in when alerts were turned on or changed (a parent's family-code sign-in, or a coach).
-- It's how a reminder knows which child the phone is for. Nothing else about the parent is stored.
alter table na_u11_wildcats.push_subs add column if not exists uid uuid references auth.users(id) on delete set null;
alter table na_u11_wildcats.push_subs add column if not exists coach boolean not null default false;   -- a coach's phone
alter table na_u11_wildcats.push_subs add column if not exists avail boolean not null default false;   -- a coach wants availability answers

drop function if exists na_u11_wildcats.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean);
create or replace function na_u11_wildcats.push_subscribe2(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean,
                                                  p_goals boolean, p_results boolean, p_avail boolean default null)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
declare c boolean := na_u11_wildcats.is_coach();
begin
  perform na_u11_wildcats.push_subscribe(p_endpoint, p_p256dh, p_auth, p_reminders, p_live);  -- checks it's a real push address
  update na_u11_wildcats.push_subs set goals = coalesce(p_goals, false), results = coalesce(p_results, false),
    uid = auth.uid(), coach = c,
    avail = c and (case when p_avail is null then avail else p_avail end)   -- null: an older page that doesn't know about it
  where endpoint = p_endpoint;
end $$;
revoke all on function na_u11_wildcats.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function na_u11_wildcats.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;

-- ---------- Training availability ----------
create table if not exists na_u11_wildcats.training_availability(
  day     date not null,
  player  text not null,
  status  text not null check (status in ('yes','no','maybe')),
  updated timestamptz not null default now(),
  primary key(day, player)
);
alter table na_u11_wildcats.training_availability enable row level security;
drop policy if exists "coaches read training availability" on na_u11_wildcats.training_availability;
create policy "coaches read training availability" on na_u11_wildcats.training_availability for select using (na_u11_wildcats.is_coach());
drop policy if exists "coaches write training availability" on na_u11_wildcats.training_availability;
create policy "coaches write training availability" on na_u11_wildcats.training_availability for all to authenticated using (na_u11_wildcats.is_coach()) with check (na_u11_wildcats.is_coach());
-- anon can "read" it (and gets no rows): that's how the site knows the feature is switched on
grant select on na_u11_wildcats.training_availability to anon, authenticated;
grant insert, update, delete on na_u11_wildcats.training_availability to authenticated;
revoke insert, update, delete, truncate on na_u11_wildcats.training_availability from anon;

-- a parent answers for their own child (or anyone, while "parents must sign in" is off), for a real upcoming session
create or replace function na_u11_wildcats.set_training_availability(p_day date, p_player text, p_status text)
returns void language plpgsql security definer set search_path = na_u11_wildcats as $$
declare t na_u11_wildcats.training;
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (na_u11_wildcats.is_coach() or na_u11_wildcats.is_parent_of(p_player) or not na_u11_wildcats.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  select * into t from na_u11_wildcats.training where id = 1;
  if t.id is null or p_day < current_date - 1 or p_day > current_date + 60 or trim(to_char(p_day, 'Day')) <> t.day
     or p_day = any(t.off) or (t.until is not null and p_day > t.until) then
    raise exception 'unknown training session';
  end if;
  if not exists (select 1 from na_u11_wildcats.players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into na_u11_wildcats.training_availability(day, player, status, updated) values (p_day, p_player, p_status, now())
  on conflict (day, player) do update set status = excluded.status, updated = now();
end $$;
grant execute on function na_u11_wildcats.set_training_availability(date, text, text) to anon, authenticated;

-- this phone's own training answers
create or replace function na_u11_wildcats.my_training_availability() returns table(day date, player text, status text)
language sql stable security definer set search_path = na_u11_wildcats as $$
  select a.day, a.player, a.status from na_u11_wildcats.training_availability a where a.day >= current_date - 1 and na_u11_wildcats.is_parent_of(a.player);
$$;
revoke execute on function na_u11_wildcats.my_training_availability() from public, anon;
grant execute on function na_u11_wildcats.my_training_availability() to authenticated;

-- ---------- Used by the notify edge function only ----------
-- Once-only and changed-since-sent markers, keyed by text in push_log:
--   "av:<match>|<player>" and "tav:<day>|<player>": the answer last sent to coaches
--   "avr:<match>" and "trr:<day>": the reminder to answer has gone
alter table na_u11_wildcats.push_log add column if not exists note_sent text;
create or replace function na_u11_wildcats.push_claim_note(p_key text, p_value text)
returns boolean language plpgsql security definer set search_path = na_u11_wildcats as $$
begin
  insert into na_u11_wildcats.push_log (match_id) values (p_key) on conflict do nothing;
  update na_u11_wildcats.push_log set note_sent = p_value where match_id = p_key and note_sent is distinct from p_value;
  return found;
end $$;
revoke all on function na_u11_wildcats.push_claim_note(text, text) from public, anon, authenticated;

-- phones of current coaches who asked for availability answers
create or replace function na_u11_wildcats.avail_coach_targets()
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = na_u11_wildcats as $$
  select s.endpoint, s.p256dh, s.auth from na_u11_wildcats.push_subs s
  join auth.users u on u.id = s.uid
  where s.avail and exists (select 1 from na_u11_wildcats.coaches c where c.email = lower(u.email));
$$;
revoke all on function na_u11_wildcats.avail_coach_targets() from public, anon, authenticated;

-- who to remind about a game (p_match) or a training session (p_day), and which of their children haven't answered.
-- Phones with Reminders on, not coaches. Signed-in phones: only while one of their own children is still to answer.
-- Phones not signed in: while anyone is still to answer (kids is then empty).
create or replace function na_u11_wildcats.avail_reminder_targets(p_match text, p_day date)
returns table(endpoint text, p256dh text, auth text, kids text[])
language sql stable security definer set search_path = na_u11_wildcats as $$
  with waiting as (
    select p.id, p.name, p.num from na_u11_wildcats.players p
    where p.current
      and not (p_match is not null and exists (select 1 from na_u11_wildcats.availability a where a.match_id = p_match and a.player = p.name))
      and not (p_day is not null and exists (select 1 from na_u11_wildcats.training_availability t where t.day = p_day and t.player = p.name))
  )
  select s.endpoint, s.p256dh, s.auth, x.kids
  from na_u11_wildcats.push_subs s
  cross join lateral (
    select count(*) as linked,
           coalesce(array_agg(w.name order by w.num nulls last, w.name) filter (where w.id is not null), '{}') as kids
    from na_u11_wildcats.parent_links l
    join na_u11_wildcats.players p on p.id = l.player_id and p.current
    left join waiting w on w.id = p.id
    where s.uid is not null and l.uid = s.uid
  ) x
  where s.reminders and not s.coach
    and case when x.linked > 0 then cardinality(x.kids) > 0 else exists (select 1 from waiting) end;
$$;
revoke all on function na_u11_wildcats.avail_reminder_targets(text, date) from public, anon, authenticated;

-- The team's name and alert settings for the notify function, for a team that shares this project in its own schema
-- (the project's own team uses the notify function's secrets). Same shape as TEAM in team.js:
-- {"name": "...", "ageGroup": "...", "publicScores": false, "sport": "football", "potm": {"sponsor": "", "icon": "🏆"}}
create table if not exists na_u11_wildcats.alert_team(
  id       int primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb
);
alter table na_u11_wildcats.alert_team enable row level security;   -- no policies: only the edge function reads it
revoke all on na_u11_wildcats.alert_team from anon, authenticated;

