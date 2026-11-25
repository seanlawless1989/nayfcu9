-- 43_coach_invites.sql for the NAYFC U9s project: public + every team schema (25 Nov 2026)
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
-- Team schema na_u11_pumas: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists na_u11_pumas;
grant usage on schema na_u11_pumas to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_pumas grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_pumas grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_pumas grant all on functions to anon, authenticated, service_role;

-- ===================== 43_coach_invites.sql =====================
-- Added 2026-11-25: coach invite links. Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 43_coach_invites.sql).
-- A coach (or we, for a new team) makes a one-off link like <site>?invite=<code> and sends it on WhatsApp, so nobody
-- needs to know the new coach's email first. Whoever opens it types their own email: that email goes on this team's
-- coaches list and the usual sign-in email follows. Each code works ONCE (the same email may use it again), and runs
-- out after 30 days. Codes are 20 random hex characters. Nobody can list or read the codes through the site.
create table if not exists na_u11_pumas.coach_invites(
  code     text primary key check (code ~ '^[0-9a-f]{20}$'),
  note     text not null default '' check (length(note) <= 80),   -- who it's for, e.g. "Mark"
  made_by  text not null default '',
  created  timestamptz not null default now(),
  expires  timestamptz not null default now() + interval '30 days',
  used_by  text,
  used_at  timestamptz
);
alter table na_u11_pumas.coach_invites enable row level security;   -- no policies: only the two functions below touch it
revoke all on na_u11_pumas.coach_invites from anon, authenticated;

-- a signed-in coach makes a link; resolves the code
create or replace function na_u11_pumas.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = na_u11_pumas as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not na_u11_pumas.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  insert into na_u11_pumas.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function na_u11_pumas.make_coach_invite(text) from public, anon;
grant execute on function na_u11_pumas.make_coach_invite(text) to authenticated;

-- anyone with the link: puts their email on the coaches list if the code is unused and in date
create or replace function na_u11_pumas.redeem_coach_invite(p_code text, p_email text) returns boolean
language plpgsql security definer set search_path = na_u11_pumas as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_code, '') !~ '^[0-9a-f]{20}$' then return false; end if;
  update na_u11_pumas.coach_invites set used_by = e, used_at = now() where code = p_code and used_at is null and expires > now();
  if not found then
    return exists (select 1 from na_u11_pumas.coach_invites where code = p_code and used_by = e);   -- the same person again
  end if;
  insert into na_u11_pumas.coaches (email) values (e) on conflict do nothing;
  return true;
end $$;
revoke execute on function na_u11_pumas.redeem_coach_invite(text, text) from public;
grant execute on function na_u11_pumas.redeem_coach_invite(text, text) to anon, authenticated;
-- Team schema na_u11_wildcats: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists na_u11_wildcats;
grant usage on schema na_u11_wildcats to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u11_wildcats grant all on functions to anon, authenticated, service_role;

-- ===================== 43_coach_invites.sql =====================
-- Added 2026-11-25: coach invite links. Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 43_coach_invites.sql).
-- A coach (or we, for a new team) makes a one-off link like <site>?invite=<code> and sends it on WhatsApp, so nobody
-- needs to know the new coach's email first. Whoever opens it types their own email: that email goes on this team's
-- coaches list and the usual sign-in email follows. Each code works ONCE (the same email may use it again), and runs
-- out after 30 days. Codes are 20 random hex characters. Nobody can list or read the codes through the site.
create table if not exists na_u11_wildcats.coach_invites(
  code     text primary key check (code ~ '^[0-9a-f]{20}$'),
  note     text not null default '' check (length(note) <= 80),   -- who it's for, e.g. "Mark"
  made_by  text not null default '',
  created  timestamptz not null default now(),
  expires  timestamptz not null default now() + interval '30 days',
  used_by  text,
  used_at  timestamptz
);
alter table na_u11_wildcats.coach_invites enable row level security;   -- no policies: only the two functions below touch it
revoke all on na_u11_wildcats.coach_invites from anon, authenticated;

-- a signed-in coach makes a link; resolves the code
create or replace function na_u11_wildcats.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = na_u11_wildcats as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not na_u11_wildcats.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  insert into na_u11_wildcats.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function na_u11_wildcats.make_coach_invite(text) from public, anon;
grant execute on function na_u11_wildcats.make_coach_invite(text) to authenticated;

-- anyone with the link: puts their email on the coaches list if the code is unused and in date
create or replace function na_u11_wildcats.redeem_coach_invite(p_code text, p_email text) returns boolean
language plpgsql security definer set search_path = na_u11_wildcats as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_code, '') !~ '^[0-9a-f]{20}$' then return false; end if;
  update na_u11_wildcats.coach_invites set used_by = e, used_at = now() where code = p_code and used_at is null and expires > now();
  if not found then
    return exists (select 1 from na_u11_wildcats.coach_invites where code = p_code and used_by = e);   -- the same person again
  end if;
  insert into na_u11_wildcats.coaches (email) values (e) on conflict do nothing;
  return true;
