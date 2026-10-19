-- Added 2026-10-19: matchday details, postponement alerts, alert choices, training attendance and parent votes.
-- Safe to re-run. Run it once on every team's database (SQL editor), then redeploy the notify edge function.

-- ---------- Matchday details on each fixture ----------
-- {"meet": "09:45", "kit": "home" (a key of TEAM.kits) or "Training kit", "pitch": "3", "postcode": "DL1 4PZ"}
-- The postcode is only used on the parent's phone for directions and the kick-off weather forecast.
alter table public.matches add column if not exists matchday jsonb;

-- ---------- "Postponed" alert, sent once when a coach marks an upcoming game postponed ----------
alter table public.push_log add column if not exists postponed_sent boolean not null default false;
create or replace function public.push_claim_postponed(p_match text, p_postponed boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.push_log (match_id) values (p_match) on conflict do nothing;
  if not p_postponed then  -- back on: a later postponement can alert again
    update public.push_log set postponed_sent = false where match_id = p_match; return false;
  end if;
  update public.push_log set postponed_sent = true where match_id = p_match and not postponed_sent;
  return found;
end $$;
revoke all on function public.push_claim_postponed(text, boolean) from public, anon, authenticated;

-- ---------- Alert choices per phone ----------
-- reminders (squad, kick-off, postponed) and live (everything on match day) were already there.
-- goals: just the goals. results: full time and player of the match. "live" still covers both.
alter table public.push_subs add column if not exists goals boolean not null default false;
alter table public.push_subs add column if not exists results boolean not null default false;
create or replace function public.push_subscribe2(p_endpoint text, p_p256dh text, p_auth text, p_reminders boolean, p_live boolean, p_goals boolean, p_results boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.push_subscribe(p_endpoint, p_p256dh, p_auth, p_reminders, p_live);  -- checks it's a real push address
  update public.push_subs set goals = coalesce(p_goals, false), results = coalesce(p_results, false) where endpoint = p_endpoint;
end $$;
revoke all on function public.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean) from public;
grant execute on function public.push_subscribe2(text, text, text, boolean, boolean, boolean, boolean) to anon, authenticated;
