-- Added 2026-10-17: "Help and changes" requests from coaches. Safe to re-run.
-- Coaches send a request from the site's Help page. A scheduled Claude task reads new rows,
-- makes small data fixes itself, opens a pull request for code changes, and writes the answer
-- back into "reply" so the coach sees it on the same page. Big, unclear or destructive asks wait for Sean.
create table if not exists public.help_requests(
  id         uuid primary key default gen_random_uuid(),
  created    timestamptz not null default now(),
  email      text not null default lower(auth.jwt() ->> 'email'),   -- the coach who sent it
  kind       text not null default 'change' check (kind in ('fix','change','question','problem')),
  body       text not null check (length(body) between 3 and 4000),
  page       text default '',          -- which part of the site they were on
  screenshot text,                     -- optional small JPEG data URL (the site shrinks it first)
  status     text not null default 'new' check (status in ('new','working','waiting','done','declined')),
  reply      text default '',          -- Claude's or Sean's answer, shown to coaches
  link       text default '',          -- pull request or page to look at, if any
  updated    timestamptz not null default now()
);
create index if not exists help_requests_status on public.help_requests(status, created);
alter table public.help_requests enable row level security;

-- Coaches see every request (they run the team together) and can add their own.
-- Only the database owner (the scheduled task, or Sean in the dashboard) changes status and replies.
drop policy if exists "coaches read help" on public.help_requests;
create policy "coaches read help" on public.help_requests for select to authenticated using (public.is_coach());
drop policy if exists "coaches add help" on public.help_requests;
create policy "coaches add help" on public.help_requests for insert to authenticated
  with check (public.is_coach() and email = lower(auth.jwt() ->> 'email') and status = 'new' and coalesce(reply,'') = '' and coalesce(link,'') = '');
revoke all on public.help_requests from anon;
grant select, insert on public.help_requests to authenticated;
revoke update, delete, truncate on public.help_requests from authenticated;
