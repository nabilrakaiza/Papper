-- How much of a line has already been taken out of the store, as a quantity
-- rather than a yes/no.
--
-- THE BUG
--
-- `is_stock_deducted` answers "has this row's quantity been deducted?", and
-- deduct_stock_for_order takes the row's *whole* quantity whenever it reads
-- false. That holds right up until a line is reduced, because stock is never
-- returned (see docs/database.md) — so after a reduction the flag says "2 have
-- been taken" when 5 actually were, and the difference is unrecoverable.
--
-- Reduce a line 5 -> 2 and raise it back to 5 and the editor appends the extra
-- 3 as a new row with the flag unset, so 3 more leave the store: 8 deducted for
-- an order of 5. The shortfall is indistinguishable from ordinary consumption,
-- which is precisely the property that makes it dangerous — it looks like
-- ingredients going missing.
--
-- THE FIX
--
-- `stock_deducted_qty` records how many units of this line stock has actually
-- funded. Deduction becomes the difference, `quantity - stock_deducted_qty`,
-- and a reduction simply leaves the column alone: the row then carries a
-- deducted quantity larger than its own quantity, which is the honest record of
-- what happened, and raising the line back up costs nothing because the
-- difference is no longer positive.
--
-- That headroom is also the right answer for the kitchen. The line was already
-- made at the higher quantity; restoring it needs no new ticket, which is why
-- the editor refills an existing row before opening a new print batch.
--
-- WHY THE BOOLEAN STAYS
--
-- `is_stock_deducted` is kept and is now derived — a BEFORE trigger sets it
-- from the quantity on every write, so the two can never disagree. It could
-- have been dropped, but 20260906100100 is already the one migration in this
-- project that stranded older builds, and doing that a second time to a till
-- that takes money all day is not worth the tidiness. Clients should read and
-- write `stock_deducted_qty`; anything still writing the boolean has its value
-- discarded and replaced rather than rejected.
--
-- One residual case is deliberately not fixed: reducing a line far enough to
-- delete a whole row throws that row's headroom away with it, so raising the
-- quantity afterwards deducts again. Recorded stock only ever ends up lower
-- than reality, which is the safe direction and the same one the project
-- already accepts everywhere else.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.order_items
  add column if not exists stock_deducted_qty integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_stock_deducted_qty_check'
  ) then
    alter table public.order_items
      add constraint order_items_stock_deducted_qty_check
      check (stock_deducted_qty >= 0);
  end if;
end $$;

-- Backfill: a flagged row had its whole quantity taken, an unflagged one none.
-- This is exactly as accurate as the boolean it replaces — a row already
-- carrying the bug is restated as "quantity taken", which understates what
-- really left the store. There is no way to recover the true figure, and
-- correcting stock against a physical count is the intended path for that.
update public.order_items
set stock_deducted_qty = quantity
where is_stock_deducted = true
  and stock_deducted_qty = 0;

comment on column public.order_items.stock_deducted_qty is
  'Units of this line that stock has already funded. Deduction takes quantity - stock_deducted_qty; a reduced line keeps the larger figure because stock is never returned.';

comment on column public.order_items.is_stock_deducted is
  'Derived from stock_deducted_qty > 0 by derive_stock_deducted_flag. Kept for older builds; do not write it.';

-- ---------------------------------------------------------------------------
-- 2. Keep the boolean honest
-- ---------------------------------------------------------------------------
--
-- Named to sort before enforce_items_locked_after_payment, which fires on the
-- same table and timing and compares old against new. Deriving first means a
-- client that sends a stale boolean has it corrected rather than being refused
-- for a column it does not actually control.

create or replace function public.derive_stock_deducted_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_stock_deducted := new.stock_deducted_qty > 0;
  return new;
end;
$$;

revoke all on function public.derive_stock_deducted_flag() from public, anon, authenticated;

drop trigger if exists derive_stock_deducted_flag on public.order_items;
create trigger derive_stock_deducted_flag
  before insert or update on public.order_items
  for each row
  execute function public.derive_stock_deducted_flag();

-- ---------------------------------------------------------------------------
-- 3. Deduct the difference, not the whole line
-- ---------------------------------------------------------------------------

