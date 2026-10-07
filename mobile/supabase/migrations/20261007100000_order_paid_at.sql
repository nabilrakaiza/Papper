-- A paid order is counted on the day it was paid, not the day it was taken.
--
-- Until now every sales figure was dated by orders.created_at. A table that
-- ordered on the 1st and settled on the 2nd put its money into the 1st's
-- figures — a day whose drawer was already counted and closed — and the 2nd's
-- drawer held cash that the 2nd's report knew nothing about.
--
-- `orders.paid_at` is the moment an order first became 'paid', and it is what
-- the sales report now selects and buckets by.
--
-- ---------------------------------------------------------------------------
-- The rule
-- ---------------------------------------------------------------------------
--
--   An order belongs to the day of coalesce(paid_at, created_at).
--
-- Paid: the day it was paid. Still open or cancelled before it was ever paid:
-- the day it was taken, since there is no other day to give it.
--
-- A SPLIT BILL is one order, and becomes 'paid' when its last payer settles.
-- All of it is counted on that day, including shares handed over on an earlier
-- one. The alternative — each share on its own day — reconciles a drawer to
-- the rupiah but cannot be extended to what was sold: items and HPP belong to
-- the order, not to a payer, and would still need a single date.
--
-- A CORRECTION does not move an order. paid_at is stamped once and survives
-- reopen_order_with_pin, so an order from last week that is reopened and
-- settled again today stays in last week's figures, exactly as it did when
-- they were dated by created_at. Otherwise fixing one line on an old bill would
-- lift the whole bill out of its week and drop it into today.
--
-- NOT changed: the daily order number, the stock usage report and owner_orders
-- all stay on created_at. They describe when an order was taken — what number
-- was called, when ingredients were used, what came through the door — and
-- none of them is a statement about money.
--
-- The busy-hours figures (`hourly`) also stay on the hour the order was taken.
-- Which orders are in the report is decided by paid_at like everything else;
-- only the hour each one is filed under comes from created_at.
--
-- ---------------------------------------------------------------------------
-- Why a trigger
-- ---------------------------------------------------------------------------
--
-- The app marks an order paid with a plain update of `status`. Stamping
-- paid_at in the database means the builds already on the tablets record it
-- without being updated, and that the time is the server's rather than
-- whatever a tablet's clock says. A client that sends its own paid_at is
-- ignored, the same way daily_number treats one.
--
-- Written to run as one transaction, which is what happens both under
-- `supabase db push` and when pasted whole into the SQL Editor.
--
-- Safe to replay: every step checks for what an earlier run already did.
lock table public.orders in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists paid_at timestamptz;

comment on column public.orders.paid_at is
  'When the order first became ''paid''. Stamped by trigger, never by the client, and kept through a correction. Sales are dated by this; see docs/database.md#orders.';

-- ---------------------------------------------------------------------------
-- 2. Orders that are already paid
-- ---------------------------------------------------------------------------
--
-- The trigger is dropped first: once it exists it resets any paid_at a plain
-- update tries to write, which on a replay would undo this backfill.

drop trigger if exists orders_stamp_paid_at on public.orders;

-- The time of the order's own settlement: its latest original payment row.
-- Correction rows (reopen_seq > 0) are left out, so an order corrected since
-- keeps the day it was first paid. Orders settled before order_payments
-- existed had their payment rows written with the order's created_at
-- (20260906100000), so they stay on the day they were already reported under.
--
-- `reopen_seq > 0` catches an order that is reopened at this moment: it is
-- 'unpaid' right now, but it has been paid, and must come back to that day
-- when it is settled again.
update public.orders o
set paid_at = coalesce(
      (select max(op.created_at)
         from public.order_payments op
        where op.order_id = o.id
          and op.reopen_seq = 0),
      o.created_at)
where o.paid_at is null
  and (o.status = 'paid' or o.reopen_seq > 0);

create index if not exists orders_paid_at_idx on public.orders (paid_at);

-- ---------------------------------------------------------------------------
-- 3. Stamped once, by the database
-- ---------------------------------------------------------------------------

