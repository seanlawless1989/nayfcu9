-- Added 2026-11-11: Coaches and managers on the Squad page, each with a name, a role and a photo, like the players. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 38_team_staff.sql).
-- Everyone can see this list (it's shown on the Squad and Players pages, the same as player photos). Only the team's
-- signed-in coaches can add, change or remove people. It's a display list only: it doesn't give anyone a coach sign-in
-- (that's the coaches table, from Team setup), and it never holds an email address.
create table if not exists public.team_staff(
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  role text not null default 'Coach' check (length(role) <= 40),
  img text check (img is null or length(img) < 400000),   -- small square JPEG data URL, made on the phone (300px)
  sort int not null default 0,
  updated timestamptz not null default now()
);
alter table public.team_staff enable row level security;
drop policy if exists "everyone reads staff" on public.team_staff;
create policy "everyone reads staff" on public.team_staff for select using (true);
drop policy if exists "coaches write staff" on public.team_staff;
create policy "coaches write staff" on public.team_staff for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.team_staff to anon, authenticated;
grant insert, update, delete on public.team_staff to authenticated;
