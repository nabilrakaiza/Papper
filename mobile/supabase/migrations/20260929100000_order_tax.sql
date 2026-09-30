-- Tax becomes a per-order figure the cashier can change.
--
-- Until now every order was taxed at a flat 10%, held once in TAX_RATE
-- (lib/constants.ts) and repeated as 0.1 in owner_sales_report and
-- owner_orders. The cashier now sets the rate on the payment screen the same
-- way as the discount, so it has to live on the order, next to the discount.
--
-- ---------------------------------------------------------------------------
-- Existing orders
-- ---------------------------------------------------------------------------
--
-- Every order ever taken was charged 10%, so that is the column's default and
-- what ADD COLUMN writes into every existing row — no separate backfill, and no
-- table rewrite on Postgres 11+, where a constant default is stored once in the
-- catalogue.
--
-- The default is also what keeps the builds already installed on the tablets
-- working. There is no OTA channel, so for a while they will run next to the
-- new build. They insert orders without naming the column, and get 10 — which
-- is exactly the rate they then calculate with. They never write the column, so
-- they cannot disturb a rate the new build has set; they can only mis-display
-- one, which is why the tablets should all be updated before anyone charges a
-- rate other than 10.
--
-- ---------------------------------------------------------------------------
-- A whole-number percentage, 0–100
-- ---------------------------------------------------------------------------
--
-- Same shape as `discount`, and checked the same way. The payment screen will
-- not let a figure outside 0–100 be typed, and orderTotal() clamps to it; the
-- constraint is what holds when neither of those is in the way.
--
-- ---------------------------------------------------------------------------
-- The reports
-- ---------------------------------------------------------------------------
--
-- Both functions are otherwise exactly as in 20260926100100_owner_reports.sql.
-- The only change is that the tax factor comes from the order:
--
--   JS:  Math.round(subtotal * (1 - discount / 100) * (1 + tax / 100))
--   SQL: floor(gross * (1 - discount / 100) * (1 + tax / 100) + 0.5)
--
-- in float8, in the same operation order. At 10 the factor is 1 + 10/100, the
-- same double as the old 1 + 0.1, so no total recorded before this migration
-- moves by a rupiah. The coalesce to 10 only matters for a row somehow read
-- with the column NULL, which the NOT NULL below rules out.

alter table public.orders
  add column if not exists tax integer not null default 10;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_tax_check'
  ) then
    alter table public.orders
      add constraint orders_tax_check check (tax >= 0 and tax <= 100);
  end if;
end $$;

comment on column public.orders.tax is
  'Tax as a whole-number percentage, 0-100. 10 for every order taken before it became editable.';

-- ---------------------------------------------------------------------------
-- Sales: the tax factor per order
-- ---------------------------------------------------------------------------

create or replace function public.owner_sales_report(
  p_from date,
  p_to   date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from   timestamptz;
  v_to     timestamptz;
  v_result jsonb;
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role in ('owner', 'superadmin')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Jakarta';
  v_to   := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';

  with
  paid as (
    select o.id,
           o.created_at at time zone 'Asia/Jakarta'              as local_at,
           least(greatest(coalesce(o.discount, 0), 0), 100)      as discount,
           least(greatest(coalesce(o.tax, 10), 0), 100)           as tax
    from orders o
    where o.status = 'paid'
      and o.created_at >= v_from
      and o.created_at <  v_to
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
    select p.id, p.local_at, p.discount, p.tax,
           coalesce(sum(l.gross), 0) as gross
    from paid p
    left join lines l on l.order_id = p.id
    group by p.id, p.local_at, p.discount, p.tax
  ),
  order_money as (
    select id, local_at, gross,
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
        select extract(hour from local_at)::int as hour, sum(gross) as gross, count(*) as orders
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

revoke all on function public.owner_sales_report(date, date) from public, anon;
grant execute on function public.owner_sales_report(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Orders: the tax factor per order, and the rate itself for the detail view
-- ---------------------------------------------------------------------------

create or replace function public.owner_orders(
  p_from   date,
  p_to     date,
  p_status text default null,
  p_search text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from   timestamptz;
  v_to     timestamptz;
  v_result jsonb;
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role in ('owner', 'superadmin')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Jakarta';
  v_to   := (p_to + 1)::timestamp at time zone 'Asia/Jakarta';

  with
  matched as (
    select o.*
    from orders o
    where o.created_at >= v_from
      and o.created_at <  v_to
      and (p_status is null or o.status = p_status)
      and (
        nullif(trim(p_search), '') is null
        or o.customer_name ilike '%' || trim(p_search) || '%'
        or o.daily_number::text = trim(p_search)
      )
  ),
  page as (
    select m.*
    from matched m
    order by m.created_at desc, m.id desc
    limit greatest(least(coalesce(p_limit, 50), 200), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total_count', (select count(*) from matched),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',            p.id,
               'daily_number',  p.daily_number,
               'created_at',    p.created_at,
               'customer_name', p.customer_name,
               'seat',          p.seat,
               'is_dine_in',    p.is_dine_in,
               'status',        p.status,
               'discount',      p.discount,
               'tax',           p.tax,
               'reopen_seq',    p.reopen_seq,
               'item_count',    li.item_count,
               'total',         floor(li.gross::float8
                                  * (1::float8 - least(greatest(coalesce(p.discount, 0), 0), 100)::float8 / 100::float8)
                                  * (1::float8 + least(greatest(coalesce(p.tax, 10), 0), 100)::float8 / 100::float8)
                                  + 0.5)::bigint,
               'methods',       pm.methods
             ) order by p.created_at desc, p.id desc)
      from page p
      cross join lateral (
        select coalesce(sum(oi.quantity), 0) as item_count,
               coalesce(sum(oi.price * oi.quantity), 0) as gross
        from order_items oi where oi.order_id = p.id
      ) li
      cross join lateral (
        select coalesce(jsonb_agg(distinct op.method_of_payment), '[]'::jsonb) as methods
        from order_payments op where op.order_id = p.id
      ) pm
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.owner_orders(date, date, text, text, integer, integer) from public, anon;
grant execute on function public.owner_orders(date, date, text, text, integer, integer) to authenticated;
