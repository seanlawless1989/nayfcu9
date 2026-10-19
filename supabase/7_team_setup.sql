-- Added 2026-10-19: Team setup, filled in by a coach on the site instead of editing team.js. Safe to re-run.
-- The site reads team_settings on load and lays it over docs/team.js, so a coach's answers show straight away.
-- A new team's row starts with ready = false: visitors see "being set up" until a coach finishes setup,
-- including the welfare officer's sign-off. With no row at all (Newton Aycliffe), the site just uses team.js.

-- ---------- What the site looks like ----------
create table if not exists public.team_settings(
  id         int primary key default 1 check (id = 1),
  settings   jsonb not null default '{}'::jsonb,   -- same shape as TEAM in team.js (name, colours, crest as a data URL, kits...)
  ready      boolean not null default false,       -- false: only coaches see the site
  updated    timestamptz not null default now(),
  updated_by text default ''
);
alter table public.team_settings enable row level security;
drop policy if exists "everyone reads team settings" on public.team_settings;
create policy "everyone reads team settings" on public.team_settings for select using (true);
drop policy if exists "coaches write team settings" on public.team_settings;
create policy "coaches write team settings" on public.team_settings for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.team_settings to anon, authenticated;
grant insert, update on public.team_settings to authenticated;
revoke insert, update, delete, truncate on public.team_settings from anon;

-- ---------- Welfare sign-off and terms (coaches only, never public) ----------
create table if not exists public.team_signoff(
  id               int primary key default 1 check (id = 1),
  welfare_name     text not null default '',
  welfare_email    text not null default '',
  public_scores    boolean not null default false,
  welfare_agreed   boolean not null default false,   -- the welfare officer has read how children's details are handled and agreed
  terms_agreed     boolean not null default false,
  dpa_agreed       boolean not null default false,   -- data processing agreement: the club is the controller
  agreed_by        text not null default '',          -- name and role of the person agreeing for the club
  coach_email      text not null default lower(auth.jwt() ->> 'email'),
  agreed_at        timestamptz not null default now()
);
alter table public.team_signoff enable row level security;
drop policy if exists "coaches read signoff" on public.team_signoff;
create policy "coaches read signoff" on public.team_signoff for select to authenticated using (public.is_coach());
drop policy if exists "coaches write signoff" on public.team_signoff;
create policy "coaches write signoff" on public.team_signoff for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.team_signoff from anon;
grant select, insert, update on public.team_signoff to authenticated;

-- ---------- Coaches can manage the coach list from the site ----------
create or replace function public.list_coaches() returns setof text
language sql stable security definer set search_path = public as $$
  select email from public.coaches where public.is_coach() order by email;
$$;
create or replace function public.add_coach(new_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() then raise exception 'Only coaches can add coaches'; end if;
  if coalesce(new_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email address'; end if;
  insert into public.coaches (email) values (lower(trim(new_email))) on conflict do nothing;
end $$;
create or replace function public.remove_coach(old_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() then raise exception 'Only coaches can remove coaches'; end if;
  if lower(old_email) = lower(auth.jwt() ->> 'email') then raise exception 'You can''t remove yourself'; end if;
  delete from public.coaches where email = lower(old_email);
end $$;
revoke execute on function public.list_coaches(), public.add_coach(text), public.remove_coach(text) from public, anon;
grant execute on function public.list_coaches(), public.add_coach(text), public.remove_coach(text) to authenticated;
