-- Split bill: one order, several payers.
--
-- A group orders under one name and then wants to pay separately. The order
-- stays a single order — `order_items.customer_num` tags which payer each line
-- belongs to, and `order_payments` records what each of them actually handed
-- over and how.
--
-- Why not one order per payer: an order cannot be deleted by a cashier (there
-- is no DELETE grant on `orders`, deliberately — see the baseline), so carving
-- an order into siblings can never be undone at the till. Tagging a column can:
-- un-splitting is the same UPDATE in reverse. Nothing moves between orders, so
-- stock is untouched and no kitchen ticket is disturbed.
--
-- What stays correct without any change downstream:
--
--   * Revenue everywhere (admin/sales.tsx, comparison.tsx, cashier/sales.tsx,
--     top-selling) is computed from order_items × discount + tax over orders
--     with status = 'paid'. An order only becomes 'paid' once the cashier
--     closes it, so a settled split order is still one paid order holding all
--     of its items — the same total as before it was split.
--   * check_stock_for_order / deduct_stock_for_order select on menu_id and
--     is_stock_deducted and never look at customer_num.
--   * Kitchen tickets group by print_batch, which the split does not touch.
--
-- What does change: the payment-method breakdown has to read order_payments
-- for split orders, and outstanding has to subtract what has been paid so far.

-- ---------------------------------------------------------------------------
-- 1. Which payer each line belongs to
-- ---------------------------------------------------------------------------

-- Default 1 means every existing row, and every order that is never split, is
-- simply "payer 1" — the unsplit case needs no special handling anywhere.
alter table public.order_items
  add column if not exists customer_num integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_items_customer_num_check'
  ) then
    alter table public.order_items
      add constraint order_items_customer_num_check check (customer_num > 0);
  end if;
end $$;

comment on column public.order_items.customer_num is
  'Which payer settles this line when the bill is split. 1 for every unsplit order.';

-- ---------------------------------------------------------------------------
-- 2. is_stock_deducted can no longer be NULL
-- ---------------------------------------------------------------------------
--
-- The column was nullable with no default, and deduct_stock_for_order selects
-- `where is_stock_deducted = false`. NULL is not false, so a row inserted
-- without the column would never have its ingredients deducted and would never
-- be marked — it would silently consume nothing. Every current client write
-- sends the column explicitly, so this only ever affected rows written by
-- something else, but save_order_items below is a new write path and this
-- closes the hole for good rather than relying on every future one remembering.

update public.order_items set is_stock_deducted = false where is_stock_deducted is null;

alter table public.order_items alter column is_stock_deducted set default false;
alter table public.order_items alter column is_stock_deducted set not null;

-- ---------------------------------------------------------------------------
-- 3. What each payer paid
-- ---------------------------------------------------------------------------

create table if not exists public.order_payments (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  customer_num integer not null,
  -- The name the cashier typed for this payer, for the receipt. Optional: the
  -- number alone is enough to settle a bill.
  customer_label text,
  -- This payer's share of the bill — items, less their share of the discount,
  -- plus tax. This is the revenue figure.
  amount integer not null,
  -- Cash actually handed over, for working out change. NULL for every other
  -- method, which settles for exactly `amount`.
  --
  -- orders.payment_amount conflates these two: for cash it holds the tender,
  -- so it overstates takings by whatever change was given and cannot be summed
  -- (see the comment at admin/sales.tsx:197). Keeping them apart means
  -- order_payments.amount is directly summable.
  amount_tendered integer,
  method_of_payment text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_payments_order_customer_key'
  ) then
    alter table public.order_payments
      add constraint order_payments_order_customer_key unique (order_id, customer_num);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'order_payments_customer_num_check'
  ) then
    alter table public.order_payments
      add constraint order_payments_customer_num_check check (customer_num > 0);
  end if;

  -- `>= 0`, not `> 0` as on order_items.price: a 100% discount is a legitimate
  -- bill of nothing, and someone still has to be recorded as having settled it.
  if not exists (
    select 1 from pg_constraint where conname = 'order_payments_amount_check'
  ) then
    alter table public.order_payments
      add constraint order_payments_amount_check check (amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'order_payments_tendered_check'
  ) then
    alter table public.order_payments
      add constraint order_payments_tendered_check
      check (amount_tendered is null or amount_tendered >= 0);
  end if;

  -- Same list as orders_method_of_payment_check, minus 'Split' — a single
  -- payer's row names a real method.
  if not exists (
    select 1 from pg_constraint where conname = 'order_payments_method_check'
  ) then
    alter table public.order_payments
      add constraint order_payments_method_check
      check (method_of_payment = any (array[
        'QRIS'::text, 'Bank Transfer'::text, 'Cash'::text, 'Debit'::text
      ]));
  end if;
end $$;

create index if not exists order_payments_order_id_idx
  on public.order_payments (order_id);

-- ---------------------------------------------------------------------------
-- 4. 'Split' as an order-level payment method
-- ---------------------------------------------------------------------------
--
-- A split order has no single method. Leaving method_of_payment NULL would be
-- indistinguishable from "never recorded", which the admin order screen already
-- renders as "Tidak dicatat" — wrong, and wrong in a way that looks like a bug.
-- An explicit value says "the breakdown is in order_payments".

