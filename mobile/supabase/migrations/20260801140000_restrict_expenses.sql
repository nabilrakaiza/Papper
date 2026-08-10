-- `expenses` was world-readable and world-writable.
--
-- Both policies were granted to the `public` role, which includes `anon`, so
-- anyone holding the publishable key (it ships in the app bundle) could read
-- every expense record and insert arbitrary ones. Those rows feed COGS and the
-- sales reporting, so forged inserts corrupt the books.
--
-- Nothing legitimately relied on either policy:
--   * the only client read is app/(admin)/(tabs)/purchase.tsx, an admin screen
--   * the only writer is the log_stock_expense trigger, which is SECURITY
--     DEFINER and owned by postgres, so it bypasses RLS entirely

drop policy if exists "Allow public insert" on public.expenses;
drop policy if exists "Allow public read"   on public.expenses;

-- Mirrors the existing shape of the "admins can read override log" policy on
-- order_override_log. The subquery needs SELECT on profiles.id and profiles.role,
-- both of which remain granted after the pin_hash lockdown.
create policy "admins can read expenses"
  on public.expenses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- No INSERT policy is created on purpose: the trigger is the only writer. If
-- manual expense entry is added to the app later, it needs an explicit
-- admin-scoped INSERT policy.

-- Dropping the policies stops anon reading rows, but Supabase's default table
-- GRANT to anon remains, which keeps `expenses` listed in the generated
-- REST/GraphQL schema. anon has no use for this table at all.
revoke all on public.expenses from anon;
