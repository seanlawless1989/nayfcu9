-- Added 2026-11-11: each login on the coaches list says whether they coach at games and training, or are an admin
-- (they run the site but don't come to games, e.g. a club secretary). Safe to re-run. Run it on every team's
-- database (and for every team schema, tools/team_schema_sql.py --only 37_coach_roles.sql).
-- Admins keep everything a coach can do on the site; they just aren't asked whether they can make each game or
-- training session, and they don't show in the coaches' "not answered yet" list. Blank = not chosen yet (shown as a coach).
alter table public.coaches add column if not exists coach_role text check (coach_role in ('coach','admin'));

drop function if exists public.coach_team();
create or replace function public.coach_team()
returns table(email text, name text, role text)
language sql stable security definer set search_path = public as $$
  select c.email, coalesce(c.name, ''), coalesce(c.coach_role, '') from public.coaches c where public.is_coach() order by c.email;
$$;

-- the signed-in login says what they are (also saved on sister sites that share the coach list)
create or replace function public.set_my_coach_role(p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare em text := lower(auth.jwt() ->> 'email'); s text;
begin
  if not public.is_coach() then raise exception 'Only coaches can do this'; end if;
  if p_role not in ('coach','admin') then raise exception 'bad role'; end if;
  update public.coaches set coach_role = p_role where email = em;
  if p_role = 'admin' then delete from public.coach_availability where email = em; end if;
  if to_regclass('public.coach_share') is not null then
    for s in execute 'select schema_name from public.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists coach_role text', s);
        execute format('update %I.coaches set coach_role = $1 where email = $2', s) using p_role, em;
      end if;
    end loop;
  end if;
end $$;

revoke execute on function public.coach_team(), public.set_my_coach_role(text) from public, anon;
grant execute on function public.coach_team(), public.set_my_coach_role(text) to authenticated;
