-- Added 2026-11: how many coaches and parents use the site. One row per signed-in person per day: a coach, or a
-- parent's phone linked by a family code. Plain visitors are already counted in page_views (1_schema.sql).
-- Only the user id, the day and how many times the site was opened that day are kept, never names or emails.
-- Coaches see the totals on the home page's Website visits card (active_summary); the rows themselves are hidden.
-- Safe to re-run.
create table if not exists public.active_days(
  day date not null default (now() at time zone 'Europe/London')::date,
  uid uuid not null,
  role text not null check (role in ('coach', 'parent')),
  opens int not null default 1,
  primary key (day, uid));
alter table public.active_days enable row level security;   -- no policies: only the functions below touch it
revoke all on public.active_days from anon, authenticated;

-- the site calls this once per page load when someone is signed in
create or replace function public.log_active() returns void
language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if auth.uid() is null then return; end if;
  if public.is_coach() then r := 'coach';
  elsif exists (select 1 from public.parent_links where uid = auth.uid()) then r := 'parent';
  else return; end if;
  insert into public.active_days as a (day, uid, role) values ((now() at time zone 'Europe/London')::date, auth.uid(), r)
  on conflict (day, uid) do update set opens = a.opens + 1, role = excluded.role;
end $$;

-- coaches only: people signed in per day, plus how many different coaches and parents overall and in the last 7 days
create or replace function public.active_summary() returns json
language sql stable security definer set search_path = public as $$
  select case when not public.is_coach() then null else json_build_object(
    'since', (select min(day) from public.active_days),
    'days', coalesce((select json_agg(d order by d.day) from (
        select day, count(*) filter (where role = 'coach') as coaches, count(*) filter (where role = 'parent') as parents,
               coalesce(sum(opens), 0) as opens
        from public.active_days group by day) d), '[]'::json),
    'coaches', (select count(distinct uid) from public.active_days where role = 'coach'),
    'parents', (select count(distinct uid) from public.active_days where role = 'parent'),
    'coaches7', (select count(distinct uid) from public.active_days where role = 'coach' and day > (now() at time zone 'Europe/London')::date - 7),
    'parents7', (select count(distinct uid) from public.active_days where role = 'parent' and day > (now() at time zone 'Europe/London')::date - 7))
  end;
$$;
revoke execute on function public.log_active(), public.active_summary() from public, anon;
grant execute on function public.log_active(), public.active_summary() to authenticated;

-- a head start from what's already known: the day each parent's phone was linked, and each coach's latest sign-in
insert into public.active_days (day, uid, role)
  select distinct (linked at time zone 'Europe/London')::date, uid, 'parent' from public.parent_links where linked is not null
  on conflict do nothing;
insert into public.active_days (day, uid, role)
  select (u.last_sign_in_at at time zone 'Europe/London')::date, u.id, 'coach'
  from auth.users u join public.coaches c on c.email = lower(u.email)
  where u.last_sign_in_at is not null and not coalesce(u.is_anonymous, false)
  on conflict do nothing;