alter table public.orders drop constraint if exists orders_method_of_payment_check;

alter table public.orders add constraint orders_method_of_payment_check
  CHECK ((method_of_payment = ANY (ARRAY[
    'QRIS'::text,
    'Bank Transfer'::text,
    'Cash'::text,
    'Debit'::text,
    'Split'::text
  ])));

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

alter table public.order_payments enable row level security;

-- CREATE POLICY has no IF NOT EXISTS; drop first so the migration replays.
drop policy if exists "Authenticated can read order_payments" on public.order_payments;
drop policy if exists "Authenticated can insert order_payments" on public.order_payments;
drop policy if exists "Authenticated can update order_payments" on public.order_payments;
drop policy if exists "Authenticated can delete order_payments" on public.order_payments;

create policy "Authenticated can read order_payments" on public.order_payments
  for select to authenticated using (true);
create policy "Authenticated can insert order_payments" on public.order_payments
  for insert to authenticated with check (true);
create policy "Authenticated can update order_payments" on public.order_payments
  for update to authenticated using (true);
create policy "Authenticated can delete order_payments" on public.order_payments
  for delete to authenticated using (true);

-- Mirrors order_items: cashiers hold full CRUD, and what actually protects a
-- settled bill is the trigger below, not the grant.
grant all on public.order_payments to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5b. Realtime
-- ---------------------------------------------------------------------------
--
-- OrderContext subscribes to this table: a payer settling their share changes
-- what every other tablet must show — who still owes, and which lines are now
-- frozen. Without the table in the publication a second device goes on offering
-- to take a payment that has already been taken.
--
-- Guarded on both sides because the publication is dashboard-managed and does
-- not exist on a bare Postgres, and ALTER PUBLICATION ... ADD TABLE errors if
-- the table is already a member.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'order_payments'
     )
  then
    alter publication supabase_realtime add table public.order_payments;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. A paid payer's lines are locked, even while the order is open
-- ---------------------------------------------------------------------------
--
-- Until now, payment locked the whole order at once: status went to 'paid' and
-- prevent_locked_order_item_change froze every line. A split order stays
-- 'unpaid' until the last payer settles, so without this the first payer's
-- items would still be editable after they had paid and walked out — their
-- receipt and the order would be free to disagree.
--
-- The rule is the same one payment has always implied, applied per payer:
-- once someone has a row in order_payments, what they bought is settled.
-- Fulfilment bookkeeping (is_sent, print_batch, notes) stays open, exactly as
-- it does on a fully paid order, because kitchen reprints need it.

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
  -- items first).
  if v_status is null or v_status not in ('paid', 'cancelled') then
    -- Has the payer on either side of this change already settled? Both sides
    -- matter: moving a line *onto* a payer who has paid would add something
    -- they were never charged for, and moving one *off* would take away
    -- something they were.
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
       and new.order_id          is not distinct from old.order_id
       and new.menu_id           is not distinct from old.menu_id
       and new.name              is not distinct from old.name
       and new.price             is not distinct from old.price
       and new.quantity          is not distinct from old.quantity
       and new.is_cancelled      is not distinct from old.is_cancelled
       and new.is_stock_deducted is not distinct from old.is_stock_deducted
       and new.customer_num      is not distinct from old.customer_num
    then
      return new;
    end if;

    raise exception
      'Customer % on order % has already paid; their items cannot be changed',
      case when tg_op = 'DELETE' then old.customer_num else new.customer_num end,
      v_order_id
      using errcode = '42501';
  end if;

  -- Closed order. Permit only fulfilment bookkeeping: is_sent, print_batch,
  -- notes. Everything else describes what was sold, what it cost, what stock it
  -- consumed, or who paid for it.
  if tg_op = 'UPDATE'
     and new.order_id          is not distinct from old.order_id
     and new.menu_id           is not distinct from old.menu_id
     and new.name              is not distinct from old.name
     and new.price             is not distinct from old.price
     and new.quantity          is not distinct from old.quantity
     and new.is_cancelled      is not distinct from old.is_cancelled
     and new.is_stock_deducted is not distinct from old.is_stock_deducted
     and new.customer_num      is not distinct from old.customer_num
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
-- 7. A settled bill's payment rows are locked too
-- ---------------------------------------------------------------------------
--
-- Without this, the order_items lock above is decorative: a cashier could
-- delete the payment row, edit the now-unlocked items, and re-add it. It also
-- stops a paid order's recorded takings being rewritten after the fact, which
-- is the same thing the PIN gate protects on `orders`.

create or replace function public.prevent_locked_order_payment_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id bigint;
  v_status   text;
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

  if v_status is not null and v_status in ('paid', 'cancelled') then
    raise exception
      'Order % is already %; its payments cannot be changed without manager approval',
      v_order_id, v_status
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists enforce_payments_locked_after_payment on public.order_payments;
create trigger enforce_payments_locked_after_payment
  before insert or update or delete on public.order_payments
  for each row
  execute function public.prevent_locked_order_payment_change();
