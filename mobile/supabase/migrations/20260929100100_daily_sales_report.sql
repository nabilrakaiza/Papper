-- The cashier's Penjualan Harian screen gets the owner dashboard's numbers.
--
-- The cashier wants to see how today was paid — how much by QRIS, how much by
-- debit — and the rest of what the owner's Ringkasan, Menu and Pembayaran pages
-- show, as plain figures. owner_sales_report already computes all of it, to the
-- rupiah and in agreement with every other screen; the only things in the way
-- are its role check and the cost figures.
--
-- So its body moves, unchanged, into sales_report_data, which nothing outside
-- the database can call. Two thin wrappers sit in front of it:
--
--   owner_sales_report(from, to)  owner and superadmin, exactly as before —
--                                 same name, arguments and result, so the
--                                 dashboard and any build already deployed
--                                 against it see no difference.
--
--   daily_sales_report(date)      any staff account, one Jakarta calendar day,
--                                 with every cost figure taken out.
--
-- One calculation behind both means the cashier's figures for a day and the
-- owner's for the same day cannot drift apart: a change to how money is counted
-- is made once and lands on both.
--
-- ---------------------------------------------------------------------------
-- What the cashier does not see
-- ---------------------------------------------------------------------------
--
-- HPP, and therefore gross profit and margin. `costing` is dropped whole, and
-- `cogs` is taken off every item. Nothing else is held back: a cashier can
-- already read every order, line and payment directly (the read policies on
-- those tables test only that the caller is signed in), so the rest of the
-- report tells them nothing they could not add up themselves.
--
-- `daily` and `weekday` are dropped too — over a single day they are one row
-- and seven mostly-empty ones, and the screen has no use for either.
--
-- ---------------------------------------------------------------------------
-- Which orders count
-- ---------------------------------------------------------------------------
--
-- The same as the owner's: orders PAID and CREATED on that Jakarta date, with
-- their payments. An order still open counts nowhere in this report, including
-- the shares already paid on a split bill still waiting for its last payer —
-- the screen's own Dibayar / Belum Bayar cards, which it keeps, cover those.

-- ---------------------------------------------------------------------------
-- 1. The calculation, callable only from inside the database
-- ---------------------------------------------------------------------------
--
-- Not SECURITY DEFINER: it only ever runs inside one of the definer wrappers
-- below, which already execute as the function owner. Execute is revoked from
-- every API role, so it cannot be called directly to skip their role checks.

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

revoke all on function public.sales_report_data(date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The owner's report: the same result as before, from the shared body
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
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role in ('owner', 'superadmin')
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return public.sales_report_data(p_from, p_to);
end;
$$;

revoke all on function public.owner_sales_report(date, date) from public, anon;
grant execute on function public.owner_sales_report(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The cashier's report: one day, no costs
-- ---------------------------------------------------------------------------
--
-- Any account with a profile, which is every staff role. An owner or
-- superadmin calling it just gets less than their own report gives them.

create or replace function public.daily_sales_report(
  p_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report jsonb;
begin
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if p_date is null then
    raise exception 'Invalid date' using errcode = '22023';
  end if;

  v_report := public.sales_report_data(p_date, p_date);

  return (v_report - 'costing' - 'daily' - 'weekday')
    || jsonb_build_object(
         'items',
         coalesce((
           select jsonb_agg(item - 'cogs' order by ord)
           from jsonb_array_elements(v_report -> 'items') with ordinality as t(item, ord)
         ), '[]'::jsonb)
       );
end;
$$;

revoke all on function public.daily_sales_report(date) from public, anon;
grant execute on function public.daily_sales_report(date) to authenticated;