create or replace function public.stamp_order_paid_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.paid_at := case when new.status = 'paid' then now() end;
    return new;
  end if;

  if old.paid_at is not null then
    -- Assigned once. Reopening and settling again does not move it.
    new.paid_at := old.paid_at;
  elsif new.status = 'paid' and old.status is distinct from 'paid' then
    new.paid_at := now();
  else
    new.paid_at := null;
  end if;

  return new;
end;
$$;

-- Invoked by its trigger only, never over the API.
revoke all on function public.stamp_order_paid_at() from anon, authenticated, public;

-- Dropped in section 2, so this is always a fresh create.
create trigger orders_stamp_paid_at
  before insert or update on public.orders
  for each row execute function public.stamp_order_paid_at();

-- ---------------------------------------------------------------------------
-- 4. The sales report, by payment day
-- ---------------------------------------------------------------------------
--
-- The body of 20260929100100 with three changes: orders are selected by
-- paid_at, `daily` and `weekday` bucket by it, and `hourly` keeps the hour the
-- order was taken. owner_sales_report and daily_sales_report call this and are
-- untouched — same names, arguments and result shape, so the dashboard and
-- every build already deployed keep working and simply get the new dating.

create or replace function public.sales_report_data(
  p_from date,
  p_to   date
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_from   timestamptz;
  v_to     timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Jakarta';
  v_to   := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';

  with
  paid as (
    select o.id,
           o.paid_at    at time zone 'Asia/Jakarta'              as local_at,
           o.created_at at time zone 'Asia/Jakarta'              as ordered_at,
           least(greatest(coalesce(o.discount, 0), 0), 100)      as discount,
           least(greatest(coalesce(o.tax, 10), 0), 100)           as tax
    from orders o
    where o.status = 'paid'
      and o.paid_at >= v_from
      and o.paid_at <  v_to
  ),
  menu_cost as (
    select m.id as menu_id,
           m.name,
           m.category,
           (case
              when coalesce(m.cogs_mode, 'ingredients') = 'manual' then m.manual_cogs
              else (
                select sum(mi.quantity * s.price_per_unit)
                from menu_ingredients mi
                join stock s on s.id = mi.stock_id
                where mi.menu_id = m.id
              )
            end) * 1.10 as unit_cogs  -- ADDITIONAL_COGS_PERCENT
    from menus m
  ),
  lines as (
    select p.id                                   as order_id,
           p.discount,
           oi.menu_id,
           oi.name                                as line_name,
           oi.quantity::numeric                   as qty,
           (oi.price * oi.quantity)::numeric      as gross,
           (oi.price * oi.quantity)::numeric
             * (1 - p.discount / 100.0)           as net,
           mc.unit_cogs * oi.quantity             as cogs,
           mc.name                                as menu_name,
           mc.category
    from paid p
    join order_items oi on oi.order_id = p.id
    left join menu_cost mc on mc.menu_id = oi.menu_id
  ),
  per_order as (
    select p.id, p.local_at, p.ordered_at, p.discount, p.tax,
           coalesce(sum(l.gross), 0) as gross
    from paid p
    left join lines l on l.order_id = p.id
    group by p.id, p.local_at, p.ordered_at, p.discount, p.tax
  ),
  order_money as (
    select id, local_at, ordered_at, gross,
           floor(gross::float8 * (1::float8 - discount::float8 / 100::float8)
                 + 0.5)::bigint as net,
           floor(gross::float8 * (1::float8 - discount::float8 / 100::float8)
                 * (1::float8 + tax::float8 / 100::float8) + 0.5)::bigint as collected
    from per_order
  ),
  items as (
    select l.menu_id,
           case when l.menu_id is null then trim(min(l.line_name)) else max(l.menu_name) end as name,
           case when l.menu_id is null then 'Custom'
                else coalesce(max(l.category), 'Lain Lain') end                     as category,
           sum(l.qty)                         as qty,
           sum(l.gross)                       as gross,
           round(sum(l.net))                  as net,
           round(sum(l.cogs))                 as cogs
    from lines l
    -- Custom lines have no menu row; the typed name is all that ties them
    -- together, so "Sambal" and "sambal" are one item.
    group by l.menu_id, case when l.menu_id is null then lower(trim(l.line_name)) end
  ),
  payments as (
    select op.order_id,
           op.method_of_payment as method,
           op.amount,
           op.reopen_seq = 0 as is_original,
           row_number() over (partition by op.order_id order by op.amount desc, op.id) as rn,
           sum(op.amount) over (partition by op.order_id) as charged
    from order_payments op
    join order_money om on om.id = op.order_id
  ),
  -- Mirrors the Penjualan breakdown: each split share was rounded on its own,
  -- so the residual against the order's total goes on the largest share and
  -- the methods add up to `collected` exactly. A paid order with no payment
  -- row lands under a NULL method instead of being credited to a real one.
  --
  -- order_payments is a ledger (20260912091000): a correction appends a row,
  -- negative when money went back. Amounts are summed as they stand, so a
  -- refund nets out of the method it was paid from. Only original settlements
  -- are counted as payments — a correction row is an adjustment to one, and
  -- counting it would make a corrected bill look like two customers.
  payment_shares as (
    select p.method,
           p.is_original,
           p.amount + case when p.rn = 1 then om.collected - p.charged else 0 end as amount
    from payments p
    join order_money om on om.id = p.order_id
    union all
    select null, true, om.collected
    from order_money om
    where not exists (select 1 from order_payments op where op.order_id = om.id)
  )
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'transactions', count(*),
        'gross',        coalesce(sum(gross), 0),
        'net',          coalesce(sum(net), 0),
        'discount',     coalesce(sum(gross) - sum(net), 0),
        'tax',          coalesce(sum(collected - net), 0),
        'collected',    coalesce(sum(collected), 0)
      )
      from order_money
    ),
    'costing', (
      select jsonb_build_object(
        'cogs',          coalesce(round(sum(cogs)), 0),
        'costed_net',    coalesce(round(sum(net) filter (where cogs is not null)), 0),
        'uncosted_net',  coalesce(round(sum(net) filter (where cogs is null)), 0)
      )
      from lines
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date',   d.day,
               'gross',  coalesce(x.gross, 0),
               'net',    coalesce(x.net, 0),
               'orders', coalesce(x.orders, 0)
             ) order by d.day), '[]'::jsonb)
      from (select generate_series(p_from::timestamp, p_to::timestamp, interval '1 day')::date as day) d
      left join (
        select local_at::date as day, sum(gross) as gross, sum(net) as net, count(*) as orders
        from order_money group by 1
      ) x on x.day = d.day
    ),
    'weekday', (
      -- 0 = Sunday, as Postgres's dow and JavaScript's getDay() both count.
      select jsonb_agg(jsonb_build_object(
               'dow',    d.dow,
               'gross',  coalesce(x.gross, 0),
               'orders', coalesce(x.orders, 0)
             ) order by d.dow)
      from generate_series(0, 6) as d(dow)
      left join (
        select extract(dow from local_at)::int as dow, sum(gross) as gross, count(*) as orders
        from order_money group by 1
      ) x on x.dow = d.dow
    ),
    'hourly', (
      select jsonb_agg(jsonb_build_object(
               'hour',   h.hour,
               'gross',  coalesce(x.gross, 0),
               'orders', coalesce(x.orders, 0)
             ) order by h.hour)
      from generate_series(0, 23) as h(hour)
      left join (
        -- The hour the order was taken, not the hour it was paid: this chart
        -- answers "when is the kitchen busy", which the till does not know.
        select extract(hour from ordered_at)::int as hour, sum(gross) as gross, count(*) as orders
        from order_money group by 1
      ) x on x.hour = h.hour
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'menu_id',  menu_id,
               'name',     name,
               'category', category,
               'qty',      qty,
               'gross',    gross,
               'net',      net,
               'cogs',     cogs
             ) order by qty desc, gross desc), '[]'::jsonb)
      from items
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'method', method,
               'count',  n,
               'amount', amount
             ) order by amount desc), '[]'::jsonb)
      from (
        select method, count(*) filter (where is_original) as n, sum(amount) as amount
        from payment_shares group by method
      ) m
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.sales_report_data(date, date) from public, anon, authenticated;
