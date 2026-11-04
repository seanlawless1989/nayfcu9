-- Added 2026-11: badges for coaches and parents who keep coming back (the Medals page and the "Your badges" strip).
-- A signed-in coach or parent's phone reads back only its OWN days from active_days (25_active_days.sql), to count
-- days, weeks in a row and match days. Nobody can read anyone else's days; coaches still only get the totals.
-- Player medals need nothing here: the site works them out from the games. Safe to re-run.
create or replace function public.my_days() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(day order by day), '[]'::json) from public.active_days where uid = auth.uid() and auth.uid() is not null;
$$;
revoke execute on function public.my_days() from public, anon;
grant execute on function public.my_days() to authenticated;
