-- Added 2026-11-08: tournament details for parents. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 35_tournament_details.sql).
-- tournaments.matchday holds what parents need on the day, like matches.matchday does for a game:
-- {meet, finish, where, kit, bring, address, postcode, parking, cost, notice}. Coaches set it on Edit tournament;
-- everyone can read it (tournament card, home page, ?tour= page, parents' message). Tournament games use the
-- tournament's meet time, kit and postcode unless the game has its own.
alter table public.tournaments add column if not exists matchday jsonb;
notify pgrst, 'reload schema';
