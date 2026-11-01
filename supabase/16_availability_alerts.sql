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
alter table public.push_subs add column if not exists uid uuid references auth.users(id) on delete set null;
alter table public.push_subs add column if not exists coach boolean not null default false;   -- a coach's phone
alter table public.push_subs add column if not exists avail boolean not null default false;   -- a coach wants availability answers

drop function if exists public.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean);
create or replace function public.push_subscribe2(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean,
                                                  p_goals boolean, p_results boolean, p_avail boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare c boolean := public.is_coach();
begin
  perform public.push_subscribe(p_endpoint, p_p256dh, p_auth, p_reminders, p_live);  -- checks it's a real push address
  update public.push_subs set goals = coalesce(p_goals, false), results = coalesce(p_results, false),
    uid = auth.uid(), coach = c,
    avail = c and (case when p_avail is null then avail else p_avail end)   -- null: an older page that doesn't know about it
  where endpoint = p_endpoint;
end $$;
revoke all on function public.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;

-- ---------- Training availability ----------
create table if not exists public.training_availability(
  day     date not null,
  player  text not null,
  status  text not null check (status in ('yes','no','maybe')),
  updated timestamptz not null default now(),
  primary key(day, player)
);
alter table public.training_availability enable row level security;
drop policy if exists "coaches read training availability" on public.training_availability;
create policy "coaches read training availability" on public.training_availability for select using (public.is_coach());
drop policy if exists "coaches write training availability" on public.training_availability;
create policy "coaches write training availability" on public.training_availability for all to authenticated using (public.is_coach()) with check (public.is_coach());
-- anon can "read" it (and gets no rows): that's how the site knows the feature is switched on
grant select on public.training_availability to anon, authenticated;
grant insert, update, delete on public.training_availability to authenticated;
revoke insert, update, delete, truncate on public.training_availability from anon;

-- a parent answers for their own child (or anyone, while "parents must sign in" is off), for a real upcoming session
create or replace function public.set_training_availability(p_day date, p_player text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.training;
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (public.is_coach() or public.is_parent_of(p_player) or not public.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  select * into t from public.training where id = 1;
  if t.id is null or p_day < current_date - 1 or p_day > current_date + 60 or trim(to_char(p_day, 'Day')) <> t.day
     or p_day = any(t.off) or (t.until is not null and p_day > t.until) then
    raise exception 'unknown training session';
  end if;
  if not exists (select 1 from public.players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into public.training_availability(day, player, status, updated) values (p_day, p_player, p_status, now())
  on conflict (day, player) do update set status = excluded.status, updated = now();
end $$;
grant execute on function public.set_training_availability(date, text, text) to anon, authenticated;

-- this phone's own training answers
create or replace function public.my_training_availability() returns table(day date, player text, status text)
language sql stable security definer set search_path = public as $$
  select a.day, a.player, a.status from public.training_availability a where a.day >= current_date - 1 and public.is_parent_of(a.player);
$$;
revoke execute on function public.my_training_availability() from public, anon;
grant execute on function public.my_training_availability() to authenticated;

-- ---------- Used by the notify edge function only ----------
-- Once-only and changed-since-sent markers, keyed by text in push_log:
--   "av:<match>|<player>" and "tav:<day>|<player>": the answer last sent to coaches
--   "avr:<match>" and "trr:<day>": the reminder to answer has gone
alter table public.push_log add column if not exists note_sent text;
create or replace function public.push_claim_note(p_key text, p_value text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_log (match_id) values (p_key) on conflict do nothing;
  update public.push_log set note_sent = p_value where match_id = p_key and note_sent is distinct from p_value;
  return found;
end $$;
revoke all on function public.push_claim_note(text, text) from public, anon, authenticated;

-- phones of current coaches who asked for availability answers
create or replace function public.avail_coach_targets()
returns table(endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.p256dh, s.auth from public.push_subs s
  join auth.users u on u.id = s.uid
  where s.avail and exists (select 1 from public.coaches c where c.email = lower(u.email));
$$;
revoke all on function public.avail_coach_targets() from public, anon, authenticated;

-- who to remind about a game (p_match) or a training session (p_day), and which of their children haven't answered.
-- Phones with Reminders on, not coaches, signed in with a family code, and only while one of their own children is
-- still to answer. Phones not signed in never get one: they could be anyone's (grandparents, fans).
create or replace function public.avail_reminder_targets(p_match text, p_day date)
returns table(endpoint text, p256dh text, auth text, kids text[])
language sql stable security definer set search_path = public as $$
  with waiting as (
    select p.id, p.name, p.num from public.players p
    where p.current
      and not (p_match is not null and exists (select 1 from public.availability a where a.match_id = p_match and a.player = p.name))
      and not (p_day is not null and exists (select 1 from public.training_availability t where t.day = p_day and t.player = p.name))
  )
  select s.endpoint, s.p256dh, s.auth, x.kids
  from public.push_subs s
  cross join lateral (
    select count(*) as linked,
           coalesce(array_agg(w.name order by w.num nulls last, w.name) filter (where w.id is not null), '{}') as kids
    from public.parent_links l
    join public.players p on p.id = l.player_id and p.current
    left join waiting w on w.id = p.id
    where s.uid is not null and l.uid = s.uid
  ) x
  where s.reminders and not s.coach
    and x.linked > 0 and cardinality(x.kids) > 0;   -- only phones signed in with a family code (Sean, 31 Oct)
$$;
revoke all on function public.avail_reminder_targets(text, date) from public, anon, authenticated;

-- The team's name and alert settings for the notify function, for a team that shares this project in its own schema
-- (the project's own team uses the notify function's secrets). Same shape as TEAM in team.js:
-- {"name": "...", "ageGroup": "...", "publicScores": false, "sport": "football", "potm": {"sponsor": "", "icon": "⭐"}}
create table if not exists public.alert_team(
  id       int primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb
);
alter table public.alert_team enable row level security;   -- no policies: only the edge function reads it
revoke all on public.alert_team from anon, authenticated;

-- [project only] (left out of team schemas by tools/team_schema_sql.py)
-- The team schemas in this project that have match alerts tables, so the every-minute job covers them too.
create or replace function public.alert_schemas() returns setof text
language sql stable security definer set search_path = public as $$
  select schemaname::text from pg_tables where tablename = 'push_subs' and schemaname <> 'public' order by 1;
$$;
revoke all on function public.alert_schemas() from public, anon, authenticated;
-- [end project only]
