-- Correcting a settled bill.
--
-- A customer pays, and only then realises the bill is wrong — an item they
-- never ordered, or one they did that never made it on. The order has to reopen
-- so its lines can be fixed, and the difference has to move in whichever
-- direction it turns out to go.
--
-- It is called a correction, not a refund, throughout. "Refund" names one
-- direction of something that goes both ways, and the screens have to be honest
-- about which way this particular one went.
--
-- NO NEW STATUS
--
-- A reopened order goes back to 'unpaid'. A fourth status would have to be
-- taught to every screen, filter and report that switches on status, and an
-- order in mid-correction would be neither paid nor unpaid in any of them.
-- 'unpaid' already means "open, owes money", which is exactly what a correction
-- is. That it happened at all lives in orders.reopen_seq and in
-- order_override_log, not in the status.
--
-- THE MONEY IS A LEDGER
--
-- order_payments becomes append-only. A correction adds a row; it never
-- rewrites or deletes the one already there. Money handed back is a NEGATIVE
-- amount.
--
-- Rewriting the original row instead would break reconciliation outright. Paid
-- Rp 100.000 by QRIS, corrected down to Rp 80.000, Rp 20.000 handed back in
-- cash: recording that as "QRIS 80.000" leaves the QRIS settlement report
-- saying 100.000 and the drawer 20.000 short, with nothing in the system
-- accounting for either. Two rows — QRIS +100.000 and Cash -20.000 — describe
-- what actually happened, and net to the right revenue.
--
-- The payoff is that every existing report stays correct with no query change.
-- admin/sales.tsx sums amount per method, cashier/sales.tsx sums it for what
-- has been collected, amountCollected() sums it. A negative row nets itself out
-- in all of them. The headline figure is computed from items x discount, which
-- the edit has already corrected, so headline and breakdown still agree.
--
-- NO `kind` COLUMN
--
-- The sign of `amount` already says which way the money went, and within one
-- correction round a payer either owes more or is owed — never both. So one row
-- per payer per round is the whole shape, and a `kind` column would only
-- restate what the sign says. Same argument the split-bill migration made for
-- deriving payers from the line items rather than storing a count.

-- ---------------------------------------------------------------------------
-- 1. Which correction round an order is in
-- ---------------------------------------------------------------------------
--
-- 0 for every order that has never been corrected, which is the default and
-- therefore the entire existing table. Incremented by reopen_order_with_pin.
-- It does three jobs: it flags an order as corrected, it tells the item lock
-- which payments still count, and it is what lets a payer appear in
-- order_payments more than once without losing the double-tap guard.

alter table public.orders
  add column if not exists reopen_seq integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_reopen_seq_check'
  ) then
    alter table public.orders
      add constraint orders_reopen_seq_check check (reopen_seq >= 0);
  end if;
end $$;

comment on column public.orders.reopen_seq is
  'How many times this order has been reopened for correction. 0 = never.';

-- ---------------------------------------------------------------------------
-- 2. Payment rows carry their round, and who authorised it
-- ---------------------------------------------------------------------------

alter table public.order_payments
  add column if not exists reopen_seq integer not null default 0;

alter table public.order_payments
  add column if not exists approved_by uuid references public.profiles(id);

comment on column public.order_payments.reopen_seq is
  'The correction round this row settles. 0 = the original payment.';

comment on column public.order_payments.approved_by is
  'The superadmin whose PIN authorised the correction this row settles. Stamped by the database, never by the client. NULL on an original payment.';

-- The old key allowed one row per payer, full stop. A corrected order needs one
-- per payer per round — but no more than that, because the guard it is doing is
-- what turns a double tap or a second tablet into "Pembayaran pelanggan ini
-- sudah tercatat" rather than charging someone twice.
alter table public.order_payments
  drop constraint if exists order_payments_order_customer_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_payments_order_customer_round_key'
  ) then
    alter table public.order_payments
      add constraint order_payments_order_customer_round_key
      unique (order_id, customer_num, reopen_seq);
  end if;
end $$;

-- An original payment is still never negative — a 100% discount is a real bill
-- of nothing, so 0 stays legal. A correction row must move something: if the
-- corrected total comes out the same, no row is written at all, so a zero here
-- would be a row that records nothing happening.
alter table public.order_payments
  drop constraint if exists order_payments_amount_check;

