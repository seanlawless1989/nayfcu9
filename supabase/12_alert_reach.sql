-- Newton Aycliffe U9s: how many phones get match alerts, for coaches. Safe to re-run.
-- Counts only. push_subs holds nothing about who a phone belongs to, and this doesn't change that.
-- Apple = iPhone, iPad or Mac (Safari); Google = Android or Chrome/Edge on a computer; Mozilla = Firefox.
create or replace function public.alert_reach() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_coach() then raise exception 'Only coaches can see alert numbers'; end if;
  return (select json_build_object(
    'phones',    count(*),
    'apple',     count(*) filter (where endpoint like 'https://web.push.apple.com/%'),
    'google',    count(*) filter (where endpoint like 'https://fcm.googleapis.com/%'),
    'mozilla',   count(*) filter (where endpoint like 'https://%.push.services.mozilla.com/%'),
    'reminders', count(*) filter (where reminders),
    'goals',     count(*) filter (where goals or live),
    'results',   count(*) filter (where results or live),
    'live',      count(*) filter (where live),
    'week',      count(*) filter (where created > now() - interval '7 days'),
    'reached',   count(*) filter (where last_ok > now() - interval '14 days'),
    'last_ok',   max(last_ok))
  from public.push_subs);
end $$;
revoke all on function public.alert_reach() from public, anon;
grant execute on function public.alert_reach() to authenticated;
