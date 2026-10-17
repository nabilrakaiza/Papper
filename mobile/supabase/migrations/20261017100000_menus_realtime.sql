-- A superadmin can now change a menu's name, price and category from the HPP
-- screen, but the tablets load the menu once at launch. Until they restarted
-- they went on ringing the item up at its old price, under its old name, in
-- its old tab. OrderContext now subscribes to `menus` and reloads the menu on
-- any change, which needs the table in the realtime publication.
--
-- Nothing else changes: the "Superadmin can update menus" policy already
-- covers these columns, and order_items keeps its own copy of the name and
-- price, so orders already taken are not affected. Builds without the
-- subscription simply never listen.
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
         and tablename = 'menus'
     )
  then
    alter publication supabase_realtime add table public.menus;
  end if;
end $$;
