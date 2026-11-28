-- Added 2026-11-25: the coaching assistant's matchday plans and coaches' debriefs. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 49_coach_assistant.sql).
-- The site works before this is run: the assistant still drafts, and a coach can copy the draft, but Save says it isn't switched on.
-- Coaches' notes gain two kinds (still coaches only, see 39_coach_notes.sql):
--   'mday' a matchday plan, k = the match id, data = {text}
--   'deb'  a private coaches' debrief after a game, k = the match id, data = {well: [..], work: [..], focus, idea}
-- Neither holds anything about one child: the plan is written without any names and the debrief is about the team.
do $$ begin
  if to_regclass('public.coach_notes') is not null then
    alter table public.coach_notes drop constraint if exists coach_notes_kind_check;
    alter table public.coach_notes add constraint coach_notes_kind_check check (kind in ('fc','pos','opp','plan','chk','mday','deb'));
  end if;
end $$;
