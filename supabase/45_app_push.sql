-- Added 2026-11-26: match alerts in the Touchline Tales app (App Store / Google Play, see app/README.md). Safe to re-run.
-- Run it once on every team's database (for a team in its own schema:
-- tools/team_schema_sql.py <schema> --only 45_app_push.sql). Sites work the same before and after.
--
-- Inside the app, web push isn't available, so the phone gets alerts through Firebase Cloud Messaging instead.
-- Its FCM token is stored in push_subs exactly like a web push phone, with the endpoint "app:fcm:<token>"
-- (p256dh holds "ios" or "android", auth holds "app"), so every alert choice and family-code rule works unchanged.
-- The notify edge function sends "app:fcm:" rows through FCM (secret FCM_SERVICE_ACCOUNT).

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean)
returns void language plpgsql security definer set search_path = public as $$
declare host text := substring(p_endpoint from '^https://([^/:]+)/');
begin
  if length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Not a push address';
  end if;
  if p_endpoint like 'app:fcm:%' then
    -- an FCM registration token: letters, digits and - _ : only
    if p_endpoint !~ '^app:fcm:[A-Za-z0-9_:-]{20,400}$' then raise exception 'Not a push address'; end if;
  elsif host is null
     or not (host = 'fcm.googleapis.com' or host like '%.push.services.mozilla.com' or host = 'web.push.apple.com'
             or host like '%.push.apple.com' or host like '%.notify.windows.com') then
    raise exception 'Not a push address';
  end if;
  insert into public.push_subs (endpoint, p256dh, auth, reminders, live)
  values (p_endpoint, p_p256dh, p_auth, coalesce(p_reminders, true), coalesce(p_live, true))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    reminders = excluded.reminders, live = excluded.live;
end $$;
revoke all on function public.push_subscribe(text, text, text, boolean, boolean) from public;
grant execute on function public.push_subscribe(text, text, text, boolean, boolean) to anon, authenticated;
