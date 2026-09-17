-- DROPKE defense-in-depth hardening.
-- RLS is already enabled by 0001. Keep direct Data API access closed and
-- allow only the service role to reach sensitive tables/functions.

revoke all on table public.gift_card_skus from anon, authenticated;
revoke all on table public.supplier_batches from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.inventory_codes from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;

create policy "deny direct client access" on public.gift_card_skus as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.supplier_batches as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.orders as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.order_items as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.inventory_codes as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.audit_logs as restrictive for all to anon, authenticated using (false) with check (false);

alter function public.release_expired_inventory() set search_path = public, pg_catalog;
alter function public.reserve_inventory(text, uuid[], timestamptz) set search_path = public, pg_catalog;
alter function public.release_order_inventory(text) set search_path = public, pg_catalog;
alter function public.finalize_inventory(text) set search_path = public, pg_catalog;

create or replace view public.sku_stock
with (security_invoker = true)
as
select
  s.*,
  count(c.id) filter (where c.status = 'available')::int as available_count,
  count(c.id) filter (where c.status = 'reserved')::int as reserved_count,
  count(c.id) filter (where c.status = 'sold')::int as sold_count
from public.gift_card_skus s
left join public.inventory_codes c on c.sku_id = s.id
group by s.id;

revoke all on public.sku_stock from anon, authenticated;
grant select on public.sku_stock to service_role;
