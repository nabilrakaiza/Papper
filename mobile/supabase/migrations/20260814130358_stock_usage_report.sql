-- Superadmin report: how much of each stock item the orders in a period
-- actually consumed, reconstructed from the recipes.
--
-- Why an RPC rather than a client-side join: the aggregation is over every
-- order_item in the window joined to menu_ingredients, which is a lot of rows
-- to ship to a phone only to sum them. SECURITY DEFINER also lets the role
-- check live in one place.
--
-- Three things this report is honest about, all reflected in the shape of the
-- result rather than hidden:
--
--   * It counts lines with is_stock_deducted = true, INCLUDING those on
--     cancelled orders. Cancelling never returns stock, so counting them is
--     what makes this reconcilable against real stock levels. Excluding them
--     would produce a tidier number that does not match the shelf.
--   * Custom off-menu items have no recipe and consume nothing measurable.
--     They are reported separately as `unmapped` so the totals are visibly
--     incomplete rather than quietly so.
--   * Recipes are read as they are NOW. If a recipe changed after an order was
--     placed, that order's consumption is recomputed with the current recipe.
--     menu_ingredients keeps no history, so this cannot be done better without
--     versioning it.

create or replace function public.stock_usage_report(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_items    jsonb;
  v_unmapped jsonb;
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'superadmin'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_items
  from (
    select s.id             as stock_id,
           s.name           as stock_name,
           s.unit,
           sum(oi.quantity * mi.quantity)                      as quantity_used,
           s.price_per_unit,
           sum(oi.quantity * mi.quantity) * s.price_per_unit   as value_used
    from order_items oi
    join orders           o  on o.id = oi.order_id
    join menu_ingredients mi on mi.menu_id = oi.menu_id
    join stock            s  on s.id = mi.stock_id
    where oi.is_stock_deducted is true
      and o.created_at >= p_from
      and o.created_at <  p_to
    group by s.id, s.name, s.unit, s.price_per_unit
    order by 6 desc
  ) t;

  -- Lines the report cannot attribute to any stock item: custom off-menu items
  -- (no menu row) and menus costed manually (no ingredient rows).
  select jsonb_build_object(
           'custom_lines',  count(*) filter (where oi.menu_id is null),
           'recipeless_lines', count(*) filter (
             where oi.menu_id is not null
               and not exists (select 1 from menu_ingredients mi where mi.menu_id = oi.menu_id)
           )
         )
  into v_unmapped
  from order_items oi
  join orders o on o.id = oi.order_id
  where oi.is_stock_deducted is true
    and o.created_at >= p_from
    and o.created_at <  p_to;

  return jsonb_build_object('items', v_items, 'unmapped', v_unmapped);
end;
$function$;

revoke all on function public.stock_usage_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.stock_usage_report(timestamptz, timestamptz) to authenticated;
