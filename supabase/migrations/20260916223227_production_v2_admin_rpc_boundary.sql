-- Restrict privileged admin RPCs to the server-side service role.
-- This was immediately followed by a temporary compatibility grant while the
-- deployed admin still uses authenticated RPC calls. See the next migration.
revoke all on function public.admin_inventory() from authenticated;
revoke all on function public.admin_summary() from authenticated;
revoke all on function public.admin_batches(integer) from authenticated;
revoke all on function public.admin_orders(integer) from authenticated;
revoke all on function public.admin_audit(integer) from authenticated;
revoke all on function public.admin_update_sku(uuid, integer, integer) from authenticated;
revoke all on function public.admin_create_encrypted_batch(uuid, text, text, numeric, jsonb) from authenticated;

grant execute on function public.admin_inventory() to service_role;
grant execute on function public.admin_summary() to service_role;
grant execute on function public.admin_batches(integer) to service_role;
grant execute on function public.admin_orders(integer) to service_role;
grant execute on function public.admin_audit(integer) to service_role;
grant execute on function public.admin_update_sku(uuid, integer, integer) to service_role;
grant execute on function public.admin_create_encrypted_batch(uuid, text, text, numeric, jsonb) to service_role;
