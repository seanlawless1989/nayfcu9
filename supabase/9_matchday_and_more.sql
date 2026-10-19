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
