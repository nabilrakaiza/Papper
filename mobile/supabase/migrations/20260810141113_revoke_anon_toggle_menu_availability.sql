-- toggle_menu_availability (20260810140939) revoked EXECUTE from PUBLIC, but
-- this project's default privileges grant new functions in `public` EXECUTE
-- for `anon` directly (not via PUBLIC), so that revoke was a no-op for anon —
-- confirmed via information_schema.routine_privileges after applying, and
-- via the security advisor's anon_security_definer_function_executable lint.
-- Same class of bug already fixed once for check_stock_for_order /
-- deduct_stock_for_order in 20260801021929_lock_down_definer_functions.sql.
-- Unauthenticated requests could otherwise flip any menu's availability.

revoke execute on function public.toggle_menu_availability(bigint) from anon;
