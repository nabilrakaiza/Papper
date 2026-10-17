-- The superadmin's Penjualan screen can now be set to any range of days, and
-- for that range it reads owner_sales_report instead of pulling orders,
-- order_items and order_payments to the phone and adding them up there. Over a
-- range of months those are far more rows than one PostgREST response carries,
-- so the total would quietly have stopped short.
--
-- The screen's bars show what customers paid (orderTotal), which `daily` did
-- not carry: it had gross and net, both before tax. This adds `collected` to
-- each day, the same per-order figure `summary.collected` sums, so the bars add
-- up to the headline total exactly.
--
-- The body of 20261007100000 with only that change. A key added to `daily` is
-- ignored by every build already deployed, and owner_sales_report and
-- daily_sales_report are untouched wrappers, so their callers keep working.

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
               'collected', coalesce(x.collected, 0),
               'orders', coalesce(x.orders, 0)
             ) order by d.day), '[]'::jsonb)
      from (select generate_series(p_from::timestamp, p_to::timestamp, interval '1 day')::date as day) d
      left join (
        select local_at::date as day, sum(gross) as gross, sum(net) as net,
               sum(collected) as collected, count(*) as orders
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