create or replace function public.deduct_stock_for_order(
  p_order_id integer,
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_ingredient record;
  v_current_quantity numeric;
begin
  for v_item in
    select oi.menu_id, (oi.quantity - oi.stock_deducted_qty) as pending
    from order_items oi
    where oi.order_id = p_order_id
      and oi.quantity > oi.stock_deducted_qty
  loop
    -- A custom off-menu line has a NULL menu_id and therefore no recipe, so
    -- this finds nothing and it consumes no stock. It is still brought up to
    -- date by the UPDATE below, because there is nothing left to take for it.
    for v_ingredient in
      select mi.stock_id, mi.quantity * v_item.pending as total_needed
      from menu_ingredients mi
      where mi.menu_id = v_item.menu_id
    loop
      select quantity into v_current_quantity
      from stock
      where id = v_ingredient.stock_id
      for update;

      if not p_force and v_current_quantity < v_ingredient.total_needed then
        raise exception 'Insufficient stock for stock_id %', v_ingredient.stock_id
          using errcode = 'P0001';
      end if;

      update stock
      set quantity = quantity - v_ingredient.total_needed,
          updated_at = now()
      where id = v_ingredient.stock_id;
    end loop;
  end loop;

  -- Only ever raised. A row whose stock_deducted_qty already exceeds its
  -- quantity is not in this set, so a reduced line keeps the larger, truer
  -- figure instead of having it written back down to what is currently ordered.
  update order_items
  set stock_deducted_qty = quantity
  where order_id = p_order_id
    and quantity > stock_deducted_qty;
end;
$$;

revoke all on function public.deduct_stock_for_order(integer, boolean) from public, anon;
grant execute on function public.deduct_stock_for_order(integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The new column is locked like the flag it replaces
-- ---------------------------------------------------------------------------
--
-- Same reasoning as 20260801170000: lowering it on a closed order and
-- re-running the deduction would take the same ingredients out twice. Both
-- columns are listed — the boolean is derived, so it cannot drift on its own,
-- but leaving it out of the comparison would quietly narrow a rule that is
-- easier to keep whole.

create or replace function public.prevent_locked_order_item_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id bigint;
  v_status   text;
  v_locked   boolean;
begin
  if coalesce(current_setting('app.pin_verified', true), '') = 'true' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;

  select status into v_status from public.orders where id = v_order_id;

  if v_status is null or v_status not in ('paid', 'cancelled') then
    select exists (
      select 1 from public.order_payments p
      where p.order_id = v_order_id
        and p.customer_num = case when tg_op = 'DELETE'
                                  then old.customer_num
                                  else new.customer_num end
    ) into v_locked;

    if tg_op = 'UPDATE' and not v_locked then
      select exists (
        select 1 from public.order_payments p
        where p.order_id = old.order_id and p.customer_num = old.customer_num
      ) into v_locked;
    end if;

    if not v_locked then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;

    if tg_op = 'UPDATE'
       and new.order_id           is not distinct from old.order_id
       and new.menu_id            is not distinct from old.menu_id
       and new.name               is not distinct from old.name
       and new.price              is not distinct from old.price
       and new.quantity           is not distinct from old.quantity
       and new.is_cancelled       is not distinct from old.is_cancelled
       and new.is_stock_deducted  is not distinct from old.is_stock_deducted
       and new.stock_deducted_qty is not distinct from old.stock_deducted_qty
       and new.customer_num       is not distinct from old.customer_num
    then
      return new;
    end if;

    raise exception
      'Customer % on order % has already paid; their items cannot be changed',
      case when tg_op = 'DELETE' then old.customer_num else new.customer_num end,
      v_order_id
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.order_id           is not distinct from old.order_id
     and new.menu_id            is not distinct from old.menu_id
     and new.name               is not distinct from old.name
     and new.price              is not distinct from old.price
     and new.quantity           is not distinct from old.quantity
     and new.is_cancelled       is not distinct from old.is_cancelled
     and new.is_stock_deducted  is not distinct from old.is_stock_deducted
     and new.stock_deducted_qty is not distinct from old.stock_deducted_qty
     and new.customer_num       is not distinct from old.customer_num
  then
    return new;
  end if;

  raise exception
    'Order % is already %; its items cannot be changed without manager approval',
    v_order_id, v_status
    using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. save_order_items carries the quantity
-- ---------------------------------------------------------------------------
--
-- `is_stock_deducted` is no longer read from the payload at all — the derive
-- trigger owns it. Everything else is unchanged from 20260906091600, including
-- the `elem ? 'key'` test that leaves an unmentioned column alone.

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

  if coalesce(array_length(v_keep, 1), 0) is distinct from (
    select count(distinct k)::integer from unnest(v_keep) k
  ) then
    raise exception 'Duplicate item id in payload for order %', p_order_id
      using errcode = '22023';
  end if;

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

  update public.order_items oi
  set
    menu_id            = case when elem ? 'menu_id'
                              then (elem ->> 'menu_id')::bigint else oi.menu_id end,
    name               = case when elem ? 'name'
                              then elem ->> 'name' else oi.name end,
    price              = case when elem ? 'price'
                              then (elem ->> 'price')::integer else oi.price end,
    quantity           = case when elem ? 'quantity'
                              then (elem ->> 'quantity')::integer else oi.quantity end,
    is_sent            = case when elem ? 'is_sent'
                              then (elem ->> 'is_sent')::boolean else oi.is_sent end,
    is_cancelled       = case when elem ? 'is_cancelled'
                              then (elem ->> 'is_cancelled')::boolean else oi.is_cancelled end,
    print_batch        = case when elem ? 'print_batch'
                              then (elem ->> 'print_batch')::integer else oi.print_batch end,
    notes              = case when elem ? 'notes'
                              then elem ->> 'notes' else oi.notes end,
    stock_deducted_qty = case when elem ? 'stock_deducted_qty'
                              then (elem ->> 'stock_deducted_qty')::integer
                              else oi.stock_deducted_qty end,
    customer_num       = case when elem ? 'customer_num'
                              then (elem ->> 'customer_num')::integer else oi.customer_num end
  from jsonb_array_elements(p_items) elem
  where (elem ->> 'id')::bigint = oi.id
    and oi.order_id = p_order_id;

  insert into public.order_items (
    order_id, menu_id, name, price, quantity,
    is_sent, is_cancelled, print_batch, notes, stock_deducted_qty, customer_num
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
    -- A new line has never been funded, so it defaults to 0 and the deduction
    -- below picks up its whole quantity. The split screen is the one caller
    -- that sends a figure on an insert: carving one row into several has to
    -- divide the funded quantity between them or the parts would be deducted
    -- all over again.
    coalesce((elem ->> 'stock_deducted_qty')::integer, 0),
    coalesce((elem ->> 'customer_num')::integer, 1)
  from jsonb_array_elements(p_items) elem
  where elem ->> 'id' is null;

  perform public.deduct_stock_for_order(p_order_id::integer, p_force);
end;
$$;

revoke all on function public.save_order_items(bigint, jsonb, boolean) from public, anon;
grant execute on function public.save_order_items(bigint, jsonb, boolean) to authenticated;
