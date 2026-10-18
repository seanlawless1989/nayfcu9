-- Keep matches.updated current on every change, so the calendar feed (supabase/functions/calendar) can tell
-- phones which games changed (LAST-MODIFIED and SEQUENCE). Before this, "updated" stayed at the insert time.
create or replace function public.touch_updated() returns trigger language plpgsql set search_path = '' as $$
begin new.updated := now(); return new; end $$;

drop trigger if exists matches_touch_updated on public.matches;
create trigger matches_touch_updated before update on public.matches
  for each row when (old.* is distinct from new.*) execute function public.touch_updated();
