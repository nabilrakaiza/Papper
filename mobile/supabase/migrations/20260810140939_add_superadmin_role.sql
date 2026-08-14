-- Adds a third role, 'superadmin', above 'admin' and 'cashier'.
--
-- 'admin' keeps restocking and recipe editing, but loses direct write access
-- to `menus` itself — creating/removing menu items and editing cost mode
-- (cogs_mode / manual_cogs) becomes 'superadmin'-only, alongside creating new
-- stock item types. Both `menus` and `stock` get an `is_active` flag so
-- "removing" a row is a soft delete: past orders and menu_ingredients rows
-- keep resolving correctly, since order_items already copies name/price at
-- order time rather than joining live.
--
-- The single "Admin can manage X" policies from the baseline are replaced
-- with per-command policies so the two roles can be split. `orders`,
-- `order_items`, `expenses`, `order_override_log` and `profiles` are
-- untouched — none of this changes who can place, edit or cancel an order.

alter table public.menus add column if not exists is_active boolean not null default true;
alter table public.stock add column if not exists is_active boolean not null default true;

-- menus: replace "Admin can manage menus" (for all, role = 'admin')

drop policy if exists "Admin can manage menus" on public.menus;

create policy "Superadmin can update menus" on public.menus
  for update to public using ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'superadmin'::text)))));

create policy "Superadmin can insert menus" on public.menus
  for insert to public with check ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'superadmin'::text)))));

-- stock: replace "Admin can manage stock" (for all, role = 'admin')
-- Previously folded a read grant into the same policy; split that out too,
-- since cashiers never read this table but admin still needs to.

drop policy if exists "Admin can manage stock" on public.stock;

create policy "Admin and superadmin can read stock" on public.stock
  for select to public using ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));

create policy "Admin and superadmin can update stock" on public.stock
  for update to public using ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));

create policy "Superadmin can insert stock" on public.stock
  for insert to public with check ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'superadmin'::text)))));

-- menu_ingredients: replace "Admin can manage menu_ingredients" (for all,
-- role = 'admin') — recipe editing stays admin + superadmin, this is what
-- "admin can update cogs" means now that cogs_mode/manual_cogs on `menus`
-- itself is superadmin-only.

drop policy if exists "Admin can manage menu_ingredients" on public.menu_ingredients;

create policy "Admin and superadmin can manage menu_ingredients" on public.menu_ingredients
  for all to public using ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))))
  with check ((EXISTS ( SELECT 1 FROM profiles
    WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text]))))));

-- Cashiers toggle `menus.available` from the availability tab, but the
-- policy above (like the one it replaces) does not grant cashiers write
-- access to `menus` — only admin/superadmin manage menus directly now.
-- Route the toggle through a narrow RPC instead of a raw client UPDATE, so
-- it isn't tied to broader menus write access. Callable by any signed-in
-- staff account, not just cashiers: it only flips one boolean and is
-- trivially reversible.

create or replace function public.toggle_menu_availability(p_menu_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update menus set available = not available where id = p_menu_id;
end;
$$;

revoke all on function public.toggle_menu_availability(bigint) from public;
grant execute on function public.toggle_menu_availability(bigint) to authenticated;
