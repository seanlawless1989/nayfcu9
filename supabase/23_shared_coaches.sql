-- Added 2026-11: sister teams whose coaches run both sites share one coach list.
-- Team setup step 5 already writes public.coaches, which is the list sign-in checks (the sign-up check and
-- is_coach), so a coach added there can sign in straight away. This adds public.coach_share: the schemas of other
-- teams in this project that use the same coaches (e.g. Newton Aycliffe U11s Wildcats and Pumas). Adding or removing
-- a coach on one site then does the same on the others. Only the database owner fills coach_share in; the site
-- can't read or change it. Safe to re-run.
create table if not exists public.coach_share (schema_name text primary key);
alter table public.coach_share enable row level security;   -- no policies: hidden from the site
revoke all on public.coach_share from anon, authenticated;

create or replace function public.add_coach(new_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(coalesce(new_email, ''))); s text;
begin
  if not public.is_coach() then raise exception 'Only coaches can add coaches'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email address'; end if;
  insert into public.coaches (email) values (em) on conflict do nothing;
  for s in select schema_name from public.coach_share loop
    if to_regclass(format('%I.coaches', s)) is not null then
      execute format('insert into %I.coaches (email) values ($1) on conflict do nothing', s) using em;
    end if;
  end loop;
end $$;

create or replace function public.remove_coach(old_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(coalesce(old_email, ''))); s text;
begin
  if not public.is_coach() then raise exception 'Only coaches can remove coaches'; end if;
  if em = lower(auth.jwt() ->> 'email') then raise exception 'You can''t remove yourself'; end if;
  delete from public.coaches where email = em;
  for s in select schema_name from public.coach_share loop
    if to_regclass(format('%I.coaches', s)) is not null then
      execute format('delete from %I.coaches where email = $1', s) using em;
    end if;
  end loop;
end $$;

-- which sites a coach added here also goes on (Team setup shows it), as site names are not stored: just a count
create or replace function public.coach_share_count() returns int
language sql stable security definer set search_path = public as $$
  select case when public.is_coach() then (select count(*)::int from public.coach_share) else 0 end;
$$;
revoke execute on function public.add_coach(text), public.remove_coach(text), public.coach_share_count() from public, anon;
grant execute on function public.add_coach(text), public.remove_coach(text), public.coach_share_count() to authenticated;
