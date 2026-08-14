-- Approving a PIN-gated override moves from `admin` to `superadmin` only.
--
-- Deliberate narrowing, not a widening: there are four admins and two
-- superadmins, and cancelling a paid order is the one action that can erase a
-- sale after the fact. Concentrating that on the two people who already hold
-- the destructive powers (stock correction, expense deletion, menu costing)
-- keeps the approval list short enough to be meaningful.
--
-- ALL THREE PIN functions change together. cancel_order_with_pin is the legacy
-- v1 kept for installs still running the older build — leaving it matching
-- `admin` would have left a working bypass of this very policy, reachable by
-- anyone on an old APK. delete_order_with_pin is not wired to any UI but is
-- callable over PostgREST, so it counts too.
--
-- OPERATIONAL PRECONDITION: no superadmin has a pin_hash at the time of
-- writing, and no admin PIN will be accepted after this. Until a superadmin PIN
-- is set, NO cancellation can be approved by anyone. Set one immediately:
--
--   update public.profiles
--   set pin_hash = extensions.crypt('<6-digit-pin>', extensions.gen_salt('bf'))
--   where id = '<superadmin-uuid>';
--
-- The two existing admin PINs are now inert. They are left in place rather than
-- cleared here, because deleting someone's credential is the account owner's
-- call, not a migration's — but they no longer approve anything and should be
-- revoked once the superadmin PINs are confirmed working.
--
-- order_override_log.admin_id keeps its name. It now holds a superadmin id;
-- renaming the column would break the existing audit history and the queries in
-- docs/operations.md for no functional gain.

create or replace function public.cancel_order_with_pin_v2(p_order_id bigint, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_actor    uuid := auth.uid();
  v_admin_id uuid;
  v_fails    integer;
  v_oldest   timestamptz;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select count(*), min(created_at) into v_fails, v_oldest
  from public.order_override_log
  where cashier_id = v_actor
    and action in ('cancel', 'delete')
    and not success
    and created_at > now() - interval '15 minutes';

  if v_fails >= 5 then
    insert into public.order_override_log (order_id, cashier_id, action, success)
    values (p_order_id, v_actor, 'cancel_blocked', false);

    return jsonb_build_object(
      'ok', false,
      'reason', 'locked_out',
      'retry_after_seconds',
        greatest(0, ceil(extract(epoch from (v_oldest + interval '15 minutes' - now())))::int)
    );
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'superadmin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  limit 1;

  insert into public.order_override_log
    (order_id, cashier_id, admin_id, action, success)
  values
    (p_order_id, v_actor, v_admin_id, 'cancel', v_admin_id is not null);

  if v_admin_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'invalid_pin',
      'attempts_left', greatest(0, 5 - (v_fails + 1))
    );
  end if;

  perform set_config('app.pin_verified', 'true', true);

  update public.orders     set status = 'cancelled' where id = p_order_id;
  update public.order_items set is_cancelled = true where order_id = p_order_id;

  perform set_config('app.pin_verified', 'false', true);

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.cancel_order_with_pin(p_order_id bigint, p_pin text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_actor    uuid := auth.uid();
  v_admin_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if public.pin_attempts_exhausted(v_actor) then
    insert into public.order_override_log (order_id, cashier_id, action, success)
    values (p_order_id, v_actor, 'cancel_blocked', false);
    return false;
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'superadmin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  limit 1;

  insert into public.order_override_log
    (order_id, cashier_id, admin_id, action, success)
  values
    (p_order_id, v_actor, v_admin_id, 'cancel', v_admin_id is not null);

  if v_admin_id is null then
    return false;
  end if;

  perform set_config('app.pin_verified', 'true', true);

  update public.orders set status = 'cancelled' where id = p_order_id;

  update public.order_items set is_cancelled = true where order_id = p_order_id;

  perform set_config('app.pin_verified', 'false', true);

  return true;
end;
$function$;

create or replace function public.delete_order_with_pin(p_order_id bigint, p_pin text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_actor    uuid := auth.uid();
  v_admin_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if public.pin_attempts_exhausted(v_actor) then
    insert into public.order_override_log (order_id, cashier_id, action, success)
    values (p_order_id, v_actor, 'delete_blocked', false);
    return false;
  end if;

  select id into v_admin_id
  from public.profiles
  where role = 'superadmin'
    and pin_hash is not null
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  limit 1;

  insert into public.order_override_log
    (order_id, cashier_id, admin_id, action, success)
  values
    (p_order_id, v_actor, v_admin_id, 'delete', v_admin_id is not null);

  if v_admin_id is null then
    return false;
  end if;

  perform set_config('app.pin_verified', 'true', true);

  delete from public.order_items where order_id = p_order_id;

  update public.order_override_log set order_id = null where order_id = p_order_id;

  delete from public.orders where id = p_order_id;

  perform set_config('app.pin_verified', 'false', true);

  return true;
end;
$function$;
