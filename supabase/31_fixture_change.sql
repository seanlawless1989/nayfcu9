-- Fixture changes: when a coach changes an upcoming game's date, kick-off or venue (by hand, or by pasting the league's
-- Full-Time fixtures into "Import league fixtures"), the notify function tells parents with alerts on.
-- push_log.fixture_sig holds "date|ko|venue" as last told, so the same change is only ever sent once.
-- Re-runnable. Run on every team (tools/team_schema_sql.py --only 31_fixture_change.sql for teams in their own schema).
alter table public.push_log add column if not exists fixture_sig text;

-- Returns what the game was ("date|ko|venue") when it has changed since parents were last told, otherwise null.
-- p_was is what the coach's phone saw before the change; it is only used the first time (nothing told yet).
create or replace function public.push_claim_fixture(p_match text, p_was text)
returns text language plpgsql security definer set search_path = public as $$
declare cur text; old text;
begin
  select m.date::text || '|' || coalesce(trim(m.ko), '') || '|' || coalesce(trim(m.venue), '') into cur
    from public.matches m where m.id = p_match;
  if cur is null then return null; end if;
  insert into public.push_log (match_id) values (p_match) on conflict do nothing;
  select fixture_sig into old from public.push_log where match_id = p_match for update;
  old := coalesce(old, p_was);
  update public.push_log set fixture_sig = cur where match_id = p_match;
  if old is null or old = cur then return null; end if;
  return old;
end $$;
revoke all on function public.push_claim_fixture(text, text) from public, anon, authenticated;
