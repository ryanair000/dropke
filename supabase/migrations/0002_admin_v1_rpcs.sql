create table if not exists public.admin_users (
  email text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

insert into public.admin_users (email, active)
values ('nitradefc24p@gmail.com', true)
on conflict (email) do update set active = excluded.active;

create or replace function public.is_dropke_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.active = true
      and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_dropke_admin() from public, anon;
grant execute on function public.is_dropke_admin() to authenticated;

create or replace function public.admin_inventory()
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
set search_path = public, pg_temp
as $$
begin
  if not public.is_dropke_admin() then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  perform public.release_expired_inventory();
  return query
  select s.id, s.sku, s.platform, s.region_code, s.region_name, s.currency,
         s.denomination, s.sell_price_kes, s.low_stock_threshold, s.active,
         count(c.id) filter (where c.status = 'available')::int,
         count(c.id) filter (where c.status = 'reserved')::int,
         count(c.id) filter (where c.status = 'sold')::int
  from public.gift_card_skus s
  left join public.inventory_codes c on c.sku_id = s.id
  group by s.id
  order by s.platform, s.region_code, s.denomination;
end;
$$;

create or replace function public.admin_summary()
returns table(
  sku_count integer,
  available integer,
  reserved integer,
  sold integer,
  low_stock integer,
  order_count integer,
  paid_pending integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_dropke_admin() then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  perform public.release_expired_inventory();
  return query
  with stock as (
    select s.id, s.low_stock_threshold,
      count(c.id) filter (where c.status = 'available')::int as available_count,
      count(c.id) filter (where c.status = 'reserved')::int as reserved_count,
      count(c.id) filter (where c.status = 'sold')::int as sold_count
    from public.gift_card_skus s
    left join public.inventory_codes c on c.sku_id = s.id
    group by s.id
  )
  select
    (select count(*)::int from stock),
    coalesce((select sum(available_count)::int from stock), 0),
    coalesce((select sum(reserved_count)::int from stock), 0),
    coalesce((select sum(sold_count)::int from stock), 0),
    coalesce((select count(*)::int from stock where available_count <= low_stock_threshold), 0),
    (select count(*)::int from public.orders),
    (select count(*)::int from public.orders where status = 'paid_pending_fulfilment');
end;
$$;

create or replace function public.admin_batches(p_limit integer default 100)
returns table(
  id uuid,
  batch_ref text,
  sku_id uuid,
  supplier_name text,
  supplier_ref text,
  unit_cost_kes numeric,
  quantity integer,
  created_by text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_dropke_admin() then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select b.id, b.batch_ref, b.sku_id, b.supplier_name, b.supplier_ref,
         b.unit_cost_kes, b.quantity, b.created_by, b.created_at
  from public.supplier_batches b
  order by b.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.admin_orders(p_limit integer default 100)
returns table(
  ref text,
  product_name text,
  platform text,
  region_name text,
  kes_price integer,
  payment_status public.payment_status,
  status public.order_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_dropke_admin() then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select o.ref, o.product_name, o.platform, o.region_name, o.kes_price,
         o.payment_status, o.status, o.created_at
  from public.orders o
  order by o.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.admin_audit(p_limit integer default 100)
returns table(
  id uuid,
  actor_email text,
  action text,
  resource text,
  details jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_dropke_admin() then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select a.id, a.actor_email, a.action, a.resource, a.details, a.created_at
  from public.audit_logs a
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.admin_update_sku(
  p_id uuid,
  p_sell_price_kes integer,
  p_low_stock_threshold integer
)
returns table(id uuid, sku text, sell_price_kes integer, low_stock_threshold integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_sku text;
begin
  if not public.is_dropke_admin() then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  if p_sell_price_kes <= 0 or p_low_stock_threshold < 0 then
    raise exception 'INVALID_SKU_SETTINGS' using errcode = '22023';
  end if;

  update public.gift_card_skus g
  set sell_price_kes = p_sell_price_kes,
      low_stock_threshold = p_low_stock_threshold,
      updated_at = now()
  where g.id = p_id
  returning g.sku into v_sku;

  if v_sku is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.audit_logs(actor_email, action, resource, details)
  values (v_email, 'sku.update', v_sku, jsonb_build_object(
    'sellPriceKes', p_sell_price_kes,
    'lowStockThreshold', p_low_stock_threshold
  ));

  return query
  select g.id, g.sku, g.sell_price_kes, g.low_stock_threshold
  from public.gift_card_skus g
  where g.id = p_id;
end;
$$;

create or replace function public.admin_create_encrypted_batch(
  p_sku_id uuid,
  p_supplier_name text,
  p_supplier_ref text,
  p_unit_cost_kes numeric,
  p_codes jsonb
)
returns table(batch_ref text, quantity integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_batch_id uuid;
  v_batch_ref text;
  v_quantity integer;
  v_code jsonb;
  v_sku text;
begin
  if not public.is_dropke_admin() then
    raise exception 'ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  if nullif(trim(p_supplier_name), '') is null then
    raise exception 'SUPPLIER_REQUIRED' using errcode = '22023';
  end if;
  if p_unit_cost_kes is null or p_unit_cost_kes < 0 then
    raise exception 'INVALID_UNIT_COST' using errcode = '22023';
  end if;
  if jsonb_typeof(p_codes) <> 'array' then
    raise exception 'INVALID_CODES' using errcode = '22023';
  end if;

  v_quantity := jsonb_array_length(p_codes);
  if v_quantity < 1 or v_quantity > 500 then
    raise exception 'INVALID_CODE_COUNT' using errcode = '22023';
  end if;

  select g.sku into v_sku from public.gift_card_skus g where g.id = p_sku_id and g.active = true;
  if v_sku is null then
    raise exception 'SKU_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_batch_ref := 'BAT-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
  insert into public.supplier_batches(batch_ref, sku_id, supplier_name, supplier_ref, unit_cost_kes, quantity, created_by)
  values (v_batch_ref, p_sku_id, trim(p_supplier_name), nullif(trim(coalesce(p_supplier_ref, '')), ''), p_unit_cost_kes, v_quantity, v_email)
  returning id into v_batch_id;

  for v_code in select value from jsonb_array_elements(p_codes)
  loop
    if coalesce(v_code->>'fingerprint','') = '' or coalesce(v_code->>'ciphertext','') = '' or
       coalesce(v_code->>'iv','') = '' or coalesce(v_code->>'tag','') = '' or coalesce(v_code->>'hint','') = '' then
      raise exception 'INVALID_ENCRYPTED_CODE' using errcode = '22023';
    end if;
    insert into public.inventory_codes(sku_id, batch_id, fingerprint, ciphertext, iv, tag, hint)
    values (p_sku_id, v_batch_id, v_code->>'fingerprint', v_code->>'ciphertext', v_code->>'iv', v_code->>'tag', v_code->>'hint');
  end loop;

  insert into public.audit_logs(actor_email, action, resource, details)
  values (v_email, 'batch.create', v_batch_ref, jsonb_build_object(
    'sku', v_sku,
    'quantity', v_quantity,
    'supplier', trim(p_supplier_name)
  ));

  return query select v_batch_ref, v_quantity;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'admin_inventory()',
    'admin_summary()',
    'admin_batches(integer)',
    'admin_orders(integer)',
    'admin_audit(integer)',
    'admin_update_sku(uuid,integer,integer)',
    'admin_create_encrypted_batch(uuid,text,text,numeric,jsonb)'
  ]
  loop
    execute 'revoke all on function public.' || fn || ' from public, anon';
    execute 'grant execute on function public.' || fn || ' to authenticated';
  end loop;
end $$;
