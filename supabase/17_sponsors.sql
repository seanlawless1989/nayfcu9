-- Added 2026-10-31: team sponsors. Safe to re-run. Run it once on every team's database (SQL editor).
-- Coaches add, change and remove the team's sponsors on the Sponsors page (name, logo, an optional link and an
-- optional line on what they sponsor). Everyone sees them in the "Thank you to our sponsors" strip on the home page.
-- Logos are small pictures shrunk on the coach's phone and kept here as text, like opposition badges.
-- Nothing about children goes in this table.
create table if not exists public.sponsors(
  id      bigint generated always as identity primary key,
  name    text not null check (length(btrim(name)) between 1 and 80),
  logo    text check (logo is null or length(logo) <= 400000),
  url     text check (url is null or (url ~* '^https?://' and length(url) <= 300)),
  about   text check (about is null or length(about) <= 60),   -- e.g. "Home kit" or "Player of the match"
  sort    int not null default 0,
  created timestamptz not null default now()
);
alter table public.sponsors enable row level security;
drop policy if exists "everyone reads sponsors" on public.sponsors;
create policy "everyone reads sponsors" on public.sponsors for select using (true);
drop policy if exists "coaches write sponsors" on public.sponsors;
create policy "coaches write sponsors" on public.sponsors for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.sponsors to anon, authenticated;
grant insert, update, delete on public.sponsors to authenticated;
