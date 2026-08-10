-- PIN-gated order cancellation — hardening pass.
--
-- The core of this feature was already applied by hand to the hosted project:
-- `profiles.pin_hash`, `order_override_log`, `cancel_order_with_pin`,
-- `delete_order_with_pin`, and the `enforce_cancel_via_rpc` trigger all exist.
-- This migration is written to be idempotent so it both reconciles that live
-- state and reproduces it on a fresh database.
--
-- Enforcement model:
--   1. A BEFORE UPDATE trigger on `orders` rejects any transition into
--      status = 'cancelled' unless the transaction-local flag `app.pin_verified`
--      is set.
--   2. Only the two RPCs below set that flag, and only after matching the
--      submitted PIN against an admin's bcrypt hash.
--
-- What this pass changes:
--   * clears `app.pin_verified` immediately after use, so the flag cannot leak
--     to later statements if these are ever called inside a larger transaction
--   * adds a 5-failures-in-15-minutes lockout, shared across both RPCs
--   * cancels the order's line items alongside the order itself
--   * repairs `delete_order_with_pin`, whose search_path omitted `extensions`
--     (its bare `crypt()` call fails at runtime) and which never recorded
--     `admin_id`
--   * stops `pin_hash` being readable by clients

create extension if not exists pgcrypto with schema extensions;

-- pgcrypto lives in `extensions` on Supabase, not `public`. Every call below is
-- schema-qualified so it does not silently depend on a function's search_path.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists pin_hash text;

create table if not exists public.order_override_log (
  id          bigint generated always as identity primary key,
  order_id    bigint references public.orders(id),
  cashier_id  uuid   references public.profiles(id),
  admin_id    uuid   references public.profiles(id),
  action      text   not null,
  success     boolean not null,
  created_at  timestamp with time zone default now()
);

-- Supports the lockout lookup below.
create index if not exists order_override_log_failed_attempts_idx
  on public.order_override_log (cashier_id, created_at desc)
  where not success;

alter table public.order_override_log enable row level security;

-- A 4-6 digit PIN behind bcrypt falls to offline brute force in seconds, so the
-- hash must never reach a client.
--
-- This has to be a table-level REVOKE followed by an explicit column GRANT.
-- `REVOKE SELECT (pin_hash)` alone is a silent no-op here, because both roles
-- hold a *table*-level SELECT grant and column-level revokes cannot subtract
-- from it.
--
-- Safe: the app selects explicit column lists ("id, role, name" in AuthContext,
-- "role" in ProfileScreen), never `select *`. Note that any column added to
-- `profiles` in future must be added to this grant to be readable.
revoke select on public.profiles from authenticated, anon;
grant select (id, role, name) on public.profiles to authenticated, anon;

-- Redundant today (no DELETE policy exists on `orders`, so RLS already denies
-- it) but keeps a hard delete from becoming a trigger bypass if someone adds a
-- permissive policy later.
revoke delete on public.orders from authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: block direct cancellation
-- ---------------------------------------------------------------------------

create or replace function public.prevent_direct_cancel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- current_setting(..., true) returns NULL rather than raising when the flag
  -- was never set, which is the normal case for any update that is not a
  -- cancellation.
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and coalesce(current_setting('app.pin_verified', true), '') <> 'true'
  then
    raise exception 'Order cancellation must go through cancel_order_with_pin()'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Reuses the existing trigger name. Creating a second trigger under a new name
-- would leave both attached and firing.
drop trigger if exists enforce_cancel_via_rpc on public.orders;
create trigger enforce_cancel_via_rpc
  before update on public.orders
  for each row
  execute function public.prevent_direct_cancel();

-- ---------------------------------------------------------------------------
-- Shared lockout helper
-- ---------------------------------------------------------------------------

-- Counts only real attempts ('cancel'/'delete'), never the '*_blocked' rows the
-- callers write, so a locked-out user cannot extend their own lockout forever.
-- Both RPCs share one counter because both check the same PIN.
create or replace function public.pin_attempts_exhausted(p_actor uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select count(*) >= 5
  from public.order_override_log
  where cashier_id = p_actor
    and action in ('cancel', 'delete')
    and not success
    and created_at > now() - interval '15 minutes';
$$;

revoke all on function public.pin_attempts_exhausted(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: cancel_order_with_pin
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order_with_pin(
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
    values (p_order_id, v_actor, 'cancel_blocked', false);
    return false;
  end if;

  -- Records *which* admin approved, not merely that some PIN matched.
  select id into v_admin_id
  from public.profiles
  where role = 'admin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  limit 1;

  -- Logged before the early return so failed attempts are recorded. This path
  -- must return false rather than RAISE: raising would roll the insert back and
  -- destroy both the audit trail and the lockout counter that reads it.
  insert into public.order_override_log
    (order_id, cashier_id, admin_id, action, success)
  values
    (p_order_id, v_actor, v_admin_id, 'cancel', v_admin_id is not null);

  if v_admin_id is null then
    return false;
  end if;

  -- Transaction-local (is_local = true), and cleared as soon as it is no longer
  -- needed so no later statement in the same transaction inherits it.
  perform set_config('app.pin_verified', 'true', true);

  update public.orders set status = 'cancelled' where id = p_order_id;

  -- Mirrors the client-side cancellation path in OrderContext.updateOrder, which
  -- marks the line items alongside the order. Doing it here keeps the two in
  -- step and inside one transaction.
  update public.order_items set is_cancelled = true where order_id = p_order_id;

  perform set_config('app.pin_verified', 'false', true);

  return true;
end;
$$;

revoke all on function public.cancel_order_with_pin(bigint, text) from public, anon;
grant execute on function public.cancel_order_with_pin(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: delete_order_with_pin
-- ---------------------------------------------------------------------------
--
-- Hard delete, and not currently wired to any UI. It is kept only because it
-- already exists in the hosted project; consider dropping it, since a cancelled
-- order preserves the audit trail that a deleted one destroys.

create or replace function public.delete_order_with_pin(
  p_order_id bigint,
  p_pin      text
)
returns boolean
language plpgsql
security definer
-- 'extensions' was missing here, so the previous bare crypt() call raised
-- "function crypt(text, text) does not exist" on every invocation.
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

  -- order_items first: its FK to orders has no ON DELETE CASCADE.
  delete from public.order_items where order_id = p_order_id;

  -- Detaches the log rows so the FK does not block the delete. The audit trail
  -- survives the order it refers to.
  update public.order_override_log set order_id = null where order_id = p_order_id;

  delete from public.orders where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.delete_order_with_pin(bigint, text) from public, anon;
grant execute on function public.delete_order_with_pin(bigint, text) to authenticated;
