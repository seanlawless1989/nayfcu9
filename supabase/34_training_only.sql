-- Added 2026-11-07: Training-only players. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 34_training_only.sql).
-- Needs 16_availability_alerts.sql.
-- A training-only player (players.training = true) is in the squad for training: family code, training availability,
-- training reminders, birthdays and kit sizes all work. They are left out of everything to do with games: game and
-- tournament availability, Pick squad, the live match screen, stats, votes and graphics. A coach sets it on the
-- Squad page (In squad / Training only / Left). For a new player who isn't registered to play games yet.
alter table public.players add column if not exists training boolean not null default false;

-- as in 16_availability_alerts.sql, but a game reminder (p_match) skips training-only players
create or replace function public.avail_reminder_targets(p_match text, p_day date)
returns table(endpoint text, p256dh text, auth text, kids text[])
language sql stable security definer set search_path = public as $$
  with waiting as (
    select p.id, p.name, p.num from public.players p
    where p.current
      and not (p_match is not null and p.training)
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