end $$;
revoke execute on function na_u11_wildcats.redeem_coach_invite(text, text) from public;
grant execute on function na_u11_wildcats.redeem_coach_invite(text, text) to anon, authenticated;
-- Team schema na_u8_wildcats: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists na_u8_wildcats;
grant usage on schema na_u8_wildcats to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u8_wildcats grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u8_wildcats grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema na_u8_wildcats grant all on functions to anon, authenticated, service_role;

-- ===================== 43_coach_invites.sql =====================
-- Added 2026-11-25: coach invite links. Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 43_coach_invites.sql).
-- A coach (or we, for a new team) makes a one-off link like <site>?invite=<code> and sends it on WhatsApp, so nobody
-- needs to know the new coach's email first. Whoever opens it types their own email: that email goes on this team's
-- coaches list and the usual sign-in email follows. Each code works ONCE (the same email may use it again), and runs
-- out after 30 days. Codes are 20 random hex characters. Nobody can list or read the codes through the site.
create table if not exists na_u8_wildcats.coach_invites(
  code     text primary key check (code ~ '^[0-9a-f]{20}$'),
  note     text not null default '' check (length(note) <= 80),   -- who it's for, e.g. "Mark"
  made_by  text not null default '',
  created  timestamptz not null default now(),
  expires  timestamptz not null default now() + interval '30 days',
  used_by  text,
  used_at  timestamptz
);
alter table na_u8_wildcats.coach_invites enable row level security;   -- no policies: only the two functions below touch it
revoke all on na_u8_wildcats.coach_invites from anon, authenticated;

-- a signed-in coach makes a link; resolves the code
create or replace function na_u8_wildcats.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = na_u8_wildcats as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not na_u8_wildcats.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  insert into na_u8_wildcats.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function na_u8_wildcats.make_coach_invite(text) from public, anon;
grant execute on function na_u8_wildcats.make_coach_invite(text) to authenticated;

-- anyone with the link: puts their email on the coaches list if the code is unused and in date
create or replace function na_u8_wildcats.redeem_coach_invite(p_code text, p_email text) returns boolean
language plpgsql security definer set search_path = na_u8_wildcats as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_code, '') !~ '^[0-9a-f]{20}$' then return false; end if;
  update na_u8_wildcats.coach_invites set used_by = e, used_at = now() where code = p_code and used_at is null and expires > now();
  if not found then
    return exists (select 1 from na_u8_wildcats.coach_invites where code = p_code and used_by = e);   -- the same person again
  end if;
  insert into na_u8_wildcats.coaches (email) values (e) on conflict do nothing;
  return true;
end $$;
revoke execute on function na_u8_wildcats.redeem_coach_invite(text, text) from public;
grant execute on function na_u8_wildcats.redeem_coach_invite(text, text) to anon, authenticated;
-- Team schema washington_wolves_u11s: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists washington_wolves_u11s;
grant usage on schema washington_wolves_u11s to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_wolves_u11s grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_wolves_u11s grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_wolves_u11s grant all on functions to anon, authenticated, service_role;

-- ===================== 43_coach_invites.sql =====================
-- Added 2026-11-25: coach invite links. Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 43_coach_invites.sql).
-- A coach (or we, for a new team) makes a one-off link like <site>?invite=<code> and sends it on WhatsApp, so nobody
-- needs to know the new coach's email first. Whoever opens it types their own email: that email goes on this team's
-- coaches list and the usual sign-in email follows. Each code works ONCE (the same email may use it again), and runs
-- out after 30 days. Codes are 20 random hex characters. Nobody can list or read the codes through the site.
create table if not exists washington_wolves_u11s.coach_invites(
  code     text primary key check (code ~ '^[0-9a-f]{20}$'),
  note     text not null default '' check (length(note) <= 80),   -- who it's for, e.g. "Mark"
  made_by  text not null default '',
  created  timestamptz not null default now(),
  expires  timestamptz not null default now() + interval '30 days',
  used_by  text,
  used_at  timestamptz
);
alter table washington_wolves_u11s.coach_invites enable row level security;   -- no policies: only the two functions below touch it
revoke all on washington_wolves_u11s.coach_invites from anon, authenticated;

-- a signed-in coach makes a link; resolves the code
create or replace function washington_wolves_u11s.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = washington_wolves_u11s as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not washington_wolves_u11s.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  insert into washington_wolves_u11s.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function washington_wolves_u11s.make_coach_invite(text) from public, anon;
grant execute on function washington_wolves_u11s.make_coach_invite(text) to authenticated;

