-- The PIN override trail, readable as something a person can act on.
--
-- order_override_log has been written since 20260801120000 and has never had a
-- screen. docs/operations.md carries raw SQL for it, which means the record of
-- who approved what is only reachable by someone willing to open the Supabase
-- dashboard — and the correction feature adds a second thing worth watching.
--
-- The log itself is already readable by admin and superadmin. What is not is
-- `profiles`, which is own-row-only, so a client reading the log straight gets
-- a list of UUIDs. Resolving them needs to happen behind SECURITY DEFINER.
--
-- Deliberately narrow: it returns the two names and nothing else from
-- `profiles`. Widening the profiles grant instead would expose every staff
-- name and role to every authenticated client, to save a function.
--
-- Same shape as stock_usage_report — jsonb over a period, role-checked inside.

create or replace function public.override_log_report(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_rows jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid();

  -- Matches the table's own read policy rather than narrowing to superadmin:
  -- an admin can already read these rows directly, so refusing them here would
  -- only mean they read the raw UUIDs instead of the names.
  if v_role is null or v_role not in ('admin', 'superadmin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select
      l.id,
      l.order_id,
      l.action,
      l.success,
      l.created_at,
      -- The staff member who attempted it, and the superadmin whose PIN
      -- approved it. admin_id is null on a failure, and both are null for rows
      -- written before the columns were populated.
      c.name as cashier_name,
      a.name as admin_name
    from public.order_override_log l
    left join public.profiles c on c.id = l.cashier_id
    left join public.profiles a on a.id = l.admin_id
    where l.created_at >= p_from
      and l.created_at < p_to
  ) r;

  return v_rows;
end;
$$;

revoke all on function public.override_log_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.override_log_report(timestamptz, timestamptz) to authenticated;
