-- A per-day order number, restarting at 1 at midnight Jakarta time.
--
-- `orders.id` never resets, so by now it reads like #15873 on a kitchen ticket
-- — too long to call across a room. `daily_number` is the short label for
-- people; `id` stays the identifier for everything else (links, foreign keys,
-- the payment screen). Because the number repeats every day it only means
-- something next to the order's date.
--
-- WHY A STORED COLUMN
--
-- Numbering on read (row_number() over the day, by id) would renumber a day
-- whenever an order in it is deleted, and orders are deleted: cancelling with
-- the manager PIN deletes the row, and so does the client's rollback of a save
-- that failed half-way. Tickets already in the kitchen would stop matching the
-- screen. A number stored at insert never changes.
--
-- WHY A COUNTER TABLE
--
-- "Highest number today + 1" has the same deletion problem in another form:
-- cancel the latest order and the next one is handed its number again, so two
-- different tickets say #15 on the same day. The counter only moves forward.
-- The upsert on it takes a row lock, so two cashiers inserting at the same
-- moment are handed consecutive numbers rather than the same one.
--
-- Gaps are expected: a cancelled order, or a save that failed after the order
-- row was written, has already used its number. An order is saved in several
-- requests (order, then items, then stock), so a later failure cannot hand it
-- back.
--
-- COMPATIBILITY
--
-- Additive only. Builds that predate this never name the column: they insert
-- without it (the trigger fills it in) and read orders with `select *`, which
-- simply carries one more field they ignore.

-- Held to the end of the migration so no order is inserted between the backfill
-- and the trigger taking over. Inserts wait for the commit rather than fail.
-- Needs the file to run as one transaction, which it does both under
-- `supabase db push` and when pasted whole into the SQL Editor.
--
-- Safe to replay: every step checks for what an earlier run already did.
lock table public.orders in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.orders add column if not exists daily_number integer;

-- ---------------------------------------------------------------------------
-- 2. The counter
-- ---------------------------------------------------------------------------

create table if not exists public.order_daily_counters (
  -- The calendar date in Asia/Jakarta, not UTC: a UTC date would restart the
  -- count at 07:00 in the middle of service.
  business_date date primary key,
  last_number integer not null
);

-- Only the trigger below touches this table, and it runs as its owner. No
-- policies, so it is unreachable over the API.
alter table public.order_daily_counters enable row level security;
revoke all on public.order_daily_counters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill
-- ---------------------------------------------------------------------------

-- Off while backfilling: it keeps an existing number from being changed, which
-- includes being filled in. Recreated in section 4.
drop trigger if exists orders_assign_daily_number on public.orders;

-- Every order without a number, numbered within its Jakarta day in the order it
-- was created, after any number that day already has. On the first run that is
-- every order, from 1; no ticket ever printed these, so there is nothing for
-- them to disagree with.
update public.orders o
set daily_number = numbered.n
from (
  select
    id,
    coalesce(max(daily_number) over (partition by day), 0)
      + row_number() over (partition by day, daily_number is null order by id) as n,
    daily_number
  from (
    select id, daily_number, (created_at at time zone 'Asia/Jakarta')::date as day
    from public.orders
    where created_at is not null
  ) d
) numbered
where o.id = numbered.id
  and numbered.daily_number is null;

-- Each day's counter carries on after the highest number that day has, so an
-- order placed today continues the day's sequence.
insert into public.order_daily_counters as c (business_date, last_number)
select (created_at at time zone 'Asia/Jakarta')::date, max(daily_number)
from public.orders
where daily_number is not null
group by 1
on conflict (business_date)
  do update set last_number = greatest(c.last_number, excluded.last_number);

-- The safety net: whatever happens to the counter, the database refuses two
-- orders with the same number on the same day.
create unique index if not exists orders_daily_number_key
  on public.orders (((created_at at time zone 'Asia/Jakarta')::date), daily_number);

-- ---------------------------------------------------------------------------
-- 4. The trigger
-- ---------------------------------------------------------------------------

create or replace function public.assign_order_daily_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Assigned once. A client sending its own value on an update is ignored
    -- rather than rejected, the same as stock_deducted_qty's derived flag.
    new.daily_number := old.daily_number;
    return new;
  end if;

  -- Always assigned here, whatever the client sent. created_at has a default,
  -- which is applied before BEFORE triggers run; now() covers a client that
  -- explicitly sent null.
  insert into public.order_daily_counters as c (business_date, last_number)
  values ((coalesce(new.created_at, now()) at time zone 'Asia/Jakarta')::date, 1)
  on conflict (business_date)
    do update set last_number = c.last_number + 1
  returning c.last_number into new.daily_number;

  return new;
end;
$$;

-- Invoked by its trigger only, never over the API.
revoke all on function public.assign_order_daily_number() from anon, authenticated, public;

-- Dropped in section 3, so this is always a fresh create.
create trigger orders_assign_daily_number
  before insert or update of daily_number on public.orders
  for each row execute function public.assign_order_daily_number();
