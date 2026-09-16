-- Temporary compatibility grant for the currently deployed Admin V1.
-- This keeps production working until the Next.js admin routes are deployed with
-- server-side service-role authorization. The following cutover migration removes
-- these grants again.
grant execute on function public.is_dropke_admin() to authenticated;
grant execute on function public.admin_inventory() to authenticated;
grant execute on function public.admin_summary() to authenticated;
grant execute on function public.admin_batches(integer) to authenticated;
grant execute on function public.admin_orders(integer) to authenticated;
grant execute on function public.admin_audit(integer) to authenticated;
grant execute on function public.admin_update_sku(uuid, integer, integer) to authenticated;
grant execute on function public.admin_create_encrypted_batch(uuid, text, text, numeric, jsonb) to authenticated;
