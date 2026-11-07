-- Added 2026-11-07: Team photos. Families and coaches share match-day photos on the Photos page. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 33_team_photos.sql).
-- Needs 10_parent_login.sql (family codes) and the usual is_coach().
-- WHO CAN SEE IT: only the team's signed-in coaches, and families signed in with a family code (a phone linked to a
-- current player). Visitors (anon), and anonymous phones that never typed a right code, have no rights at all.
-- The storage bucket is PRIVATE: no public links, and the site opens each picture with a signed link that runs out after an hour.
-- SAFEGUARDS:
--   * photos go straight on for the team's families (no coach approval, Sean 7 Nov 2026)
--   * any family can ask for a photo to come down (flag_team_photo): it goes to 'waiting' straight away, so only the
--     coaches and the phone that added it can see it, until a coach puts it back or deletes it
--   * coaches can put back, caption and delete any photo; a parent can delete the ones their phone added
--   * at most 40 photos a day from one parent's phone
--   * no names are stored: uploader is the phone's anonymous sign-in id
-- The site re-draws every photo before upload, which also strips the location data phones put in pictures.
-- The old public "gallery" (match_photos, public bucket) is separate and stays archived.
create table if not exists public.team_photos(
  id       uuid primary key default gen_random_uuid(),
  match_id text not null check (length(match_id) <= 80),           -- matches.id, or 't:' || tournaments.id (no foreign key)
  path     text not null,                                           -- full size, in the team-photos bucket
  thumb    text not null,                                           -- small copy, in the team-photos bucket
  caption  text not null default '' check (length(caption) <= 200),
  w int, h int,
  status   text not null default 'waiting' check (status in ('waiting', 'approved')),
  flagged  boolean not null default false,                          -- a family asked for it to come down
  by_coach boolean not null default false,
  uploader uuid default auth.uid(),
  created  timestamptz not null default now(),
  checked  timestamptz                                              -- when a coach last put it back
);
create index if not exists team_photos_match on public.team_photos(match_id);
create index if not exists team_photos_uploader on public.team_photos(uploader, created);

-- a phone signed in with a family code for a current player
create or replace function public.is_family() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.parent_links l join public.players p on p.id = l.player_id
                                            where l.uid = auth.uid() and p.current);
$$;

-- can this person open this file? (used by the storage rules below)
create or replace function public.can_see_team_photo(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_coach() or (public.is_family() and exists (
    select 1 from public.team_photos f where (f.path = p_name or f.thumb = p_name)
      and (f.status = 'approved' or f.uploader = auth.uid())));
$$;

-- at most 40 photos a day from one parent's phone
create or replace function public.team_photos_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() and (select count(*) from public.team_photos
       where uploader = auth.uid() and created > now() - interval '1 day') >= 40 then
    raise exception 'That is the most photos one phone can add in a day';
  end if;
  return new;
end $$;
drop trigger if exists team_photos_limit on public.team_photos;
create trigger team_photos_limit before insert on public.team_photos for each row execute function public.team_photos_limit();

-- a family asks for an approved photo to come down: hidden from everyone but the coaches straight away
create or replace function public.flag_team_photo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_family() or public.is_coach()) then raise exception 'Sign in with your family code first'; end if;
  update public.team_photos set flagged = true, status = 'waiting' where id = p_id and status = 'approved';
end $$;

alter table public.team_photos enable row level security;
drop policy if exists "coaches and families see team photos" on public.team_photos;
create policy "coaches and families see team photos" on public.team_photos for select to authenticated
  using (public.is_coach() or (public.is_family() and (status = 'approved' or uploader = auth.uid())));
drop policy if exists "coaches and families add team photos" on public.team_photos;
create policy "coaches and families add team photos" on public.team_photos for insert to authenticated
  with check (uploader = auth.uid() and (public.is_coach()
    or (public.is_family() and not by_coach and not flagged and checked is null)));
drop policy if exists "coaches change team photos" on public.team_photos;
create policy "coaches change team photos" on public.team_photos for update to authenticated
  using (public.is_coach()) with check (public.is_coach());
drop policy if exists "coaches and uploaders delete team photos" on public.team_photos;
create policy "coaches and uploaders delete team photos" on public.team_photos for delete to authenticated
  using (public.is_coach() or (uploader = auth.uid() and public.is_family()));
revoke all on public.team_photos from anon, public;
grant select, insert, update, delete on public.team_photos to authenticated;
revoke execute on function public.is_family(), public.can_see_team_photo(text), public.team_photos_limit(), public.flag_team_photo(uuid) from public, anon;
grant execute on function public.is_family(), public.can_see_team_photo(text), public.flag_team_photo(uuid) to authenticated;

-- the files: a private bucket (public = false), JPEGs up to 10 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-photos', 'team-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];
drop policy if exists "families see team-photos" on storage.objects;
create policy "families see team-photos" on storage.objects for select to authenticated
  using (bucket_id = 'team-photos' and public.can_see_team_photo(name));
drop policy if exists "families upload team-photos" on storage.objects;
create policy "families upload team-photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'team-photos' and (public.is_coach() or public.is_family()));
drop policy if exists "families delete team-photos" on storage.objects;
create policy "families delete team-photos" on storage.objects for delete to authenticated
  using (bucket_id = 'team-photos' and (public.is_coach() or (owner_id = auth.uid()::text and public.is_family())));