alter table public.order_payments
  add constraint order_payments_amount_check
  check (
    (reopen_seq = 0 and amount >= 0)
    or (reopen_seq > 0 and amount <> 0)
  );

-- ---------------------------------------------------------------------------
-- 3. The approver is stamped by the database
-- ---------------------------------------------------------------------------
--
-- Cashiers hold INSERT on order_payments, so a client-supplied approver would
-- be worth nothing as an audit record — it would say whoever the tablet felt
-- like naming. The reopen RPC has already written the real one to
-- order_override_log; this copies it across.
--
-- SECURITY DEFINER because order_override_log is readable by admins only. As
-- the cashier, the lookup would return no rows and silently stamp NULL.

create or replace function public.stamp_correction_approver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reopen_seq > 0 then
    select l.admin_id into new.approved_by
    from public.order_override_log l
    where l.order_id = new.order_id
      and l.action = 'reopen'
      and l.success
    order by l.created_at desc, l.id desc
    limit 1;
  else
    new.approved_by := null;
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_correction_approver() from public, anon, authenticated;

drop trigger if exists stamp_correction_approver on public.order_payments;
create trigger stamp_correction_approver
  before insert or update on public.order_payments
  for each row
  execute function public.stamp_correction_approver();

-- ---------------------------------------------------------------------------
-- 4. Reopening is PIN-gated in the database, not just in the app
-- ---------------------------------------------------------------------------
--
-- This closes a hole that predates the feature. prevent_direct_cancel only ever
-- guarded transitions INTO 'cancelled', so `update orders set status='unpaid'`
-- on a paid order was accepted from any authenticated client — which unlocks
-- every line item on it, with no PIN and no audit row. Reviving a cancelled
-- order was equally open.

create or replace function public.prevent_direct_cancel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and coalesce(current_setting('app.pin_verified', true), '') <> 'true'
  then
    raise exception 'Order cancellation must go through cancel_order_with_pin()'
      using errcode = '42501';
  end if;

  if new.status = 'unpaid'
     and old.status in ('paid', 'cancelled')
     and coalesce(current_setting('app.pin_verified', true), '') <> 'true'
  then
    raise exception 'Reopening a closed order must go through reopen_order_with_pin()'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_cancel_via_rpc on public.orders;
create trigger enforce_cancel_via_rpc
  before update on public.orders
  for each row
  execute function public.prevent_direct_cancel();

-- ---------------------------------------------------------------------------
-- 5. A payer is locked by the round they are in
-- ---------------------------------------------------------------------------
--
-- Until now, holding any row in order_payments froze a payer's lines. That is
-- what keeps the first payer on a split bill from having their items edited
-- after they have paid and left, and it has to keep doing that.
--
-- But it also means a reopened order stays frozen: the status is 'unpaid'
-- again, and yet the original payment row is still there saying "settled". So
-- the rule becomes per round. A payer is locked if they have settled in the
-- order's CURRENT round. After a reopen the order moves to round 1 while the
-- original rows stay at 0, so nobody is locked and the correction can be made;
-- once a payer settles the difference, they lock again.
--
-- On an order that has never been reopened everything is round 0 and this is
-- byte-for-byte the behaviour that shipped with the split bill.