-- anyone with the link: puts their email on the coaches list if the code is unused and in date
create or replace function washington_wolves_u11s.redeem_coach_invite(p_code text, p_email text) returns boolean
language plpgsql security definer set search_path = washington_wolves_u11s as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_code, '') !~ '^[0-9a-f]{20}$' then return false; end if;
  update washington_wolves_u11s.coach_invites set used_by = e, used_at = now() where code = p_code and used_at is null and expires > now();
  if not found then
    return exists (select 1 from washington_wolves_u11s.coach_invites where code = p_code and used_by = e);   -- the same person again
  end if;
  insert into washington_wolves_u11s.coaches (email) values (e) on conflict do nothing;
  return true;
end $$;
revoke execute on function washington_wolves_u11s.redeem_coach_invite(text, text) from public;
grant execute on function washington_wolves_u11s.redeem_coach_invite(text, text) to anon, authenticated;
-- Team schema washington_samba_u13s: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists washington_samba_u13s;
grant usage on schema washington_samba_u13s to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_samba_u13s grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_samba_u13s grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema washington_samba_u13s grant all on functions to anon, authenticated, service_role;

-- ===================== 43_coach_invites.sql =====================
-- Added 2026-11-25: coach invite links. Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 43_coach_invites.sql).
-- A coach (or we, for a new team) makes a one-off link like <site>?invite=<code> and sends it on WhatsApp, so nobody
-- needs to know the new coach's email first. Whoever opens it types their own email: that email goes on this team's
-- coaches list and the usual sign-in email follows. Each code works ONCE (the same email may use it again), and runs
-- out after 30 days. Codes are 20 random hex characters. Nobody can list or read the codes through the site.
create table if not exists washington_samba_u13s.coach_invites(
  code     text primary key check (code ~ '^[0-9a-f]{20}$'),
  note     text not null default '' check (length(note) <= 80),   -- who it's for, e.g. "Mark"
  made_by  text not null default '',
  created  timestamptz not null default now(),
  expires  timestamptz not null default now() + interval '30 days',
  used_by  text,
  used_at  timestamptz
);
alter table washington_samba_u13s.coach_invites enable row level security;   -- no policies: only the two functions below touch it
revoke all on washington_samba_u13s.coach_invites from anon, authenticated;

-- a signed-in coach makes a link; resolves the code
create or replace function washington_samba_u13s.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = washington_samba_u13s as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not washington_samba_u13s.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  insert into washington_samba_u13s.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function washington_samba_u13s.make_coach_invite(text) from public, anon;
grant execute on function washington_samba_u13s.make_coach_invite(text) to authenticated;

-- anyone with the link: puts their email on the coaches list if the code is unused and in date
create or replace function washington_samba_u13s.redeem_coach_invite(p_code text, p_email text) returns boolean
language plpgsql security definer set search_path = washington_samba_u13s as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_code, '') !~ '^[0-9a-f]{20}$' then return false; end if;
  update washington_samba_u13s.coach_invites set used_by = e, used_at = now() where code = p_code and used_at is null and expires > now();
  if not found then
    return exists (select 1 from washington_samba_u13s.coach_invites where code = p_code and used_by = e);   -- the same person again
  end if;
  insert into washington_samba_u13s.coaches (email) values (e) on conflict do nothing;
  return true;
end $$;
revoke execute on function washington_samba_u13s.redeem_coach_invite(text, text) from public;
grant execute on function washington_samba_u13s.redeem_coach_invite(text, text) to anon, authenticated;
-- Team schema darlington_u14s: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists darlington_u14s;
grant usage on schema darlington_u14s to anon, authenticated, service_role;
alter default privileges for role postgres in schema darlington_u14s grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema darlington_u14s grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema darlington_u14s grant all on functions to anon, authenticated, service_role;

-- ===================== 43_coach_invites.sql =====================
-- Added 2026-11-25: coach invite links. Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 43_coach_invites.sql).
-- A coach (or we, for a new team) makes a one-off link like <site>?invite=<code> and sends it on WhatsApp, so nobody
-- needs to know the new coach's email first. Whoever opens it types their own email: that email goes on this team's
-- coaches list and the usual sign-in email follows. Each code works ONCE (the same email may use it again), and runs
-- out after 30 days. Codes are 20 random hex characters. Nobody can list or read the codes through the site.
create table if not exists darlington_u14s.coach_invites(
  code     text primary key check (code ~ '^[0-9a-f]{20}$'),
  note     text not null default '' check (length(note) <= 80),   -- who it's for, e.g. "Mark"
  made_by  text not null default '',
  created  timestamptz not null default now(),
  expires  timestamptz not null default now() + interval '30 days',
  used_by  text,
  used_at  timestamptz
);
alter table darlington_u14s.coach_invites enable row level security;   -- no policies: only the two functions below touch it
revoke all on darlington_u14s.coach_invites from anon, authenticated;

