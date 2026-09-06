-- Remove the payment columns from `orders`. Payment facts live in
-- `order_payments` and nowhere else.
--
-- Nothing is lost: 20260906100000_backfill_order_payments.sql copied every paid
-- order's method and tender across, and that was verified row by row before
-- this ran — 19 paid orders, 19 payment rows, no cash tender altered.
--
-- ⚠️ This is the one migration in this project that is NOT backwards
-- compatible. Builds predating the split-bill release write both of these
-- columns in markPaid, so any tablet still on such a build cannot take payment
-- once this has been applied. It was applied deliberately, with that understood.
--
-- The reason the columns had to go rather than merely stop being written:
-- payment_amount meant two different things depending on the method — the cash
-- tendered for Cash, the bill for everything else — so it could not be summed
-- into a revenue figure, and the receipt printed a recomputed total rather than
-- trusting it. Neither column could describe a split bill at all.

alter table public.orders drop constraint if exists orders_method_of_payment_check;

alter table public.orders drop column if exists payment_amount;
alter table public.orders drop column if exists method_of_payment;

comment on table public.order_payments is
  'The only record of how an order was paid. One row per payer: a single row for an ordinary order, several for a split bill.';
