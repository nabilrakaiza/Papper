-- Editing an order's lines in place, instead of replacing all of them.
--
-- updateOrder used to delete every row for an order and reinsert the lot, then
-- hand-roll a revert if the insert or the stock deduction failed. Two bugs came
-- out of that shape, both recorded in docs/database.md:
--
--   * is_stock_deducted was hardcoded false on reinsert, so every re-save
--     deducted the whole order's ingredients again;
--   * the revert built its rows with a `category` key that order_items has no
--     column for, so the revert insert failed — in the one situation where the
--     revert is all that stands between the cafe and a lost order.
--
-- Both are the same root cause: a full rewrite has to restate every column, so
-- any column it forgets is silently destroyed. That is a trap that resets
-- itself every time a column is added — and this release adds customer_num.
--
-- Here the payload names the rows it is changing. A column that is absent is
-- left exactly as it is, so no future column can be dropped by an edit that
-- predates it. `id` is how a row is named, which is also what the split needs:
-- assigning a payer is an UPDATE by id, and matching on menu_id/name/price
-- instead would be ambiguous the moment an order holds two rows for the same
-- dish in different print batches — which is what adding to an order produces.
--
-- SECURITY INVOKER: cashiers already hold every grant this needs, so it runs as
-- the caller and adds no privilege surface. RLS and both order_items triggers
-- apply to its writes exactly as they do to a direct one — the paid-order lock
-- and the per-payer lock are not bypassed here.
--
-- The stock deduction happens in here too, rather than as a second request
-- afterwards. It has to: a shortage must leave the order exactly as it was, and
-- previously that was arranged by deleting the new rows and reinserting the old
-- ones from client memory — a repair path that issued its own writes and could
-- itself fail, logging "CRITICAL: Failed to revert order items" and leaving the
-- order in neither state. Inside one transaction the rollback is Postgres's
-- problem: raise, and the delete, the updates, the inserts and the stock
-- movement all vanish together.

create or replace function public.save_order_items(
  p_order_id bigint,
  p_items jsonb,
  p_force boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_keep bigint[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;

  select coalesce(array_agg((elem ->> 'id')::bigint), '{}')
    into v_keep
  from jsonb_array_elements(p_items) elem
  where elem ->> 'id' is not null;

  -- A repeated id would make the UPDATE below pick one of the duplicates
  -- arbitrarily and silently discard the other.
  --
  -- coalesce because array_length of an empty array is NULL, not 0 — without it
  -- an order made up entirely of new lines compares NULL against a count of 0,
  -- which IS DISTINCT FROM reads as different, and every first save was
  -- rejected as a duplicate.
  if coalesce(array_length(v_keep, 1), 0) is distinct from (
    select count(distinct k)::integer from unnest(v_keep) k
  ) then
    raise exception 'Duplicate item id in payload for order %', p_order_id
      using errcode = '22023';
  end if;

  -- Every id must already belong to this order. Without this check a caller
  -- could name another order's row and have the UPDATE adopt it.
  if exists (
    select 1
    from unnest(v_keep) kid
    where not exists (
      select 1 from public.order_items oi
      where oi.id = kid and oi.order_id = p_order_id
    )
  ) then
    raise exception 'Item id does not belong to order %', p_order_id
      using errcode = '42501';
  end if;

  delete from public.order_items
  where order_id = p_order_id
    and not (id = any (v_keep));

  -- `elem ? 'key'` distinguishes an absent key from one explicitly set to null,
  -- so a caller can clear a note by sending null while a caller that says
  -- nothing about notes leaves them alone.
  update public.order_items oi
  set
    menu_id           = case when elem ? 'menu_id'
                             then (elem ->> 'menu_id')::bigint else oi.menu_id end,
    name              = case when elem ? 'name'
                             then elem ->> 'name' else oi.name end,
    price             = case when elem ? 'price'
                             then (elem ->> 'price')::integer else oi.price end,
    quantity          = case when elem ? 'quantity'
                             then (elem ->> 'quantity')::integer else oi.quantity end,
    is_sent           = case when elem ? 'is_sent'
                             then (elem ->> 'is_sent')::boolean else oi.is_sent end,
    is_cancelled      = case when elem ? 'is_cancelled'
                             then (elem ->> 'is_cancelled')::boolean else oi.is_cancelled end,
    print_batch       = case when elem ? 'print_batch'
                             then (elem ->> 'print_batch')::integer else oi.print_batch end,
    notes             = case when elem ? 'notes'
                             then elem ->> 'notes' else oi.notes end,
    is_stock_deducted = case when elem ? 'is_stock_deducted'
                             then (elem ->> 'is_stock_deducted')::boolean
                             else oi.is_stock_deducted end,
    customer_num      = case when elem ? 'customer_num'
                             then (elem ->> 'customer_num')::integer else oi.customer_num end
  from jsonb_array_elements(p_items) elem
  where (elem ->> 'id')::bigint = oi.id
    and oi.order_id = p_order_id;

  insert into public.order_items (
    order_id, menu_id, name, price, quantity,
    is_sent, is_cancelled, print_batch, notes, is_stock_deducted, customer_num
  )
  select
    p_order_id,
    (elem ->> 'menu_id')::bigint,
    elem ->> 'name',
    (elem ->> 'price')::integer,
    (elem ->> 'quantity')::integer,
    coalesce((elem ->> 'is_sent')::boolean, false),
    coalesce((elem ->> 'is_cancelled')::boolean, false),
    coalesce((elem ->> 'print_batch')::integer, 1),
    elem ->> 'notes',
    -- A new line has never had its ingredients taken out, so it defaults to
    -- false and deduct_stock_for_order will pick it up. Anything carried over
    -- keeps whatever the caller sent, or its existing value.
    coalesce((elem ->> 'is_stock_deducted')::boolean, false),
    coalesce((elem ->> 'customer_num')::integer, 1)
  from jsonb_array_elements(p_items) elem
  where elem ->> 'id' is null;

  -- Same transaction as the writes above, so 'Insufficient stock' aborts the
  -- edit rather than leaving it saved against stock that was never taken out.
  -- Explicit cast: deduct_stock_for_order declares p_order_id as integer, and
  -- bigint→integer is an assignment cast, which function resolution will not
  -- apply on its own.
  perform public.deduct_stock_for_order(p_order_id::integer, p_force);
end;
$$;

revoke all on function public.save_order_items(bigint, jsonb, boolean) from public, anon;
grant execute on function public.save_order_items(bigint, jsonb, boolean) to authenticated;
