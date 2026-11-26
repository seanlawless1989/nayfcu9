-- Added 2026-11-26: team events in the diary (presentation night, fundraiser, Christmas party, team social, meeting...).
-- Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 46_team_events.sql), then redeploy the
-- notify and calendar edge functions. The site works before this is run: the Add an event button says it isn't on yet.
--
-- An event shows in Fixtures with the games, tournaments and training, on the home page while it's coming up, and in the
-- calendar feed. Like the fixtures and the training details, events are for anyone with the link (no names in them).
-- With "Ask who's coming" on, parents answer Yes/Maybe/No for their child in the usual availability table with
-- match_id "e:<event id>", so the coach counts, Set answers, Chase replies, Ask by push and coach alerts work the same
-- way as games. Training-only players are asked too (a party is for everyone).

create table if not exists public.team_events(
  id      text primary key check (id ~ '^[a-z0-9-]{4,60}$'),
  kind    text not null default 'other' check (kind in ('presentation','fundraiser','party','social','meeting','other')),
  title   text not null check (length(btrim(title)) between 1 and 80),
  date    date not null,
  start   text not null default '' check (length(start) <= 5),
  finish  text not null default '' check (length(finish) <= 5),
  venue   text not null default '' check (length(venue) <= 160),
  cost    text not null default '' check (length(cost) <= 60),
  details text not null default '' check (length(details) <= 1500),
  rsvp    boolean not null default true,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);
alter table public.team_events enable row level security;
drop policy if exists "events read" on public.team_events;
create policy "events read" on public.team_events for select to anon, authenticated using (true);
drop policy if exists "events coaches write" on public.team_events;
create policy "events coaches write" on public.team_events for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.team_events from anon, public;
grant select on public.team_events to anon;
grant select, insert, update, delete on public.team_events to authenticated;

-- availability answers now also take "e:<event id>" (an event that asks who's coming, until the day after)
create or replace function public.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare c boolean := public.is_coach();
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (c or public.is_parent_of(p_player) or not public.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  if p_match like 't:%' then
    if not exists (select 1 from public.tournaments where id = substr(p_match, 3)
                   and greatest(date, end_date) >= current_date - 1) then raise exception 'unknown fixture'; end if;
  elsif p_match like 'e:%' then
    if not exists (select 1 from public.team_events where id = substr(p_match, 3) and rsvp
                   and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  elsif not exists (select 1 from public.matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from public.players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into public.availability(match_id, player, status, updated, by_coach) values (p_match, p_player, p_status, now(), c)
  on conflict (match_id, player) do update set status = excluded.status, updated = now(), by_coach = excluded.by_coach;
end $$;
grant execute on function public.set_availability(text,text,text) to anon, authenticated;

-- "Ask by push" for an event also reaches families of training-only players (34_training_only.sql left them out of games)
create or replace function public.avail_reminder_targets(p_match text, p_day date)
returns table(endpoint text, p256dh text, auth text, kids text[])
language sql stable security definer set search_path = public as $$
  with waiting as (
    select p.id, p.name, p.num from public.players p
    where p.current
      and not (p_match is not null and p_match not like 'e:%' and p.training)
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
notify pgrst, 'reload schema';
