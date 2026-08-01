-- Kitchen printing broke on paid orders.
--
-- 20260801150000 froze order_items once the parent order is paid or cancelled,
-- to stop a cashier voiding a closed sale by gutting its line items. But the
-- kitchen-ticket flow marks items as sent after printing, and the reprint button
-- is available on paid orders too — so printing a ticket for a closed order
-- failed with "Berhasil dicetak, tetapi gagal memperbarui status terkirim".
--
-- Marking an item as sent says nothing about what was sold or charged, so the
-- lock is narrowed: on a closed order, an UPDATE is allowed as long as it leaves
-- order_id, menu_id, name, price, quantity and is_cancelled untouched. That
-- keeps the fields the fraud case depends on locked while letting fulfilment
-- bookkeeping (is_sent, print_batch, notes, is_stock_deducted) proceed.
--
-- INSERT and DELETE stay blocked on closed orders: adding or removing lines is
-- exactly the attack this guards against.

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

  -- Closed order. Permit updates that do not change what was sold.
  if tg_op = 'UPDATE'
     and new.order_id     is not distinct from old.order_id
     and new.menu_id      is not distinct from old.menu_id
     and new.name         is not distinct from old.name
     and new.price        is not distinct from old.price
     and new.quantity     is not distinct from old.quantity
     and new.is_cancelled is not distinct from old.is_cancelled
  then
    return new;
  end if;

  raise exception
    'Order % is already %; its items cannot be changed without manager approval',
    v_order_id, v_status
    using errcode = '42501';
end;
$$;
