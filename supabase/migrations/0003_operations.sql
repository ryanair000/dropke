create index if not exists inventory_codes_batch_id_idx on public.inventory_codes(batch_id);
create index if not exists order_items_sku_id_idx on public.order_items(sku_id);
create index if not exists order_items_order_ref_idx on public.order_items(order_ref);
create index if not exists supplier_batches_sku_id_idx on public.supplier_batches(sku_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

create extension if not exists pg_cron;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'dropke-release-expired-inventory' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'dropke-release-expired-inventory',
  '*/5 * * * *',
  'select public.release_expired_inventory();'
);
