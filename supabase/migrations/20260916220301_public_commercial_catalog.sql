-- Safe public commercial catalog surface.
-- Only product metadata, enabled platform/region settings and current store prices
-- are client-readable. Supplier feeds, orders and inventory code material remain private.

revoke all on table public.products from anon, authenticated;
revoke all on table public.platform_region_settings from anon, authenticated;
revoke all on table public.product_prices from anon, authenticated;

drop policy if exists "deny direct client access" on public.products;
drop policy if exists "deny direct client access" on public.platform_region_settings;
drop policy if exists "deny direct client access" on public.product_prices;

create policy "public read active products" on public.products
  for select to anon, authenticated
  using (active = true);

create policy "public read enabled platform regions" on public.platform_region_settings
  for select to anon, authenticated
  using (public_enabled = true);

create policy "public read current product prices" on public.product_prices
  for select to anon, authenticated
  using (
    is_current = true
    and exists (
      select 1
      from public.products p
      where p.id = product_prices.product_id
        and p.active = true
    )
    and exists (
      select 1
      from public.platform_region_settings s
      where s.platform = product_prices.platform
        and s.region_code = product_prices.region_code
        and s.public_enabled = true
    )
  );

grant select on table public.products to anon, authenticated;
grant select on table public.platform_region_settings to anon, authenticated;
grant select on table public.product_prices to anon, authenticated;
