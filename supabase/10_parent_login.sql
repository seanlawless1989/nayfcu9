-- Added 2026-10-21: parent login with family codes. Safe to re-run.
-- Each player gets a private family code from the coach. A parent types it once on the site's Parents page; the
-- phone gets an anonymous Supabase sign-in (no email, no name) linked to that child. Signed-in parents answer
-- availability for their own children only, and each family gets one vote. Nothing about the parent is stored.
-- Also tick Authentication > Sign In / Providers > "Allow anonymous sign-ins" in the Supabase dashboard.

-- ---------- Anonymous sign-ins are allowed; email sign-ins are still coaches only ----------
create or replace function public.only_coaches_can_sign_up()
returns trigger language plpgsql security definer set search_path = public as $$
declare s text; ok boolean;
begin
  if coalesce(new.is_anonymous, false) then return new; end if;   -- a parent's phone, no email
  if exists (select 1 from public.coaches where email = lower(new.email)) then return new; end if;
  -- other teams sharing this project each have their own schema with a coaches list (tools/team_schema_sql.py)
  for s in select schemaname from pg_tables where tablename = 'coaches' and schemaname <> 'public' loop
    execute format('select exists (select 1 from %I.coaches where email = $1)', s) into ok using lower(new.email);
    if ok then return new; end if;
  end loop;
  raise exception 'Only club coaches can sign in';
end $$;
revoke execute on function public.only_coaches_can_sign_up() from public, anon, authenticated;

-- ---------- Team switch: once codes are handed out, a coach turns "parents must sign in" on ----------
create table if not exists public.parent_settings(
  id       int primary key default 1 check (id = 1),
  required boolean not null default false   -- true: availability and votes need a family code
);
insert into public.parent_settings (id) values (1) on conflict do nothing;
alter table public.parent_settings enable row level security;
drop policy if exists "everyone reads parent settings" on public.parent_settings;
create policy "everyone reads parent settings" on public.parent_settings for select using (true);
drop policy if exists "coaches change parent settings" on public.parent_settings;
create policy "coaches change parent settings" on public.parent_settings for update to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.parent_settings to anon, authenticated;
grant update on public.parent_settings to authenticated;

-- ---------- One family code per player (coaches only) ----------
create table if not exists public.family_codes(
  player_id text primary key references public.players(id) on delete cascade,
  code      text not null unique,   -- six letters and numbers, e.g. 7K3M9Q, shown as 7K3-M9Q
  created   timestamptz not null default now()
);
alter table public.family_codes enable row level security;   -- no policies: coaches use family_overview()
revoke all on public.family_codes from anon, authenticated;

-- ---------- Which phone belongs to which child ----------
create table if not exists public.parent_links(
  uid       uuid not null references auth.users(id) on delete cascade,   -- the phone's anonymous sign-in
  player_id text not null references public.players(id) on delete cascade,
  linked    timestamptz not null default now(),
  primary key(uid, player_id)
);
alter table public.parent_links enable row level security;   -- no policies: everything goes through the functions below
revoke all on public.parent_links from anon, authenticated;

-- wrong codes, so nobody can guess their way in: five tries an hour per phone
create table if not exists public.parent_tries(
  uid uuid not null,
  at  timestamptz not null default now()
);
create index if not exists parent_tries_uid on public.parent_tries(uid, at);
alter table public.parent_tries enable row level security;
revoke all on public.parent_tries from anon, authenticated;

create or replace function public.parents_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select required from public.parent_settings where id = 1), false);
$$;

-- the current players this phone is linked to, by name
create or replace function public.my_children() returns setof text
language sql stable security definer set search_path = public as $$
  select p.name from public.parent_links l join public.players p on p.id = l.player_id
  where l.uid = auth.uid() and p.current order by p.num nulls last, p.name;
$$;

create or replace function public.is_parent_of(p_player text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parent_links l join public.players p on p.id = l.player_id
                 where l.uid = auth.uid() and p.name = p_player and p.current);
$$;

-- one vote per family: the phone's first linked child stands for the family
create or replace function public.family_key() returns text
language sql stable security definer set search_path = public as $$
  select 'family:' || min(l.player_id) from public.parent_links l join public.players p on p.id = l.player_id
  where l.uid = auth.uid() and p.current;
$$;

-- a parent types a code: link this phone to that child and return the child's name (null for a wrong code;
-- it doesn't raise an error, so the wrong try is still counted)
create or replace function public.link_family(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); pid text; pname text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.parent_tries where at < now() - interval '1 hour';
  if (select count(*) from public.parent_tries where uid = auth.uid()) >= 5 then
    raise exception 'Too many tries. Wait an hour, or ask the coach to check the code.';
  end if;
  select f.player_id, p.name into pid, pname from public.family_codes f join public.players p on p.id = f.player_id
  where f.code = c and p.current;
  if pid is null then
    insert into public.parent_tries(uid) values (auth.uid());
    return null;
  end if;
  insert into public.parent_links(uid, player_id) values (auth.uid(), pid) on conflict do nothing;
  return pname;
