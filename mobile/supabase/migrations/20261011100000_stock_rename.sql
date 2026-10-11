-- A stock item's name and unit could only be set when it was created. A typo
-- in either ("Gual", "gr" where every other item says "gram") stayed for good,
-- or was worked around by archiving the item and creating it again — which
-- leaves its recipes pointing at the archived row.
--
-- correct_stock already is the superadmin's "this row is wrong, set it right"
-- path, so it takes the two extra fields rather than a second RPC growing up
-- beside it.
--
-- ---------------------------------------------------------------------------
-- A unit change is a relabel, not a conversion
-- ---------------------------------------------------------------------------
--
-- stock.quantity, stock.price_per_unit, every menu_ingredients.quantity and
-- every expenses row for the item are plain numbers counted in the unit. None
-- of them is touched here: renaming "gram" to "kg" leaves 500 gram reading as
-- 500 kg, and a recipe that took 20 now takes 20 kg. That is right for fixing
-- how a unit is spelled and wrong for changing what it measures. The app says
-- so before saving; the quantity and price can be set in the same call, the
-- recipes have to be edited by hand.
--
-- ---------------------------------------------------------------------------
-- Why the duplicate check
-- ---------------------------------------------------------------------------
--
-- Nothing in the schema makes a stock name unique, but the app treats
-- name + unit as what an item *is*: the restock picker shows the pair, and the
-- builds already installed look the row up by it. Two rows sharing it would
-- make a purchase of one land on the other. Only a call that actually changes
-- the pair is checked, so a plain quantity correction still goes through on a
-- row that already has a twin.
--
-- ---------------------------------------------------------------------------
-- Builds already installed
-- ---------------------------------------------------------------------------
--
-- p_name and p_unit default to null, meaning "leave it". A build that still
-- sends the four original arguments resolves to this function and behaves
-- exactly as before. The four-argument function has to go, though: left in
-- place, PostgREST sees two candidates for that call and refuses to pick.
--
-- Written to run as one transaction. Safe to replay.

-- ---------------------------------------------------------------------------
-- 1. Somewhere to record what a rename changed
-- ---------------------------------------------------------------------------

alter table public.admin_correction_log
  add column if not exists new_name text,
  add column if not exists old_unit text,
  add column if not exists new_unit text;

comment on column public.admin_correction_log.new_name is
  'What a stock_correction renamed the item to. Null when the name was left alone; target_name is the name before.';
comment on column public.admin_correction_log.old_unit is
  'The unit before a stock_correction relabelled it. Null when the unit was left alone.';
comment on column public.admin_correction_log.new_unit is
  'The unit after a stock_correction relabelled it. Null when the unit was left alone. A relabel converts nothing: quantities and prices on the same row are in whichever unit applied at the time.';

-- ---------------------------------------------------------------------------
-- 2. correct_stock takes a name and a unit
-- ---------------------------------------------------------------------------

drop function if exists public.correct_stock(bigint, numeric, integer, text);

create or replace function public.correct_stock(
  p_stock_id bigint,
  p_quantity numeric,
  p_price_per_unit integer,
  p_note text default null,
  p_name text default null,
  p_unit text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_quantity numeric;
  v_old_price integer;
  v_old_name text;
  v_old_unit text;
  v_name text;
  v_unit text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'superadmin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select quantity, price_per_unit, name, unit
  into v_old_quantity, v_old_price, v_old_name, v_old_unit
  from stock where id = p_stock_id;

  -- Null leaves the field alone; anything else is taken as the new value, so a
  -- blank one is a mistake rather than a way of saying "unchanged".
  v_name := coalesce(btrim(p_name), v_old_name);
  v_unit := coalesce(btrim(p_unit), v_old_unit);

  if v_name = '' then
    raise exception 'Stock name must not be empty' using errcode = '22023';
  end if;
  if v_unit = '' then
    raise exception 'Stock unit must not be empty' using errcode = '22023';
  end if;

  if (lower(v_name), lower(v_unit))
       is distinct from (lower(btrim(v_old_name)), lower(btrim(v_old_unit)))
     and exists (
       select 1 from stock
       where id <> p_stock_id
         and lower(btrim(name)) = lower(v_name)
         and lower(btrim(unit)) = lower(v_unit)
     )
  then
    raise exception 'Another stock item is already called "%" (%)', v_name, v_unit
      using errcode = '23505';
  end if;

  perform set_config('app.stock_correction', 'true', true);

  update stock
  set name = v_name, unit = v_unit,
      quantity = p_quantity, price_per_unit = p_price_per_unit, updated_at = now()
  where id = p_stock_id;

  insert into admin_correction_log
    (action, superadmin_id, stock_id, target_name, new_name, old_unit, new_unit,
     old_quantity, new_quantity, old_price_per_unit, new_price_per_unit, note)
  values
    ('stock_correction', auth.uid(), p_stock_id, v_old_name,
     case when v_name is distinct from v_old_name then v_name end,
     case when v_unit is distinct from v_old_unit then v_old_unit end,
     case when v_unit is distinct from v_old_unit then v_unit end,
     v_old_quantity, p_quantity, v_old_price, p_price_per_unit, p_note);
end;
$function$;

revoke all on function public.correct_stock(bigint, numeric, integer, text, text, text) from public, anon;
grant execute on function public.correct_stock(bigint, numeric, integer, text, text, text) to authenticated;
