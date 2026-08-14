-- Debit cards are settled through the same EDC terminal as QRIS but reconcile
-- separately at the bank, so the cafe needs them broken out in reporting rather
-- than lumped in with 'Bank Transfer'.
--
-- method_of_payment is a plain text column guarded by a CHECK, so the list has
-- to be dropped and recreated — there is no ALTER for a check constraint.
-- Existing rows only ever hold one of the three original values, so the wider
-- constraint validates without touching data.

alter table public.orders drop constraint if exists orders_method_of_payment_check;

alter table public.orders add constraint orders_method_of_payment_check
  CHECK ((method_of_payment = ANY (ARRAY[
    'QRIS'::text,
    'Bank Transfer'::text,
    'Cash'::text,
    'Debit'::text
  ])));
