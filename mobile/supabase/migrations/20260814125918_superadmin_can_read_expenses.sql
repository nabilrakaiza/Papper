-- The expenses SELECT policy was written in 20260801140000, before the
-- superadmin role existed, and 20260810140939 added that role without widening
-- it. So both superadmin accounts could not read `expenses` at all.
--
-- RLS filters rows instead of raising, so this failed silently: the Pembelian
-- screen showed an empty list to a superadmin with no error, and restocking
-- looked like it had not logged a purchase when in fact the trigger had written
-- the row correctly all along.
--
-- The gap was one-sided in the worst way — delete_expense_entry is
-- superadmin-only, so a superadmin could delete an expense they were not
-- allowed to see.
--
-- Writes stay closed: the log_stock_expense trigger is SECURITY DEFINER and
-- bypasses RLS, and there is still no INSERT/UPDATE/DELETE policy on the table.

drop policy if exists "admins can read expenses" on public.expenses;

create policy "admins can read expenses"
  on public.expenses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'superadmin')
    )
  );
