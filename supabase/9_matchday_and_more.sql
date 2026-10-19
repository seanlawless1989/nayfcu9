-- Added 2026-10-19: matchday details, postponement alerts, alert choices, training attendance and parent votes.
-- Safe to re-run. Run it once on every team's database (SQL editor), then redeploy the notify edge function.

-- ---------- Matchday details on each fixture ----------
-- {"meet": "09:45", "kit": "home" (a key of TEAM.kits) or "Training kit", "pitch": "3", "postcode": "DL1 4PZ"}
-- The postcode is only used on the parent's phone for directions and the kick-off weather forecast.
alter table public.matches add column if not exists matchday jsonb;

-- ---------- "Postponed" alert, sent once when a coach marks an upcoming game postponed ----------
alter table public.push_log add column if not exists postponed_sent boolean not null default false;
create or replace function public.push_claim_postponed(p_match text, p_postponed boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_log (match_id) values (p_match) on conflict do nothing;
  if not p_postponed then  -- back on: a later postponement can alert again
    update public.push_log set postponed_sent = false where match_id = p_match; return false;
  end if;
  update public.push_log set postponed_sent = true where match_id = p_match and not postponed_sent;
  return found;
end $$;
revoke all on function public.push_claim_postponed(text, boolean) from public, anon, authenticated;

-- ---------- Alert choices per phone ----------
-- reminders (squad, kick-off, postponed) and live (everything on match day) were already there.
-- goals: just the goals. results: full time and player of the match. "live" still covers both.
alter table public.push_subs add column if not exists goals boolean not null default false;
alter table public.push_subs add column if not exists results boolean not null default false;
create or replace function public.push_subscribe2(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean, p_goals boolean, p_results boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.push_subscribe(p_endpoint, p_p256dh, p_auth, p_reminders, p_live);  -- checks it's a real push address
  update public.push_subs set goals = coalesce(p_goals, false), results = coalesce(p_results, false) where endpoint = p_endpoint;
end $$;
revoke all on function public.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean) from public;
grant execute on function public.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean) to anon, authenticated;

-- ---------- Training attendance (coaches only) ----------
-- One row per player who came to a session. Shown to coaches next to playing time, never to parents.
create table if not exists public.training_attendance(
  day     date not null,
  player  text not null,
  updated timestamptz not null default now(),
  primary key(day, player)
);
alter table public.training_attendance enable row level security;
drop policy if exists "coaches read attendance" on public.training_attendance;
create policy "coaches read attendance" on public.training_attendance for select to authenticated using (public.is_coach());
drop policy if exists "coaches write attendance" on public.training_attendance;
create policy "coaches write attendance" on public.training_attendance for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select, insert, update, delete on public.training_attendance to authenticated;
revoke all on public.training_attendance from anon;

-- ---------- Parent votes: goal of the month, players' player of the season ----------
-- Coaches open a vote with a list of choices (first names only). Each phone gets one vote, using a random id kept
-- on that phone; nothing about the parent is stored. Totals are shown to coaches, and to everyone once the vote closes.
create table if not exists public.polls(
  id       text primary key,
  kind     text not null default 'other',        -- gotm, potss or other
  title    text not null,
  options  jsonb not null default '[]'::jsonb,   -- ["Jack v Meadow Park (23')", ...]
  closes   timestamptz,                           -- voting stops then (blank = until a coach closes it)
  closed   boolean not null default false,
  created  timestamptz not null default now()
);
alter table public.polls enable row level security;
drop policy if exists "everyone reads polls" on public.polls;
create policy "everyone reads polls" on public.polls for select using (true);
drop policy if exists "coaches write polls" on public.polls;
create policy "coaches write polls" on public.polls for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.polls to anon, authenticated;
grant insert, update, delete on public.polls to authenticated;

create table if not exists public.poll_votes(
  poll_id text not null,
  voter   text not null,      -- a random id made on the phone
  choice  int  not null,
  updated timestamptz not null default now(),
  primary key(poll_id, voter)
);
alter table public.poll_votes enable row level security;   -- no policies: votes only go in through cast_vote
revoke all on public.poll_votes from anon, authenticated;

create or replace function public.cast_vote(p_poll text, p_voter text, p_choice int)
returns void language plpgsql security definer set search_path = public as $$
declare p public.polls;
begin
  select * into p from public.polls where id = p_poll;
  if p.id is null or p.closed or (p.closes is not null and p.closes < now()) then raise exception 'This vote has closed'; end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(p.options) then raise exception 'bad choice'; end if;
  if length(p_voter) < 16 or length(p_voter) > 64 then raise exception 'bad voter'; end if;
  insert into public.poll_votes(poll_id, voter, choice) values (p_poll, p_voter, p_choice)
  on conflict (poll_id, voter) do update set choice = excluded.choice, updated = now();
end $$;
grant execute on function public.cast_vote(text, text, int) to anon, authenticated;

-- totals per choice: coaches any time, everyone else once the vote has closed
create or replace function public.poll_totals(p_poll text)
returns table(choice int, votes bigint) language sql security definer set search_path = public as $$
  select v.choice, count(*) from public.poll_votes v join public.polls p on p.id = v.poll_id
  where v.poll_id = p_poll and (public.is_coach() or p.closed or (p.closes is not null and p.closes < now()))
  group by v.choice;
$$;
grant execute on function public.poll_totals(text) to anon, authenticated;

-- ---------- Sponsor report (coaches only) ----------
-- One row each time a coach saves or copies a matchday graphic, with the sponsors drawn on it.
-- Put next to website visits (page_views) it shows a sponsor how often they were seen.
create table if not exists public.post_log(
  id       bigint generated always as identity primary key,
  day      date not null default (now() at time zone 'Europe/London')::date,
  kind     text not null,                         -- squad, ft, potm, month, ms
  sponsors text[] not null default '{}',
  created  timestamptz not null default now()
);
alter table public.post_log enable row level security;
drop policy if exists "coaches read post log" on public.post_log;
create policy "coaches read post log" on public.post_log for select to authenticated using (public.is_coach());
drop policy if exists "coaches add to post log" on public.post_log;
create policy "coaches add to post log" on public.post_log for insert to authenticated with check (public.is_coach());
grant select, insert on public.post_log to authenticated;
revoke all on public.post_log from anon;
