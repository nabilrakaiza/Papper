-- Move payment facts out of `orders` and into `order_payments`.
--
-- `orders` carried two payment columns: method_of_payment, and payment_amount
-- that meant different things depending on the method — the cash tendered for
-- Cash, the bill for everything else. That overloading is why the sales
-- breakdown could not sum it (see admin/sales.tsx) and why the receipt printed
-- a recomputed total for non-cash rather than trusting it. order_payments keeps
-- the two apart: `amount` is always the bill, `amount_tendered` is only ever
-- cash handed over.
--
-- This migration only backfills. Dropping the old columns is a separate,
-- deliberately later step held in supabase/pending/ — the builds installed on
-- the tablets still write both columns in markPaid, so removing them stops
-- those tills taking payment. See that file for the rollout order.
--
-- The tax rate is written as 1.1 here, duplicating TAX_RATE in lib/constants.ts.
-- That duplication is confined to this one historical backfill and is not a
-- second source of truth: nothing computes a live total in SQL. It was verified
-- against the stored figures before running — for all eleven non-cash orders the
-- computed amount matched orders.payment_amount to the rupiah, which is the
-- check that this formula agrees with orderTotal().

do $$
declare
  v_backfilled integer;
begin
  -- enforce_payments_locked_after_payment refuses any write to order_payments
  -- for an order that is already 'paid' — which is every row this backfills.
  -- app.pin_verified is that trigger's designed exemption, the same one the PIN
  -- RPCs use, and it is transaction-local so it cannot leak past this block.
  perform set_config('app.pin_verified', 'true', true);

  insert into public.order_payments (
    order_id, customer_num, customer_label,
    amount, amount_tendered, method_of_payment, created_at
  )
  select
    o.id,
    1,
    -- No per-payer name: these orders were settled by one person before split
    -- billing existed, and inventing a label would be inventing a fact.
    null,
    round(
      coalesce(t.subtotal, 0)
      * (1 - least(greatest(o.discount, 0), 100) / 100.0)
      * 1.1
    )::integer,
    -- Only cash has a tender distinct from the bill. For every other method
    -- payment_amount held the bill itself, so carrying it over as "tendered"
    -- would claim a cash-handling detail that never happened.
    case when o.method_of_payment = 'Cash' then o.payment_amount end,
    o.method_of_payment,
    -- The order's own timestamp: closer to the truth than now(), and it keeps
    -- these rows inside the period they belong to for any report that groups
    -- payments by date.
    o.created_at
  from public.orders o
  left join lateral (
    select sum(oi.price * oi.quantity) as subtotal
    from public.order_items oi
    where oi.order_id = o.id
  ) t on true
  where o.status = 'paid'
    and o.method_of_payment is not null
    -- Idempotent, and it means a replay cannot touch an order that has since
    -- been settled as a split bill.
    and not exists (
      select 1 from public.order_payments p where p.order_id = o.id
    );

  get diagnostics v_backfilled = row_count;
  raise notice 'backfilled % payment rows', v_backfilled;
end $$;
