-- `expenses` referred to the stock item it came from only by `name`, as free
-- text. Renaming a stock item therefore split its purchase history in two,
-- silently and irreversibly — nothing records that "Ayam Potong" and "Ayam
-- Potong 4" were ever the same thing. Any per-item report ("what have we spent
-- on beras this year, and is the unit price creeping up?") would have been
-- quietly wrong from the first rename onward.
--
-- Backfilled by exact name match, which is safe precisely because it is being
-- done now: all 5 existing rows match exactly one stock row, no stock names are
-- duplicated, and nothing is orphaned. That property degrades permanently the
-- first time someone renames an item, which is why this is worth doing before
-- the reports that would depend on it.
--
-- `name` is deliberately kept alongside the id. It is the name as it stood at
-- purchase time — the same denormalisation order_items uses for what was sold —
-- so a rename does not rewrite what the historical receipts said.

alter table public.expenses
  add column if not exists stock_id bigint;

update public.expenses e
set stock_id = s.id
from public.stock s
where e.stock_id is null
  and e.name = s.name;

-- ON DELETE RESTRICT, not SET NULL: removing a stock item is a soft delete
-- (is_active) and there is no DELETE policy on the table, so a hard delete can
-- only come from someone at the SQL editor. Refusing it while purchase history
-- exists is the useful outcome there.
alter table public.expenses
  drop constraint if exists expenses_stock_id_fkey;

alter table public.expenses
  add constraint expenses_stock_id_fkey
  foreign key (stock_id) references public.stock(id) on delete restrict;

-- Left nullable on purpose. The trigger below always sets it for a restock, so
-- NULL is free to carry a real meaning later: an expense that is not a stock
-- purchase at all (rent, wages, utilities). 20260801140000 already anticipated
-- manual expense entry arriving one day; this leaves room for it.
comment on column public.expenses.stock_id is
  'The stock item purchased, or NULL for an expense that is not a stock purchase.';

create index if not exists expenses_stock_id_date_idx
  on public.expenses (stock_id, expense_date desc);

-- Same function as 20260811093548 (the app.stock_correction bypass is
-- unchanged), with stock_id now recorded on both insert paths.
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
  elsif (tg_op = 'INSERT') then
    insert into public.expenses (stock_id, name, quantity, price_per_unit, expense_date)
    values (new.id, new.name, new.quantity, new.price_per_unit,
            coalesce(new.last_purchase_date, now()));
  end if;

  return new;
end;
$function$;