create or replace function public.prevent_locked_order_item_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id bigint;
  v_status   text;
  v_round    integer;
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

  select status, reopen_seq into v_status, v_round
  from public.orders where id = v_order_id;

  if v_status is null or v_status not in ('paid', 'cancelled') then
    select exists (
      select 1 from public.order_payments p
      where p.order_id = v_order_id
        and p.reopen_seq = v_round
        and p.customer_num = case when tg_op = 'DELETE'
                                  then old.customer_num
                                  else new.customer_num end
    ) into v_locked;

    if tg_op = 'UPDATE' and not v_locked then
      select exists (
        select 1 from public.order_payments p
        where p.order_id = old.order_id
          and p.reopen_seq = v_round
          and p.customer_num = old.customer_num
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
-- 6. Reopening an order for correction
-- ---------------------------------------------------------------------------
--
-- Modelled on cancel_order_with_pin_v2, deliberately: same jsonb result shape,
-- same superadmin-only match, same transaction-local app.pin_verified flag,
-- same audit insert, same lockout. A correction erases and rewrites a recorded
-- sale just as surely as a cancellation does, so it is gated exactly as hard.
--
-- superadmin only, matching all three existing PIN RPCs. 20260814134945
-- narrowed approval from admin to superadmin on purpose; accepting an admin PIN
-- here would be a working bypass of that policy, reachable by anyone holding
-- one of the PINs that migration made inert.
--
-- The existing payment rows are not touched. They are the record of money that
-- genuinely changed hands, and the correction is an additional movement, not a
-- revision of that one.

create or replace function public.reopen_order_with_pin(
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
  v_status   text;
  v_fails    integer;
  v_oldest   timestamptz;
  v_round    integer;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Counts the same failures the other PIN RPCs do, and is counted by them in
  -- turn — one PIN, one lockout, however it was attempted.
  select count(*), min(created_at) into v_fails, v_oldest
  from public.order_override_log
  where cashier_id = v_actor
    and action in ('cancel', 'delete', 'reopen')
    and not success
    and created_at > now() - interval '15 minutes';

  if v_fails >= 5 then
    insert into public.order_override_log (order_id, cashier_id, action, success)
    values (p_order_id, v_actor, 'reopen_blocked', false);

    return jsonb_build_object(
      'ok', false,
      'reason', 'locked_out',
      'retry_after_seconds',
        greatest(0, ceil(extract(epoch from (v_oldest + interval '15 minutes' - now())))::int)
    );
  end if;

  select status into v_status from public.orders where id = p_order_id;

  -- Checked before the PIN is looked at, and returned without an audit row,
  -- because this is not a failed attempt at anything — there is nothing here to
  -- approve. Counting it would let a cashier lock themselves out by tapping the
  -- wrong card.
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- A cancelled order is a different problem with a different answer, and
  -- reviving one would put a voided sale back into the revenue figures.
  if v_status <> 'paid' then
    return jsonb_build_object('ok', false, 'reason', 'not_paid');
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'superadmin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  limit 1;

  insert into public.order_override_log
    (order_id, cashier_id, admin_id, action, success)
  values
    (p_order_id, v_actor, v_admin_id, 'reopen', v_admin_id is not null);

  if v_admin_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_pin',
      'attempts_left', greatest(0, 5 - (v_fails + 1))
    );
  end if;

  perform set_config('app.pin_verified', 'true', true);

  update public.orders
  set status     = 'unpaid',
      reopen_seq = reopen_seq + 1
  where id = p_order_id
  returning reopen_seq into v_round;

  perform set_config('app.pin_verified', 'false', true);

  return jsonb_build_object('ok', true, 'reopen_seq', v_round);
end;
$$;

revoke all on function public.reopen_order_with_pin(bigint, text) from public, anon;
grant execute on function public.reopen_order_with_pin(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. One PIN, one lockout
-- ---------------------------------------------------------------------------
--
-- Both existing counters have to learn about 'reopen', or a cashier locked out
-- of cancelling still has five fresh guesses through the correction button —
-- against the same six digits.

create or replace function public.pin_attempts_exhausted(p_actor uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select count(*) >= 5
  from public.order_override_log
  where cashier_id = p_actor
    and action in ('cancel', 'delete', 'reopen')
    and not success
    and created_at > now() - interval '15 minutes';
$$;

revoke all on function public.pin_attempts_exhausted(uuid) from public, anon, authenticated;

create or replace function public.cancel_order_with_pin_v2(p_order_id bigint, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
    and action in ('cancel', 'delete', 'reopen')
    and not success
    and created_at > now() - interval '15 minutes';

  if v_fails >= 5 then
    insert into public.order_override_log (order_id, cashier_id, action, success)
    values (p_order_id, v_actor, 'cancel_blocked', false);

    return jsonb_build_object(
      'ok', false,
      'reason', 'locked_out',
      'retry_after_seconds',
        greatest(0, ceil(extract(epoch from (v_oldest + interval '15 minutes' - now())))::int)
    );
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'superadmin'
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
$function$;

-- ---------------------------------------------------------------------------
-- 8. The audit trail is readable by the people who authorise against it
-- ---------------------------------------------------------------------------
--
-- No policy change — admin and superadmin already read order_override_log since
-- 20260819131507. Recorded here only so the new actions are findable:
--
--   cancel / cancel_blocked   voiding a sale
--   delete / delete_blocked   hard-deleting an order (no UI)
--   reopen / reopen_blocked   correcting a settled bill
