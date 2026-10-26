-- Added 2026-10-26: the teams entered in a tournament, and which group each is in. Safe to re-run.
-- A list like [{"name":"Beamish","group":"A"}, ...]. group is "" until the groups are drawn, and the site then shows
-- "Groups to be drawn". Coaches change it on the Edit tournament form; everyone can read it (it's on the public page).
alter table public.tournaments add column if not exists teams jsonb not null default '[]'::jsonb;
alter table public.tournaments drop constraint if exists tournaments_teams_is_list;
alter table public.tournaments add constraint tournaments_teams_is_list check (jsonb_typeof(teams) = 'array' and jsonb_array_length(teams) <= 64);
notify pgrst, 'reload schema';
