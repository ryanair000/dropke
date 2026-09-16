create or replace function public.get_public_sku_stock(p_platform text, p_region_code text)
returns table(
  id uuid,
  sku text,
  platform text,
  region_code text,
  region_name text,
  currency text,
  denomination numeric,
  sell_price_kes integer,
  low_stock_threshold integer,
  active boolean,
  available_count integer,
  reserved_count integer,
  sold_count integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_platform not in ('PlayStation','Xbox','Nintendo','PC') then
    raise exception 'INVALID_PLATFORM';
  end if;
  if p_region_code not in ('US','UK','ZA','AE','IN') then
    raise exception 'INVALID_REGION';
  end if;

  perform public.release_expired_inventory();

  return query
  select
    s.id,
    s.sku,
    s.platform,
    s.region_code,
    s.region_name,
    s.currency,
    s.denomination,
    s.sell_price_kes,
    s.low_stock_threshold,
    s.active,
    count(c.id) filter (where c.status = 'available')::int,
    count(c.id) filter (where c.status = 'reserved')::int,
    count(c.id) filter (where c.status = 'sold')::int
  from public.gift_card_skus s
  left join public.inventory_codes c on c.sku_id = s.id
  where s.platform = p_platform
    and s.region_code = p_region_code
    and s.active = true
  group by s.id
  order by s.denomination;
end;
$$;

revoke all on function public.get_public_sku_stock(text, text) from public;
grant execute on function public.get_public_sku_stock(text, text) to anon, authenticated, service_role;

comment on function public.get_public_sku_stock(text, text) is
  'Public DROPKE quote surface. Returns only SKU metadata, selling price and aggregate stock counts. Never returns encrypted code material.';
