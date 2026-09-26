-- A fourth role, 'owner': reads the money, writes nothing, web only.
--
-- The owner is not a more senior superadmin. The superadmin runs the place and
-- approves overrides; the owner looks at the numbers. So this role is granted
-- no write path at all, and the only new read it gets is through the owner_*
-- report functions in the next migration.
--
-- `profiles.role` has no CHECK constraint, so the role needs no DDL to exist.
-- Accounts are promoted to it the same way as any other, from the SQL Editor:
--
--   update public.profiles set role = 'owner' where id = '<user-uuid>';
--
-- ---------------------------------------------------------------------------
-- Why a trigger and not RLS
-- ---------------------------------------------------------------------------
--
-- The write policies on orders, order_items and order_payments test only that
-- the caller is signed in, and they are what every till depends on. Rewriting
-- them to list the permitted roles would put the till's ability to take money
-- at risk to fence out an account that is not supposed to be there.
--
-- RLS would not be enough anyway. deduct_stock_for_order and
-- toggle_menu_availability are SECURITY DEFINER and bypass RLS entirely, and
-- they check nothing about the caller beyond having a profile. A trigger fires
-- on every write regardless of which path reached the table, and auth.uid()
-- still names the API caller inside a definer function, so one guard covers
-- direct writes, the invoker RPCs and the definer RPCs alike.
--
-- Statement-level, so the cost to the till is one indexed profiles lookup per
-- write statement, not per row. A write with no JWT (SQL Editor, service role)
-- has a null auth.uid(), matches no profile, and passes.

create or replace function public.reject_owner_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Akun owner hanya dapat melihat data.'
      using errcode = '42501';
  end if;

  return null;
end;
$$;

-- Invoked by its triggers only.
revoke all on function public.reject_owner_writes() from public, anon, authenticated;

do $$
declare
  t text;
begin
  -- order_override_log is here because a failed PIN attempt writes to it and
  -- counts towards pin_attempts_exhausted: an owner guessing at a PIN could
  -- lock the cashiers out of cancelling that order.
  foreach t in array array[
    'orders', 'order_items', 'order_payments',
    'menus', 'menu_ingredients', 'stock', 'expenses',
    'order_override_log', 'admin_correction_log'
  ]
  loop
    execute format('drop trigger if exists reject_owner_writes on public.%I', t);
    execute format(
      'create trigger reject_owner_writes
         before insert or update or delete on public.%I
         for each statement execute function public.reject_owner_writes()',
      t
    );
  end loop;
end;
$$;

comment on column public.profiles.role is
  '''cashier'' (default), ''admin'', ''superadmin'' or ''owner''. See docs/security.md#role-model.';
