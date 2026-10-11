-- Newton Aycliffe U9s: database setup. Paste into Supabase > SQL Editor and click Run.

create table if not exists public.players (
  id      text primary key,
  name    text not null,
  num     integer,
  current boolean not null default true
);

create table if not exists public.matches (
  id         text primary key,
  date       date not null,
  opp        text default '',
  ha         text default '',          -- H, A or N
  venue      text default '',
  comp       text default '',          -- League, Cup, Friendly, Tournament
  ko         text default '',          -- kick-off, e.g. 10:15
  us         integer,                  -- our goals
  them       integer,                  -- their goals
  potm       text,                     -- Coffey Coffee player of the match
  played     jsonb not null default '{}'::jsonb,  -- {"Daisy": 3, "Chloe": 0} = played, with goals
  apps       boolean not null default true,       -- false = appearances weren't recorded
  notes      text default '',
  check_note text default '',
  assists jsonb not null default '{}'::jsonb,
  updated    timestamptz not null default now()
);

-- Coaches who may add and edit matches. Add each coach's email (lower case).
create table if not exists public.coaches (
  email text primary key
);

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.coaches enable row level security;

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coaches where email = lower(auth.jwt() ->> 'email'));
$$;

-- Everyone (including parents who aren't signed in) can read results and the squad.
-- To make the site coaches-only, change "to anon, authenticated using (true)" to "to authenticated using (public.is_coach())".
drop policy if exists "read players" on public.players;
create policy "read players" on public.players for select to anon, authenticated using (true);
drop policy if exists "read matches" on public.matches;
create policy "read matches" on public.matches for select to anon, authenticated using (true);

-- Only coaches can change anything.
drop policy if exists "coaches write players" on public.players;
create policy "coaches write players" on public.players for all to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists "coaches write matches" on public.matches;
create policy "coaches write matches" on public.matches for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- A signed-in coach can see their own row (the site uses this to show the coach tools).
drop policy if exists "see own coach row" on public.coaches;
create policy "see own coach row" on public.coaches for select to authenticated using (email = lower(auth.jwt() ->> 'email'));

-- >>> Change this to your email, then run. Add a line per coach.
insert into public.coaches (email) values ('coach@example.com') on conflict do nothing;

-- Only emails on the coaches list can create a sign-in account.
create or replace function public.only_coaches_can_sign_up()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.coaches where email = lower(new.email)) then
    raise exception 'Only club coaches can sign in';
  end if;
  return new;
end $$;
revoke execute on function public.only_coaches_can_sign_up() from public, anon, authenticated;
drop trigger if exists only_coaches_can_sign_up on auth.users;
create trigger only_coaches_can_sign_up before insert on auth.users
  for each row execute function public.only_coaches_can_sign_up();

-- Added 2026-10: assists per player, e.g. {"Lydia": 1}. Safe to re-run on an existing database.
alter table public.matches add column if not exists assists jsonb not null default '{}'::jsonb;
