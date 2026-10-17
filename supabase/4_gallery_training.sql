-- Added 2026-10-17: photo gallery, training info and the calendar feed. Safe to re-run.

-- ---------- Photo gallery ----------
-- Coaches upload match-day photos against a game; everyone can see them (parents' photo consent confirmed 17 Oct 2026).
-- The files live in the public "gallery" storage bucket: <match id>/<photo id>.jpg plus a small <photo id>_t.jpg thumbnail.
-- The site re-draws every photo before upload, which also strips location data from phone pictures.
create table if not exists public.match_photos(
  id       uuid primary key default gen_random_uuid(),
  match_id text not null,            -- matches.id (no foreign key, so live-match saves never wait on it)
  path     text not null,            -- full size, in the gallery bucket
  thumb    text not null,            -- thumbnail, in the gallery bucket
  caption  text default '',
  w int, h int,
  created  timestamptz not null default now()
);
create index if not exists match_photos_match on public.match_photos(match_id);
alter table public.match_photos enable row level security;
drop policy if exists "everyone reads match photos" on public.match_photos;
create policy "everyone reads match photos" on public.match_photos for select using (true);
drop policy if exists "coaches write match photos" on public.match_photos;
create policy "coaches write match photos" on public.match_photos for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.match_photos to anon, authenticated;
grant insert, update, delete on public.match_photos to authenticated;
revoke insert, update, delete, truncate on public.match_photos from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5242880, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];
drop policy if exists "coaches upload gallery" on storage.objects;
create policy "coaches upload gallery" on storage.objects for insert to authenticated with check (bucket_id = 'gallery' and public.is_coach());
drop policy if exists "coaches see gallery" on storage.objects;
create policy "coaches see gallery" on storage.objects for select to authenticated using (bucket_id = 'gallery' and public.is_coach());
drop policy if exists "coaches delete gallery" on storage.objects;
create policy "coaches delete gallery" on storage.objects for delete to authenticated using (bucket_id = 'gallery' and public.is_coach());

-- ---------- Training ----------
-- One row, shown on the Training page and added to the calendar feed every week until "until".
create table if not exists public.training(
  id      int primary key default 1 check (id = 1),
  day     text not null default 'Wednesday',
  start   text not null default '18:00',
  finish  text not null default '19:00',
  venue   text default '',
  kit     text default '',
  notes   text default '',
  until   date,                      -- last session in this pattern (blank = no end)
  off     date[] not null default '{}', -- weeks with no training
  updated timestamptz not null default now()
);
alter table public.training enable row level security;
drop policy if exists "everyone reads training" on public.training;
create policy "everyone reads training" on public.training for select using (true);
drop policy if exists "coaches write training" on public.training;
create policy "coaches write training" on public.training for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.training to anon, authenticated;
grant insert, update on public.training to authenticated;
revoke insert, update, delete, truncate on public.training from anon;

insert into public.training (id, day, start, finish, venue, kit, notes, until) values
  (1, 'Wednesday', '18:00', '19:00', 'Greenfield School sports hall, Newton Aycliffe',
   'Indoor trainers, shin pads and a drink',
   'Training is indoors and the same every week until we go back outside at Easter. We''ll update this page when it changes.',
   '2027-03-24')
on conflict (id) do nothing;

-- ---------- Calendar feed ----------
-- The "calendar" edge function (supabase/functions/calendar) reads matches, tournaments and training with the
-- public key and serves them as an .ics feed that phones subscribe to. It runs with verify_jwt off because
-- calendar apps can't send a key; it only reads data that is already public.
