-- Added 2026-10-31: the squad picked for a tournament, before its games are on the site. Safe to re-run.
-- A list of first names, like matches.squad. Coaches pick it from the tournament card (Pick squad), parents see it on
-- the tournament card, and every game added to the tournament starts with it. Everyone can read it (it's on the public page).
alter table public.tournaments add column if not exists squad jsonb;
alter table public.tournaments drop constraint if exists tournaments_squad_is_list;
alter table public.tournaments add constraint tournaments_squad_is_list check (squad is null or (jsonb_typeof(squad) = 'array' and jsonb_array_length(squad) <= 60));
notify pgrst, 'reload schema';
