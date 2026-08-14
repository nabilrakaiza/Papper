-- Off-menu ("custom") line items: the cashier types a name, price and quantity
-- for something that isn't in `menus` — a one-off special, a staff meal, a
-- catering charge — and it becomes an ordinary line on the order.
--
-- Such a line has no menu row to point at, so menu_id becomes nullable. The
-- foreign key stays: a NULL simply isn't checked against `menus`.
--
-- What NULL menu_id means downstream, all of it already correct today:
--
--   * check_stock_for_order / deduct_stock_for_order join menu_ingredients on
--     menu_id. NULL matches nothing, so a custom item has no recipe, needs no
--     stock and never blocks an order. It is still flagged is_stock_deducted
--     by the blanket UPDATE at the end of deduct_stock_for_order, which is
--     what we want — there is nothing left to deduct for it.
--   * Both sales screens read the denormalised name/price/quantity off
--     order_items and never join menus, so custom items appear in revenue and
--     in the best-seller breakdown like anything else.
--   * prevent_locked_order_item_change compares menu_id with IS NOT DISTINCT
--     FROM, which is NULL-safe, so the paid-order lock still holds.
--
-- order_items_price_check (price > 0) is deliberately left alone: a custom item
-- must still carry a real price. The client validates before insert.

alter table public.order_items alter column menu_id drop not null;

comment on column public.order_items.menu_id is
  'References menus(id), or NULL for a custom off-menu line item priced by the cashier.';