end $$;

-- a parent removes a child from this phone (or all of them, when p_player is null)
create or replace function public.unlink_family(p_player text) returns void
language sql security definer set search_path = public as $$
  delete from public.parent_links l using public.players p
  where l.uid = auth.uid() and p.id = l.player_id and (p_player is null or p.name = p_player);
$$;

-- this phone's own availability answers, so a parent sees what they said
create or replace function public.my_availability() returns table(match_id text, player text, status text)
language sql stable security definer set search_path = public as $$
  select a.match_id, a.player, a.status from public.availability a where public.is_parent_of(a.player);
$$;

-- ---------- Coaches: see and reset codes ----------
create or replace function public.new_family_code(p_player text) returns text
language plpgsql security definer set search_path = public as $$
declare abc text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; c text; i int;
begin
  if not public.is_coach() then raise exception 'Only coaches can make family codes'; end if;
  if not exists (select 1 from public.players where id = p_player) then raise exception 'unknown player'; end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from public.family_codes where code = c);
  end loop;
  delete from public.parent_links where player_id = p_player;   -- phones using the old code lose access
  insert into public.family_codes(player_id, code, created) values (p_player, c, now())
  on conflict (player_id) do update set code = excluded.code, created = excluded.created;
  return c;
end $$;

-- every current player with their code (made now if they haven't got one) and how many phones are linked
create or replace function public.family_overview() returns table(player_id text, player text, num int, code text, phones bigint)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_coach() then raise exception 'Only coaches can see family codes'; end if;
  for r in select p.id from public.players p where p.current and not exists (select 1 from public.family_codes f where f.player_id = p.id) loop
    perform public.new_family_code(r.id);
  end loop;
  return query
    select p.id, p.name, p.num, f.code, (select count(*) from public.parent_links l where l.player_id = p.id)
    from public.players p join public.family_codes f on f.player_id = p.id
    where p.current order by p.num nulls last, p.name;
end $$;

-- ---------- Availability: parents answer for their own children ----------
create or replace function public.set_availability(p_match text, p_player text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('yes','no','maybe') then raise exception 'bad status'; end if;
  if not (public.is_coach() or public.is_parent_of(p_player) or not public.parents_required()) then
    raise exception 'Sign in with your family code first';
  end if;
  if not exists (select 1 from matches where id = p_match and date >= current_date - 1) then raise exception 'unknown fixture'; end if;
  if not exists (select 1 from players where name = p_player and current) then raise exception 'unknown player'; end if;
  insert into availability(match_id, player, status, updated) values (p_match, p_player, p_status, now())
  on conflict (match_id, player) do update set status = excluded.status, updated = now();
end $$;

-- ---------- Votes: one per family once signed in ----------
create or replace function public.cast_vote(p_poll text, p_voter text, p_choice int)
returns void language plpgsql security definer set search_path = public as $$
declare p public.polls; v text := public.family_key();
begin
  select * into p from public.polls where id = p_poll;
  if p.id is null or p.closed or (p.closes is not null and p.closes < now()) then raise exception 'This vote has closed'; end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(p.options) then raise exception 'bad choice'; end if;
  if v is null then
    if public.parents_required() then raise exception 'Sign in with your family code to vote'; end if;
    v := p_voter;
    if length(v) < 16 or length(v) > 64 then raise exception 'bad voter'; end if;
  end if;
  insert into public.poll_votes(poll_id, voter, choice) values (p_poll, v, p_choice)
  on conflict (poll_id, voter) do update set choice = excluded.choice, updated = now();
end $$;

-- the family's own votes, so every linked phone shows what the family chose
create or replace function public.my_votes() returns table(poll_id text, choice int)
language sql stable security definer set search_path = public as $$
  select v.poll_id, v.choice from public.poll_votes v where v.voter = public.family_key();
$$;

revoke execute on function public.parents_required(), public.my_children(), public.is_parent_of(text), public.family_key(),
  public.link_family(text), public.unlink_family(text), public.my_availability(), public.new_family_code(text),
  public.family_overview(), public.my_votes() from public, anon;
grant execute on function public.my_children(), public.is_parent_of(text), public.link_family(text), public.unlink_family(text),
  public.my_availability(), public.new_family_code(text), public.family_overview(), public.my_votes() to authenticated;
grant execute on function public.parents_required() to anon, authenticated;
grant execute on function public.set_availability(text,text,text), public.cast_vote(text,text,int) to anon, authenticated;
