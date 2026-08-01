-- Closes two holes found by the Supabase security advisor. Both are independent
-- of the PIN-override feature.
--
-- 1. Self-service admin escalation at signup.
--    handle_new_user() copied the role straight out of raw_user_meta_data, which
--    is supplied by the client calling signUp(). Anyone holding the publishable
--    key — it ships inside the app bundle — could register with
--    { role: 'admin' } and land in profiles as an admin. That also defeats the
--    PIN gate, which only constrains non-admins.
--
-- 2. Unauthenticated stock manipulation.
--    deduct_stock_for_order and check_stock_for_order are SECURITY DEFINER and
--    `anon` held EXECUTE, so they were reachable at /rest/v1/rpc/... without
--    signing in. deduct_stock_for_order(p_force := true) skips the
--    insufficient-stock check, so this allowed draining inventory outright.
--    Both also ran with a mutable search_path, which lets a caller who can
--    create objects shadow the unqualified tables they reference.

-- ---------------------------------------------------------------------------
-- 1. Roles are no longer client-assignable
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Every new account starts as a cashier. Promoting someone is a deliberate,
  -- out-of-band act (see supabase/README.md) rather than something the signup
  -- payload can ask for. `profiles` has no UPDATE policy, so clients cannot
  -- change a role afterwards either.
  insert into public.profiles (id, role)
  values (new.id, 'cashier');

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Stock functions: pin the search_path, drop anon access
-- ---------------------------------------------------------------------------

-- ALTER rather than CREATE OR REPLACE so the function bodies are left exactly
-- as they are. Note this must be `public`, not `''` — both bodies reference
-- stock, order_items and menu_ingredients unqualified, so an empty search_path
-- would break them.
alter function public.deduct_stock_for_order(integer, boolean) set search_path = public;
alter function public.check_stock_for_order(jsonb)             set search_path = public;
alter function public.log_stock_expense()                      set search_path = public;

-- Called from authenticated screens only (OrderContext.tsx), so anon never
-- needed these.
revoke all on function public.deduct_stock_for_order(integer, boolean) from anon, public;
revoke all on function public.check_stock_for_order(jsonb)             from anon, public;
grant execute on function public.deduct_stock_for_order(integer, boolean) to authenticated;
grant execute on function public.check_stock_for_order(jsonb)             to authenticated;

-- Trigger functions. They are invoked by their triggers, not over the API, so
-- nobody needs EXECUTE. Postgres checks EXECUTE when a trigger is created, not
-- each time it fires, so revoking here does not stop the existing triggers.
revoke all on function public.handle_new_user()   from anon, authenticated, public;
revoke all on function public.log_stock_expense() from anon, authenticated, public;
