-- Added 2026-11-04: pitch fundraiser. Safe to re-run. Run it once on every team's database (SQL editor), or for a team
-- in its own schema: python3 tools/team_schema_sql.py <schema> --only 31_fundraiser.sql
--
-- Supporters buy a square on a picture of the team's pitch and put a name (and an optional message) on it.
-- It's a donation to the club, not a raffle: there are no prizes, no draw and no odds, so no gambling licence is needed.
-- Never add a prize to this. A prize makes it a lottery, and running a lottery for a club needs a Gambling Commission licence.
--
-- Money never comes through Touchline Tales. Each club links its own Stripe account (Stripe Connect, the club's account
-- pays Stripe's card fee) and supporters pay the club directly. Our fee (5%, nothing for Newton Aycliffe teams) is taken
-- by Stripe on each payment. All of that lives in the "fundraiser" edge function; this file only holds the pitch.
--
--   fundraisers    what the money is for, the goal, square prices, pitch size. Coaches set these up.
--   fund_squares   one row per square bought (or held for 35 minutes while someone pays). Only the edge function adds
--                  rows. Coaches see everything, including the supporter's email for a thank-you, and approve messages.
--   fund_board     what everyone sees: which squares are taken, the name on each (or "Anonymous"), and the message once
--                  a coach has approved it. Never the email or the amount.
--   fund_account   the club's Stripe account id. Only the edge function reads or writes it.
-- Nothing about children goes in these tables. The page asks supporters not to put children's surnames on squares.

create table if not exists public.fundraisers(
  id      bigint generated always as identity primary key,
  title   text not null check (length(btrim(title)) between 1 and 80),         -- what it's for, e.g. "New 9v9 goals"
  about   text check (about is null or length(about) <= 400),
  goal    int  not null check (goal between 10 and 1000000),                   -- pounds
  price   int  not null check (price between 100 and 100000),                  -- pence per square
  gold    int  check (gold is null or gold between 100 and 500000),            -- pence for a gold square, null = none
  cols    int  not null default 20 check (cols between 5 and 50),
  rows    int  not null default 10 check (rows between 5 and 40),
  ends    date,
  status  text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  created timestamptz not null default now()
);
alter table public.fundraisers enable row level security;
drop policy if exists "everyone reads live fundraisers" on public.fundraisers;
create policy "everyone reads live fundraisers" on public.fundraisers for select using (status <> 'draft' or public.is_coach());
drop policy if exists "coaches write fundraisers" on public.fundraisers;
create policy "coaches write fundraisers" on public.fundraisers for all to authenticated using (public.is_coach()) with check (public.is_coach());
grant select on public.fundraisers to anon, authenticated;
grant insert, update, delete on public.fundraisers to authenticated;

create table if not exists public.fund_squares(
  id         bigint generated always as identity primary key,
  fundraiser bigint not null references public.fundraisers(id) on delete cascade,
  idx        int check (idx is null or idx >= 0),          -- square number, left to right then top to bottom; null = paid but its square was lost
  state      text not null default 'held' check (state in ('held', 'paid', 'refunded')),
  name       text not null check (length(btrim(name)) between 1 and 30),
  message    text check (message is null or length(message) <= 80),
  anon       boolean not null default false,               -- show as "Anonymous"
  gold       boolean not null default false,
  amount     int,                                          -- pence the supporter paid, card fee included
  fee        int,                                          -- pence Touchline Tales kept
  email      text check (email is null or length(email) <= 200),
  approved   boolean not null default false,               -- the message shows once a coach approves it
  hidden     boolean not null default false,               -- a coach hid the name and message
  session    text,                                         -- Stripe checkout session
  payment    text,                                         -- Stripe payment intent, for refunds
  held_until timestamptz,
  created    timestamptz not null default now(),
  paid_at    timestamptz
);
create unique index if not exists fund_squares_one_per_square on public.fund_squares(fundraiser, idx) where state in ('held', 'paid') and idx is not null;
create index if not exists fund_squares_session on public.fund_squares(session);
alter table public.fund_squares enable row level security;
drop policy if exists "coaches read squares" on public.fund_squares;
create policy "coaches read squares" on public.fund_squares for select to authenticated using (public.is_coach());
drop policy if exists "coaches moderate squares" on public.fund_squares;
create policy "coaches moderate squares" on public.fund_squares for update to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.fund_squares from anon;
grant select on public.fund_squares to authenticated;
-- coaches only ever change these two; everything else is the edge function's
revoke update on public.fund_squares from authenticated;
grant update (approved, hidden) on public.fund_squares to authenticated;

-- what everyone sees. A view runs as its owner, so it can read past the coaches-only rule above, but only these columns.
create or replace view public.fund_board as
  select s.fundraiser, s.idx, s.gold, s.state,
         case when s.state <> 'paid' then null when s.hidden then 'A supporter' when s.anon then 'Anonymous' else s.name end as name,
         case when s.state = 'paid' and s.approved and not s.hidden then s.message end as message,
         s.paid_at
    from public.fund_squares s
    join public.fundraisers f on f.id = s.fundraiser and f.status <> 'draft'
   where s.idx is not null and (s.state = 'paid' or (s.state = 'held' and s.held_until > now()));
grant select on public.fund_board to anon, authenticated;

-- money raised so far (pence before fees), so the progress bar doesn't need every row
create or replace function public.fund_total(p_fundraiser bigint) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('raised', coalesce(sum(case when s.gold then coalesce(f.gold, f.price) else f.price end), 0), 'squares', count(*))
    from public.fund_squares s join public.fundraisers f on f.id = s.fundraiser
   where s.fundraiser = p_fundraiser and s.state = 'paid' and f.status <> 'draft';
$$;
grant execute on function public.fund_total(bigint) to anon, authenticated;

create table if not exists public.fund_account(
  id      int primary key default 1 check (id = 1),
  stripe  text,                                   -- the club's Stripe account id (acct_...)
  ready   boolean not null default false,         -- Stripe says it can take payments
  updated timestamptz not null default now()
);
alter table public.fund_account enable row level security;   -- no policies: only the edge function (service role) uses it
revoke all on public.fund_account from anon, authenticated;
