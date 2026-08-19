-- Three unrelated holes, all found by the same audit.

-- 1. TRUNCATE is not subject to row-level security. It is gated purely by the
--    table privilege, so RLS -- the thing this whole schema relies on -- never
--    saw these calls. Both `anon` and `authenticated` held TRUNCATE on every
--    table except `expenses` (which an earlier migration happened to lock
--    down), including `orders`, `order_items`, and both audit logs. The anon
--    key ships inside the published app, so wiping the sales history, or the
--    record of who cancelled what, needed nothing but that key.
--
--    Nothing in the app is unauthenticated: the only pre-session code path is
--    Supabase Auth itself, which does not touch this schema. So `anon` gets
--    nothing here at all, and `authenticated` keeps everything except the one
--    privilege RLS cannot police.

revoke truncate on all tables in schema public from authenticated;
revoke all    on all tables in schema public from anon;

-- Future tables inherit the same defaults, or the next migration silently
-- reopens this.
alter default privileges for role postgres in schema public
  revoke truncate on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

-- 2. The override log's read policy named `role = 'admin'` alone. It predates
--    the superadmin role, exactly like the `expenses` policy did -- and it
--    matters more now that approving a cancellation is superadmin-only: the
--    one person who authorises every override could not read the record of
--    them. RLS filters rows rather than raising, so it showed as an empty
--    screen, not an error.

drop policy if exists "admins can read override log" on public.order_override_log;

create policy "Admin and superadmin can read override log"
  on public.order_override_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'superadmin')
    )
  );

-- 3. The expense trigger's INSERT branch was unconditional, so creating a stock
--    item type wrote an expense for 0 units at Rp 0 -- a purchase that never
--    happened, sitting on Pembelian. Creating an item *with* an opening
--    quantity is a real purchase and still logs; creating an empty one is not.

create or replace function public.log_stock_expense()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('app.stock_correction', true), '') = 'true' then
    return new;
  end if;

  if (tg_op = 'UPDATE' and new.quantity > old.quantity) then
    insert into public.expenses (stock_id, name, quantity, price_per_unit, expense_date)
    values (new.id, new.name, (new.quantity - old.quantity), new.price_per_unit,
            coalesce(new.last_purchase_date, now()));
  elsif (tg_op = 'INSERT' and new.quantity > 0) then
    insert into public.expenses (stock_id, name, quantity, price_per_unit, expense_date)
    values (new.id, new.name, new.quantity, new.price_per_unit,
            coalesce(new.last_purchase_date, now()));
  end if;

  return new;
end;
$function$;