-- a signed-in coach makes a link; resolves the code
create or replace function darlington_u14s.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = darlington_u14s as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not darlington_u14s.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  insert into darlington_u14s.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function darlington_u14s.make_coach_invite(text) from public, anon;
grant execute on function darlington_u14s.make_coach_invite(text) to authenticated;

-- anyone with the link: puts their email on the coaches list if the code is unused and in date
create or replace function darlington_u14s.redeem_coach_invite(p_code text, p_email text) returns boolean
language plpgsql security definer set search_path = darlington_u14s as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_code, '') !~ '^[0-9a-f]{20}$' then return false; end if;
  update darlington_u14s.coach_invites set used_by = e, used_at = now() where code = p_code and used_at is null and expires > now();
  if not found then
    return exists (select 1 from darlington_u14s.coach_invites where code = p_code and used_by = e);   -- the same person again
  end if;
  insert into darlington_u14s.coaches (email) values (e) on conflict do nothing;
  return true;
end $$;
revoke execute on function darlington_u14s.redeem_coach_invite(text, text) from public;
grant execute on function darlington_u14s.redeem_coach_invite(text, text) to anon, authenticated;
-- Team schema hilda_park_u9_girls: run in the SQL Editor of the shared project. Made by tools/team_schema_sql.py.
create schema if not exists hilda_park_u9_girls;
grant usage on schema hilda_park_u9_girls to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema hilda_park_u9_girls grant all on functions to anon, authenticated, service_role;

-- ===================== 43_coach_invites.sql =====================
-- Added 2026-11-25: coach invite links. Safe to re-run. Run it once on every team's database
-- (for a team in its own schema: tools/team_schema_sql.py <schema> --only 43_coach_invites.sql).
-- A coach (or we, for a new team) makes a one-off link like <site>?invite=<code> and sends it on WhatsApp, so nobody
-- needs to know the new coach's email first. Whoever opens it types their own email: that email goes on this team's
-- coaches list and the usual sign-in email follows. Each code works ONCE (the same email may use it again), and runs
-- out after 30 days. Codes are 20 random hex characters. Nobody can list or read the codes through the site.
create table if not exists hilda_park_u9_girls.coach_invites(
  code     text primary key check (code ~ '^[0-9a-f]{20}$'),
  note     text not null default '' check (length(note) <= 80),   -- who it's for, e.g. "Mark"
  made_by  text not null default '',
  created  timestamptz not null default now(),
  expires  timestamptz not null default now() + interval '30 days',
  used_by  text,
  used_at  timestamptz
);
alter table hilda_park_u9_girls.coach_invites enable row level security;   -- no policies: only the two functions below touch it
revoke all on hilda_park_u9_girls.coach_invites from anon, authenticated;

-- a signed-in coach makes a link; resolves the code
create or replace function hilda_park_u9_girls.make_coach_invite(p_note text default '') returns text
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare c text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
begin
  if not hilda_park_u9_girls.is_coach() then raise exception 'Only coaches can invite coaches'; end if;
  insert into hilda_park_u9_girls.coach_invites (code, note, made_by) values (c, left(coalesce(p_note, ''), 80), lower(coalesce(auth.jwt() ->> 'email', '')));
  return c;
end $$;
revoke execute on function hilda_park_u9_girls.make_coach_invite(text) from public, anon;
grant execute on function hilda_park_u9_girls.make_coach_invite(text) to authenticated;

-- anyone with the link: puts their email on the coaches list if the code is unused and in date
create or replace function hilda_park_u9_girls.redeem_coach_invite(p_code text, p_email text) returns boolean
language plpgsql security definer set search_path = hilda_park_u9_girls as $$
declare e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_code, '') !~ '^[0-9a-f]{20}$' then return false; end if;
  update hilda_park_u9_girls.coach_invites set used_by = e, used_at = now() where code = p_code and used_at is null and expires > now();
  if not found then
    return exists (select 1 from hilda_park_u9_girls.coach_invites where code = p_code and used_by = e);   -- the same person again
  end if;
  insert into hilda_park_u9_girls.coaches (email) values (e) on conflict do nothing;
  return true;
end $$;
revoke execute on function hilda_park_u9_girls.redeem_coach_invite(text, text) from public;
grant execute on function hilda_park_u9_girls.redeem_coach_invite(text, text) to anon, authenticated;
select 'coach invites ready' as done;
