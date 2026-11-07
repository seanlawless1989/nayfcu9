-- Added 2026-11-07: subs and payments. Safe to re-run. Needs 10_parent_login.sql and 32_fundraiser.sql first (it uses
-- is_parent_of and the club's Stripe link in fund_account). Run it once on every team's database (SQL editor), or for a
-- team in its own schema: python3 tools/team_schema_sql.py <schema> --only 34_subs.sql
--
-- Coaches set the monthly subs (and one-off costs like a party or a training top) and tick off who has paid. Families
-- signed in with their family code see what their own child owes and can pay it online, by card or monthly Direct
-- Debit, straight to the club's own Stripe account. Cash and bank transfers are ticked off by a coach, free.
-- Money never comes through Touchline Tales. Our fee on online payments (1%, nothing for Newton Aycliffe teams) is taken
-- by Stripe on each payment. All the Stripe side lives in the "fundraiser" edge function.
--
--   subs_plan      the team's monthly subs: amount, the day it's due, Direct Debit and card on or off. One row.
--   subs_player    a different amount for one player (a sibling or hardship discount), or "doesn't pay".
--   pay_items      one-off costs for every player: title, amount, due date.
--   payments       one row per payment: subs for a month, or a one-off cost. Coaches add cash and bank transfers;
--                  the edge function adds Stripe payments.
--   subs_mandates  a family's monthly Direct Debit or card subscription in Stripe, one per player.
-- WHO CAN SEE IT: coaches see and change everything. A family signed in with their family code sees the plan, the
-- one-off costs, and only their own child's payments, discount and subscription. Visitors (anon) see nothing.
-- Only the player's first name (as in players.name) is stored here, never a parent's name or bank details.

create table if not exists public.subs_plan(
  id      int primary key default 1 check (id = 1),
  amount  int check (amount is null or amount between 100 and 100000),          -- pence a month per player
  day     int not null default 1 check (day between 1 and 28),                   -- due on this day of each month
  dd      boolean not null default true,                                         -- families can pay by monthly Direct Debit
  card    boolean not null default true,                                         -- ... or by card (monthly or one month)
  about   text check (about is null or length(about) <= 200),                    -- what it covers, shown to families
  live    boolean not null default false,                                        -- families see it
  updated timestamptz not null default now()
);
alter table public.subs_plan enable row level security;
drop policy if exists "signed in read the subs plan" on public.subs_plan;
create policy "signed in read the subs plan" on public.subs_plan for select to authenticated using (live or public.is_coach());
drop policy if exists "coaches write the subs plan" on public.subs_plan;
create policy "coaches write the subs plan" on public.subs_plan for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.subs_plan from anon, public;
grant select, insert, update, delete on public.subs_plan to authenticated;

create table if not exists public.subs_player(
  player  text primary key check (length(btrim(player)) between 1 and 60),
  amount  int check (amount is null or amount between 0 and 100000),            -- pence a month instead of the plan's
  exempt  boolean not null default false,                                        -- doesn't pay subs (e.g. a coach's child)
  note    text check (note is null or length(note) <= 80),                       -- coaches only
  updated timestamptz not null default now()
);
alter table public.subs_player enable row level security;
drop policy if exists "coaches and own family read subs amounts" on public.subs_player;
create policy "coaches and own family read subs amounts" on public.subs_player for select to authenticated
  using (public.is_coach() or public.is_parent_of(player));
drop policy if exists "coaches write subs amounts" on public.subs_player;
create policy "coaches write subs amounts" on public.subs_player for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.subs_player from anon, public;
grant select, insert, update, delete on public.subs_player to authenticated;

create table if not exists public.pay_items(
  id      bigint generated always as identity primary key,
  title   text not null check (length(btrim(title)) between 1 and 60),           -- e.g. "Christmas party"
  amount  int not null check (amount between 50 and 100000),                     -- pence per player
  due     date,
  open    boolean not null default true,                                         -- false = finished, families no longer asked
  created timestamptz not null default now()
);
alter table public.pay_items enable row level security;
drop policy if exists "signed in read one-off costs" on public.pay_items;
create policy "signed in read one-off costs" on public.pay_items for select to authenticated using (true);
drop policy if exists "coaches write one-off costs" on public.pay_items;
create policy "coaches write one-off costs" on public.pay_items for all to authenticated using (public.is_coach()) with check (public.is_coach());
revoke all on public.pay_items from anon, public;
grant select, insert, update, delete on public.pay_items to authenticated;

create table if not exists public.payments(
  id      bigint generated always as identity primary key,
  player  text not null check (length(btrim(player)) between 1 and 60),
  month   date check (month is null or extract(day from month) = 1),             -- subs: the month paid for
  item    bigint references public.pay_items(id) on delete cascade,              -- or the one-off cost paid for
  amount  int not null default 0 check (amount between 0 and 1000000),           -- pence
  method  text not null check (method in ('cash', 'bank', 'card', 'dd', 'other', 'waived')),
  state   text not null default 'paid' check (state in ('paid', 'pending', 'failed', 'refunded')),
  ref     text unique,                                                           -- Stripe's id (invoice or payment), null for cash
  note    text check (note is null or length(note) <= 80),
  created timestamptz not null default now(),
  check ((month is null) <> (item is null))
);
create index if not exists payments_player on public.payments(player);
create index if not exists payments_month on public.payments(month);
alter table public.payments enable row level security;
drop policy if exists "coaches and own family read payments" on public.payments;
create policy "coaches and own family read payments" on public.payments for select to authenticated
  using (public.is_coach() or public.is_parent_of(player));
drop policy if exists "coaches tick off payments" on public.payments;
create policy "coaches tick off payments" on public.payments for insert to authenticated
  with check (public.is_coach() and ref is null);
drop policy if exists "coaches change ticked off payments" on public.payments;
create policy "coaches change ticked off payments" on public.payments for update to authenticated
  using (public.is_coach() and ref is null) with check (public.is_coach() and ref is null);
drop policy if exists "coaches remove ticked off payments" on public.payments;
create policy "coaches remove ticked off payments" on public.payments for delete to authenticated
  using (public.is_coach() and ref is null);
revoke all on public.payments from anon, public;
grant select, insert, update, delete on public.payments to authenticated;

create table if not exists public.subs_mandates(
  player  text primary key check (length(btrim(player)) between 1 and 60),
  sub     text not null,                                                         -- Stripe subscription id (sub_...)
  method  text not null check (method in ('card', 'dd')),
  status  text not null default 'active',                                        -- Stripe's status: active, past_due, canceled...
  amount  int,
  started timestamptz not null default now(),
  updated timestamptz not null default now()
);
alter table public.subs_mandates enable row level security;
drop policy if exists "coaches and own family read subscriptions" on public.subs_mandates;
create policy "coaches and own family read subscriptions" on public.subs_mandates for select to authenticated
  using (public.is_coach() or public.is_parent_of(player));
revoke all on public.subs_mandates from anon, public;
grant select on public.subs_mandates to authenticated;    -- only the edge function (service role) writes
