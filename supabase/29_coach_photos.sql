-- Added 2026-11-04: Coach photos, a private photo store for the team's coaches. Safe to re-run.
-- Run it once on every team's database (for a team in its own schema: tools/team_schema_sql.py <schema> --only 29_coach_photos.sql).
-- Coaches keep match, training and team photos here to share among themselves (for graphics, the end-of-season
-- night and so on). NOTHING here is ever shown on the site.
-- WHO CAN SEE IT: only the team's signed-in coaches (is_coach()). Visitors (anon) and parents signed in with a family
-- code have no rights on the table or the files at all. The storage bucket is PRIVATE: there are no public links, and
-- the site opens each picture with a signed link that runs out after an hour.
-- The site re-draws every photo before upload, which also strips the location data phones put in pictures.
create table if not exists public.coach_photos(
  id       uuid primary key default gen_random_uuid(),
  album    text not null default '' check (length(album) <= 80),   -- e.g. "v Beamish, Sat 24 Oct" or "Training"
  match_id text,                                                    -- matches.id when the album is a game (no foreign key)
  path     text not null,                                           -- full size, in the coach-photos bucket
  thumb    text not null,                                           -- small copy, in the coach-photos bucket
  caption  text not null default '' check (length(caption) <= 200),
  w int, h int,
  created  timestamptz not null default now()
);
create index if not exists coach_photos_album on public.coach_photos(album);
alter table public.coach_photos enable row level security;
drop policy if exists "coaches only coach photos" on public.coach_photos;
create policy "coaches only coach photos" on public.coach_photos for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
revoke all on public.coach_photos from anon, public;
grant select, insert, update, delete on public.coach_photos to authenticated;

-- videos (added 2026-11-21): the phone's own MP4 / MOV file, up to 50 MB, with a JPEG thumbnail made from it.
-- The site blanks out the file's metadata (where it was filmed) before upload. Photos have kind 'photo'.
alter table public.coach_photos add column if not exists kind text not null default 'photo';
alter table public.coach_photos add column if not exists secs int;                -- a video's length in seconds
alter table public.coach_photos drop constraint if exists coach_photos_kind_check;
alter table public.coach_photos add constraint coach_photos_kind_check check (kind in ('photo', 'video'));

-- the files: a private bucket (public = false), JPEG photos and phone videos up to 50 MB
-- (the project's Storage > Settings > Global file size limit must be at least 50 MB too)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach-photos', 'coach-photos', false, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/3gpp'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/3gpp'];
drop policy if exists "coaches see coach-photos" on storage.objects;
create policy "coaches see coach-photos" on storage.objects for select to authenticated
  using (bucket_id = 'coach-photos' and public.is_coach());
drop policy if exists "coaches upload coach-photos" on storage.objects;
create policy "coaches upload coach-photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'coach-photos' and public.is_coach());
drop policy if exists "coaches delete coach-photos" on storage.objects;
create policy "coaches delete coach-photos" on storage.objects for delete to authenticated
  using (bucket_id = 'coach-photos' and public.is_coach());
