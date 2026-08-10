-- Narrows the fulfilment allowance added in 20260801160000.
--
-- That migration let any column outside the "what was sold" set change on a
-- closed order, which included is_stock_deducted. Nothing legitimately writes
-- that column after payment: deduct_stock_for_order sets it, and both of its
-- call sites run while the order is still unpaid.
--
-- Left editable, a cashier could reset it to false on a paid order and re-run
-- the deduction, decrementing stock a second time. The resulting shortfall looks
-- like ordinary consumption, so it could mask ingredients going missing.
--
-- is_sent, print_batch and notes stay editable — those are what kitchen
-- reprints need.

create or replace function public.prevent_locked_order_item_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id bigint;
  v_status   text;
begin
  -- The PIN RPCs set this for the duration of their transaction.
  if coalesce(current_setting('app.pin_verified', true), '') = 'true' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select status into v_status from public.orders where id = v_order_id;

  -- Open order, or the parent row is already gone (delete_order_with_pin removes
  -- items first): nothing to protect.
  if v_status is null or v_status not in ('paid', 'cancelled') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Closed order. Permit only fulfilment bookkeeping: is_sent, print_batch,
  -- notes. Everything else describes what was sold, what it cost, or what stock
  -- it consumed.
  if tg_op = 'UPDATE'
     and new.order_id          is not distinct from old.order_id
     and new.menu_id           is not distinct from old.menu_id
     and new.name              is not distinct from old.name
     and new.price             is not distinct from old.price
     and new.quantity          is not distinct from old.quantity
     and new.is_cancelled      is not distinct from old.is_cancelled
     and new.is_stock_deducted is not distinct from old.is_stock_deducted
  then
    return new;
  end if;

  raise exception
    'Order % is already %; its items cannot be changed without manager approval',
    v_order_id, v_status
    using errcode = '42501';
end;
$$;
