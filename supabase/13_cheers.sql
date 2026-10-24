-- Added 2026-10-24: supporter cheers. Safe to re-run. Run it once on every team's database (SQL editor).
-- Anyone with the site link can send a ready-made cheer to the team in the week before a game and during it, with
-- their own first name if they like. The words are picked from a list in the site (no typing), and cheers go to the
-- whole team, never to a named child. Limits: 3 cheers per phone every 10 minutes, 30 a minute and 200 a game in all.
-- A coach can hide any cheer, or turn cheers off for the team. Cheers are deleted 30 days after they're sent.

-- ---------- Team switch: a coach can turn cheers off ----------
create table if not exists public.cheer_settings(
  id    int primary key default 1 check (id = 1),
  muted boolean not null default false   -- true: nobody can send cheers and none are shown
);
insert into public.cheer_settings (id) values (1) on conflict do nothing;
alter table public.cheer_settings enable row level security;
drop policy if exists "everyone reads cheer settings" on public.cheer_settings;
create policy "everyone reads cheer settings" on public.cheer_settings for select using (true);
drop policy if exists "coaches change cheer settings" on public.cheer_settings;
create policy "coaches change cheer settings" on public.cheer_settings for update to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.cheer_settings to anon, authenticated;
grant update on public.cheer_settings to authenticated;

-- ---------- The cheers ----------
create table if not exists public.cheers(
  id       bigint generated always as identity primary key,
  match_id text not null references public.matches(id) on delete cascade,
  cheer    smallint not null,   -- which ready-made cheer (its place in the site's list)
  name     text,                -- the sender's own first name, if they gave one
  voter    text not null,       -- a random code made on the sender's phone, only for the limits
  at       timestamptz not null default now(),
  hidden   boolean not null default false
);
create index if not exists cheers_match on public.cheers(match_id, id);
create index if not exists cheers_voter on public.cheers(voter, at);
alter table public.cheers enable row level security;   -- no policies: everything goes through the functions below
revoke all on public.cheers from anon, authenticated;

create or replace function public.send_cheer(p_match text, p_voter text, p_cheer int, p_name text)
returns bigint language plpgsql security definer set search_path = public as $$
declare d date; today date := (now() at time zone 'Europe/London')::date;
        n text := left(btrim(regexp_replace(regexp_replace(coalesce(p_name, ''), '[^A-Za-zÀ-ÖØ-öø-ÿ'' -]', '', 'g'), '\s+', ' ', 'g')), 20);
        new_id bigint;
begin
  if (select muted from public.cheer_settings where id = 1) then raise exception 'Cheers are off for this team'; end if;
  if p_cheer is null or p_cheer < 0 or p_cheer > 49 then raise exception 'Pick a cheer'; end if;
  if p_voter is null or length(p_voter) not between 8 and 64 then raise exception 'This phone can''t send cheers'; end if;
  select date into d from public.matches where id = p_match;
  if d is null or d < today or d > today + 7 then raise exception 'Cheers open a week before the game'; end if;
  delete from public.cheers where at < now() - interval '30 days';
  if (select count(*) from public.cheers where voter = p_voter and at > now() - interval '10 minutes') >= 3 then
    raise exception 'Slow down: 3 cheers every 10 minutes';
  end if;
  if (select count(*) from public.cheers where match_id = p_match and at > now() - interval '1 minute') >= 30
     or (select count(*) from public.cheers where match_id = p_match) >= 200 then
    raise exception 'Lots of cheers already. Try again later';
  end if;
  insert into public.cheers(match_id, cheer, name, voter) values (p_match, p_cheer, nullif(n, ''), p_voter) returning id into new_id;
  return new_id;
end $$;

-- the latest 50 cheers for a game (never the phone codes)
create or replace function public.cheers_for(p_match text) returns table(id bigint, cheer smallint, name text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (select c.id, c.cheer, c.name, c.at from public.cheers c
                 where c.match_id = p_match and not c.hidden and not coalesce((select muted from public.cheer_settings where id = 1), false)
                 order by c.id desc limit 50) x order by id;
$$;

create or replace function public.hide_cheer(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() then raise exception 'Coaches only'; end if;
  update public.cheers set hidden = true where id = p_id;
end $$;

revoke all on function public.send_cheer(text,text,int,text), public.cheers_for(text), public.hide_cheer(bigint) from public;
grant execute on function public.send_cheer(text,text,int,text), public.cheers_for(text) to anon, authenticated;
grant execute on function public.hide_cheer(bigint) to authenticated;
