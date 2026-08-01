-- Two changes.
--
-- A. Close the order_items side door.
--
--    The PIN gate only guarded `orders.status`. Cashiers hold UPDATE and DELETE
--    policies on `order_items`, so they could void a paid order by flipping
--    every line to is_cancelled, or deleting the lines outright — no PIN, no
--    audit row.
--
--    The fix is to enforce what the UI already does. app/(cashier)/(tabs)/index.tsx
--    only shows the edit button when the order is unpaid, so line items are
--    already never edited after payment. Making that a database rule costs
--    cashiers nothing: they keep full add/remove/edit on open (unpaid) orders,
--    which is all the app ever asks for.
--
--    Verified safe against the existing flows:
--      * deduct_stock_for_order writes order_items.is_stock_deducted, but both
--        call sites (OrderContext.tsx:181 and :311) run while the order is still
--        unpaid — stock is deducted at creation/edit, not at payment
--      * markPaid (OrderContext.tsx:355) updates only the `orders` row
--      * both PIN RPCs are exempt via app.pin_verified
--
-- B. Give the client a reason for a refusal.
--
--    cancel_order_with_pin returns a bare boolean, so a lockout is indistinguishable
--    from a wrong PIN and the UI reports "PIN salah" to an admin typing the correct
--    PIN. cancel_order_with_pin_v2 returns jsonb with a reason.
--
--    It is added ALONGSIDE the boolean version rather than replacing it. There is
--    no EAS Update channel configured, so older installs stay on the old build;
--    they do `if (!data)`, and a jsonb object is always truthy, so replacing the
--    return type in place would make those builds report success on a rejected
--    PIN. Retire the boolean version once every device is on the new build.

-- ---------------------------------------------------------------------------
-- A. order_items may only change while the order is open
-- ---------------------------------------------------------------------------

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

  -- A missing parent means the order row is already gone (delete_order_with_pin
  -- removes items first); nothing left to protect.
  if v_status is not null and v_status in ('paid', 'cancelled') then
    raise exception
      'Order % is already %; its items cannot be changed without manager approval',
      v_order_id, v_status
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists enforce_items_locked_after_payment on public.order_items;
create trigger enforce_items_locked_after_payment
  before insert or update or delete on public.order_items
  for each row
  execute function public.prevent_locked_order_item_change();

-- delete_order_with_pin removes order_items from orders that are typically paid,
-- so it now needs the same exemption cancel_order_with_pin already had.
create or replace function public.delete_order_with_pin(
  p_order_id bigint,
  p_pin      text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor    uuid := auth.uid();
  v_admin_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if public.pin_attempts_exhausted(v_actor) then
    insert into public.order_override_log (order_id, cashier_id, action, success)
    values (p_order_id, v_actor, 'delete_blocked', false);
    return false;
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'admin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  limit 1;

  insert into public.order_override_log
    (order_id, cashier_id, admin_id, action, success)
  values
    (p_order_id, v_actor, v_admin_id, 'delete', v_admin_id is not null);

  if v_admin_id is null then
    return false;
  end if;

  perform set_config('app.pin_verified', 'true', true);

  -- order_items_order_id_fkey is ON DELETE CASCADE, so this is redundant; kept
  -- explicit so the item rows go through the trigger path deliberately rather
  -- than vanishing as a side effect.
  delete from public.order_items where order_id = p_order_id;

  -- Detaches the log rows so the FK does not block the delete. The audit trail
  -- survives the order it refers to.
  update public.order_override_log set order_id = null where order_id = p_order_id;

  delete from public.orders where id = p_order_id;

  perform set_config('app.pin_verified', 'false', true);

  return true;
end;
$$;

revoke all on function public.delete_order_with_pin(bigint, text) from public, anon;
grant execute on function public.delete_order_with_pin(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- B. Detailed cancellation result
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order_with_pin_v2(
  p_order_id bigint,
  p_pin      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_actor    uuid := auth.uid();
  v_admin_id uuid;
  v_fails    integer;
  v_oldest   timestamptz;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select count(*), min(created_at) into v_fails, v_oldest
  from public.order_override_log
  where cashier_id = v_actor
    and action in ('cancel', 'delete')
    and not success
    and created_at > now() - interval '15 minutes';

  if v_fails >= 5 then
    insert into public.order_override_log (order_id, cashier_id, action, success)
    values (p_order_id, v_actor, 'cancel_blocked', false);

    return jsonb_build_object(
      'ok', false,
      'reason', 'locked_out',
      -- The window clears when the oldest counted failure ages out.
      'retry_after_seconds',
        greatest(0, ceil(extract(epoch from (v_oldest + interval '15 minutes' - now())))::int)
    );
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'admin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  limit 1;

  insert into public.order_override_log
    (order_id, cashier_id, admin_id, action, success)
  values
    (p_order_id, v_actor, v_admin_id, 'cancel', v_admin_id is not null);

  if v_admin_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_pin',
      'attempts_left', greatest(0, 5 - (v_fails + 1))
    );
  end if;

  perform set_config('app.pin_verified', 'true', true);

  update public.orders     set status = 'cancelled' where id = p_order_id;
  update public.order_items set is_cancelled = true where order_id = p_order_id;

  perform set_config('app.pin_verified', 'false', true);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_order_with_pin_v2(bigint, text) from public, anon;
grant execute on function public.cancel_order_with_pin_v2(bigint, text) to authenticated;
