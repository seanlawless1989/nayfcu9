-- Added 2026-11-04: parents (and coaches) answer availability for a whole tournament, just like a game. Safe to re-run.
-- Run it on every team's database (and for every team schema, tools/team_schema_sql.py --only 30_tournament_availability.sql).
-- The answers go in the usual availability table with match_id "t:<tournament id>", so the coach counts, "not answered
-- yet", Chase replies, Pick squad, coach alerts and the Wednesday reminders all work the same way. Answers stay open
-- until the tournament's last day is over. Nothing else changes: the table, its RLS and my_availability() already
-- take any match_id.

create or replace function public.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare c boolean := public.is_coach();
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (c or public.is_parent_of(p_player) or not public.parents_required()) then
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
grant execute on function public.set_availability(text,text,text) to anon, authenticated;
notify pgrst, 'reload schema';
