-- Added 2026-11-01: coaches answer availability for any player. Safe to re-run. Run it on every team's database
-- (and for every team schema, tools/team_schema_sql.py --only 22_coach_availability.sql).
-- A parent often tells the coach on WhatsApp or at training instead of using the site. A signed-in coach can now set
-- (or change, or clear) any current player's answer for a game or training, and it counts exactly like the parent's:
-- Pick squad, the "not answered yet" list and the reminders all use it, and a parent signed in with the family code
-- sees the answer on their own phone.
-- by_coach marks an answer a coach set, so the coaches can see who said it. A parent answering again clears the mark.

alter table public.availability add column if not exists by_coach boolean not null default false;
alter table public.training_availability add column if not exists by_coach boolean not null default false;

create or replace function public.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare c boolean := public.is_coach();
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (c or public.is_parent_of(p_player) or not public.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  if not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated, by_coach) values (p_match, p_player, p_status, now(), c)
  on conflict (match_id, player) do update set status = excluded.status, updated = now(), by_coach = excluded.by_coach;
end $$;
grant execute on function public.set_availability(text,text,text) to anon, authenticated;

create or replace function public.set_training_availability(p_day date, p_player text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.training; c boolean := public.is_coach();
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (c or public.is_parent_of(p_player) or not public.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  select * into t from public.training where id = 1;
  if t.id is null or p_day < current_date - 1 or p_day > current_date + 60 or trim(to_char(p_day, 'Day')) <> t.day
     or p_day = any(t.off) or (t.until is not null and p_day > t.until) then
    raise exception 'unknown training session';
  end if;
  if not exists (select 1 from public.players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into public.training_availability(day, player, status, updated, by_coach) values (p_day, p_player, p_status, now(), c)
  on conflict (day, player) do update set status = excluded.status, updated = now(), by_coach = excluded.by_coach;
end $$;
grant execute on function public.set_training_availability(date, text, text) to anon, authenticated;
