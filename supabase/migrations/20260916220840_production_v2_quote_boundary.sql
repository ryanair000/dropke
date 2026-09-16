-- Public quote requests are handled by the Next.js server. Inventory aggregate
-- reads no longer need a SECURITY DEFINER RPC exposed to browser roles.
revoke all on function public.get_public_sku_stock(text, text) from public, anon, authenticated;
grant execute on function public.get_public_sku_stock(text, text) to service_role;
