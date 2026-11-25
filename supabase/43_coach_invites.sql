-- Added 2026-11-25: coach invite links. Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 43_coach_invites.sql).
-- A coach (or we, for a new team) makes a one-off link like <site>?invite=<code> and sends it on WhatsApp, so nobody
-- needs to know the new coach's email first. Whoever opens it types their own email: that email goes on this team's
-- coaches list and the usual sign-in email follows. Each code works ONCE (the same email may use it again), and runs
-- out after 30 days. Codes are 20 random hex characters. Nobody can list or read the codes through the site.
create table if not exists public.coach_invites(
  code     text primary key check (code ~ '^[0-9a-f]{20}$'),
  note     text not null default '' check (length(note) <= 80),   -- who it's for, e.g. "Mark"
  made_by  text not null default '',
  created  timestamptz not null default now(),
  expires  timestamptz not null default now() + interval '30 days',
  used_by  text,
  used_at  timestamptz
);
alter table public.coach_invites enable row level security;   -- no policies: only the two functions below touch it
revoke all on public.coach_invites from anon, authenticated;

-- a signed-in coach makes a link; resolves the code
create or replace function public.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not public.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  insert into public.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function public.make_coach_invite(text) from public, anon;
grant execute on function public.make_coach_invite(text) to authenticated;

-- anyone with the link: puts their email on the coaches list if the code is unused and in date
create or replace function public.redeem_coach_invite(p_code text, p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_code, '') !~ '^[0-9a-f]{20}$' then return false; end if;
  update public.coach_invites set used_by = e, used_at = now() where code = p_code and used_at is null and expires > now();
  if not found then
    return exists (select 1 from public.coach_invites where code = p_code and used_by = e);   -- the same person again
  end if;
  insert into public.coaches (email) values (e) on conflict do nothing;
  return true;
end $$;
revoke execute on function public.redeem_coach_invite(text, text) from public;
grant execute on function public.redeem_coach_invite(text, text) to anon, authenticated;
