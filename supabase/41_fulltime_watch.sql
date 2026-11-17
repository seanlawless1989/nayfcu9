-- Full-Time watch from any visitor's phone (supabase/functions/ftwatch).
-- Run ONCE in the NAYFC Supabase project (elqwksyqwezhkekdqivn), in public only: it covers every team schema.
-- Safe to run again. Nobody can read or write these through the website (RLS on, no policies): only ftwatch does.

-- a change to a game that a phone (not a coach's) saw on Full-Time; two different phones must agree before it's applied
create table if not exists public.ft_watch_seen (
  schema   text not null,
  match_id text not null,
  sig      text not null,          -- "date|ko|venue" as Full-Time shows it now
  reporter text not null,          -- hash of the phone's network address (or of a coach's email)
  at       timestamptz not null default now(),
  primary key (schema, match_id, sig, reporter)
);
alter table public.ft_watch_seen enable row level security;

-- every game ftwatch moved, so a wrong change can be found and put back
create table if not exists public.ft_watch_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  schema   text not null,
  match_id text not null,
  was      text,
  now      text,
  by       text                    -- "coach" or "phones"
);
alter table public.ft_watch_log enable row level security;

-- tidy: sightings older than a week aren't needed (run by hand now and then, or leave it, the table stays tiny)
delete from public.ft_watch_seen where at < now() - interval '7 days';
