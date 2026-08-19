-- admin_correction_log identified its subject only by `target_name`, a free-text
-- copy of the stock item's name at the time of the correction. Nothing tied an
-- entry back to the row it was about, so per-item correction history could not
-- be looked up, and a rename silently orphaned every earlier entry.
--
-- Same treatment `expenses.stock_id` got. `target_name` stays and stays
-- authoritative for what the item was *called* at the time: the id says which
-- row it was, the name says how it read then.

alter table public.admin_correction_log
  add column stock_id bigint references public.stock(id) on delete restrict;

comment on column public.admin_correction_log.stock_id is
  'Stock row this entry concerns. Null for entries written before this column existed, and for expense deletions whose expense row had no stock_id.';

-- Without this the FK makes every delete on `stock` scan the whole log, and
-- reading one item's correction history is a seq scan too.
create index admin_correction_log_stock_id_idx
  on public.admin_correction_log (stock_id, created_at desc);

-- Both writers have the id in hand already; neither was recording it.

create or replace function public.correct_stock(
  p_stock_id bigint,
  p_quantity numeric,
  p_price_per_unit integer,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_quantity numeric;
  v_old_price integer;
  v_name text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'superadmin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select quantity, price_per_unit, name into v_old_quantity, v_old_price, v_name
  from stock where id = p_stock_id;

  perform set_config('app.stock_correction', 'true', true);

  update stock
  set quantity = p_quantity, price_per_unit = p_price_per_unit, updated_at = now()
  where id = p_stock_id;

  insert into admin_correction_log
    (action, superadmin_id, stock_id, target_name, old_quantity, new_quantity,
     old_price_per_unit, new_price_per_unit, note)
  values
    ('stock_correction', auth.uid(), p_stock_id, v_name, v_old_quantity, p_quantity,
     v_old_price, p_price_per_unit, p_note);
end;
$function$;

create or replace function public.delete_expense_entry(
  p_expense_id bigint,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_quantity numeric;
  v_price integer;
  v_stock_id bigint;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'superadmin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select name, quantity, price_per_unit, stock_id
  into v_name, v_quantity, v_price, v_stock_id
  from expenses where id = p_expense_id;

  delete from expenses where id = p_expense_id;

  insert into admin_correction_log
    (action, superadmin_id, stock_id, target_name, old_quantity, old_price_per_unit, note)
  values
    ('expense_deleted', auth.uid(), v_stock_id, v_name, v_quantity, v_price, p_note);
end;
$function$;
