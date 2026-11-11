-- Added 2026-11-11: coaches say whether THEY can make each game, tournament and training session. Safe to re-run.
-- Run it on every team's database (and for every team schema, tools/team_schema_sql.py --only 36_coach_own_availability.sql).
-- Players' answers stay in availability / training_availability. This is the coaches' own answers, one row per coach
-- per thing: item is the match id for a game, "t:<tournament id>" for a tournament, "tr:<yyyy-mm-dd>" for training.
-- Only signed-in coaches can see or set them, and only through the functions below.
alter table public.coaches add column if not exists name text;   -- first name shown to the other coaches

create table if not exists public.coach_availability (
  item    text not null,
  email   text not null,
  status  text not null check (status in ('yes','no','maybe')),
  updated timestamptz not null default now(),
  primary key (item, email));
alter table public.coach_availability enable row level security;   -- no policies: functions only
revoke all on public.coach_availability from anon, authenticated;

-- every coach's answers for things still to come, with the name they gave (blank = use the email)
create or replace function public.coach_availability_list()
returns table(item text, email text, name text, status text)
language sql stable security definer set search_path = public as $$
  select a.item, a.email, coalesce(c.name, ''), a.status
  from public.coach_availability a left join public.coaches c on c.email = a.email
  where public.is_coach()
    and (case when a.item like 'tr:%' then substr(a.item, 4) >= to_char(current_date - 1, 'YYYY-MM-DD')
              when a.item like 't:%' then exists (select 1 from public.tournaments t where t.id = substr(a.item, 3)
                                                  and coalesce(t.date, current_date) >= current_date - 7)
              else exists (select 1 from public.matches m where m.id = a.item and m.date >= current_date - 1) end);
$$;

-- the team's coaches and their names, so the site can show who hasn't answered yet
create or replace function public.coach_team()
returns table(email text, name text)
language sql stable security definer set search_path = public as $$
  select c.email, coalesce(c.name, '') from public.coaches c where public.is_coach() order by c.email;
$$;

-- the signed-in coach answers for themselves; p_status null or '' clears the answer
create or replace function public.set_coach_availability(p_item text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare em text := lower(auth.jwt() ->> 'email'); d date;
begin
  if not public.is_coach() then raise exception 'Only coaches can do this'; end if;
  if coalesce(p_status, '') = '' then delete from public.coach_availability where item = p_item and email = em; return; end if;
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if p_item like 'tr:%' then
    begin d := substr(p_item, 4)::date; exception when others then raise exception 'unknown training session'; end;
    if d < current_date - 1 or d > current_date + 120 then raise exception 'unknown training session'; end if;
  elsif p_item like 't:%' then
    if not exists (select 1 from public.tournaments where id = substr(p_item, 3)) then raise exception 'unknown tournament'; end if;
  elsif not exists (select 1 from public.matches where id = p_item and date >= current_date - 1) then
    raise exception 'unknown fixture';
  end if;
  insert into public.coach_availability(item, email, status, updated) values (p_item, em, p_status, now())
  on conflict (item, email) do update set status = excluded.status, updated = now();
end $$;

-- the name other coaches see next to your answers (also saved on sister sites that share the coach list)
create or replace function public.set_my_coach_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare em text := lower(auth.jwt() ->> 'email'); nm text := nullif(left(trim(coalesce(p_name, '')), 40), ''); s text;
begin
  if not public.is_coach() then raise exception 'Only coaches can do this'; end if;
  update public.coaches set name = nm where email = em;
  if to_regclass('public.coach_share') is not null then
    for s in execute 'select schema_name from public.coach_share' loop
      if to_regclass(format('%I.coaches', s)) is not null then
        execute format('alter table %I.coaches add column if not exists name text', s);
        execute format('update %I.coaches set name = $1 where email = $2', s) using nm, em;
      end if;
    end loop;
  end if;
end $$;

revoke execute on function public.coach_availability_list(), public.coach_team(), public.set_coach_availability(text, text), public.set_my_coach_name(text) from public, anon;
grant execute on function public.coach_availability_list(), public.coach_team(), public.set_coach_availability(text, text), public.set_my_coach_name(text) to authenticated;
