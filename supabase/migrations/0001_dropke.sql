create extension if not exists pgcrypto;

do $$ begin
  create type inventory_status as enum ('available', 'reserved', 'sold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('awaiting_payment', 'paid_pending_fulfilment', 'delivered', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'success', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists gift_card_skus (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  platform text not null check (platform in ('PlayStation','Xbox','Nintendo','PC')),
  region_code text not null check (region_code in ('US','UK','ZA','AE','IN')),
  region_name text not null,
  currency text not null,
  denomination numeric(12,2) not null check (denomination > 0),
  sell_price_kes integer not null check (sell_price_kes > 0),
  low_stock_threshold integer not null default 2 check (low_stock_threshold >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists supplier_batches (
  id uuid primary key default gen_random_uuid(),
  batch_ref text unique not null,
  sku_id uuid not null references gift_card_skus(id),
  supplier_name text not null,
  supplier_ref text,
  unit_cost_kes numeric(12,2) not null check (unit_cost_kes >= 0),
  quantity integer not null check (quantity > 0),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  ref text primary key,
  status order_status not null default 'awaiting_payment',
  payment_status payment_status not null default 'pending',
  payment_provider text not null default 'paystack',
  payment_reference text,
  product_id text not null,
  product_name text not null,
  platform text not null,
  region_code text not null,
  region_name text not null,
  currency text not null,
  store_price numeric(12,2) not null,
  matched_credit numeric(12,2) not null,
  balance_remaining numeric(12,2) not null,
  kes_price integer not null,
  email text not null,
  phone text not null,
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  delivered_at timestamptz
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null references orders(ref) on delete cascade,
  sku_id uuid not null references gift_card_skus(id),
  denomination numeric(12,2) not null,
  position integer not null,
  unique(order_ref, position)
);

create table if not exists inventory_codes (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references gift_card_skus(id),
  batch_id uuid references supplier_batches(id),
  fingerprint text not null,
  ciphertext text not null,
  iv text not null,
  tag text not null,
  hint text not null,
  status inventory_status not null default 'available',
  order_ref text,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  unique(sku_id, fingerprint)
);

create index if not exists inventory_codes_available_idx on inventory_codes(sku_id, status);
create index if not exists inventory_codes_order_ref_idx on inventory_codes(order_ref);
create index if not exists orders_contact_idx on orders(ref, email, phone);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  resource text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace view sku_stock as
select
  s.*,
  count(c.id) filter (where c.status = 'available')::int as available_count,
  count(c.id) filter (where c.status = 'reserved')::int as reserved_count,
  count(c.id) filter (where c.status = 'sold')::int as sold_count
from gift_card_skus s
left join inventory_codes c on c.sku_id = s.id
group by s.id;

create or replace function release_expired_inventory()
returns integer
language plpgsql
security definer
as $$
declare changed integer;
begin
  update inventory_codes
  set status = 'available', order_ref = null, reserved_at = null, reservation_expires_at = null
  where status = 'reserved' and reservation_expires_at < now();
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function reserve_inventory(p_order_ref text, p_sku_ids uuid[], p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
as $$
declare wanted uuid; chosen uuid;
begin
  perform release_expired_inventory();
  foreach wanted in array p_sku_ids loop
    select id into chosen
    from inventory_codes
    where sku_id = wanted and status = 'available'
    order by created_at
    for update skip locked
    limit 1;
    if chosen is null then
      raise exception 'OUT_OF_STOCK';
    end if;
    update inventory_codes
    set status = 'reserved', order_ref = p_order_ref, reserved_at = now(), reservation_expires_at = p_expires_at
    where id = chosen;
  end loop;
  return true;
end;
$$;

create or replace function release_order_inventory(p_order_ref text)
returns integer
language plpgsql
security definer
as $$
declare changed integer;
begin
  update inventory_codes
  set status = 'available', order_ref = null, reserved_at = null, reservation_expires_at = null
  where status = 'reserved' and order_ref = p_order_ref;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function finalize_inventory(p_order_ref text)
returns table(id uuid, sku_id uuid, ciphertext text, iv text, tag text, hint text)
language plpgsql
security definer
as $$
begin
  return query
  update inventory_codes
  set status = 'sold', sold_at = now(), reserved_at = null, reservation_expires_at = null
  where status = 'reserved' and order_ref = p_order_ref
  returning inventory_codes.id, inventory_codes.sku_id, inventory_codes.ciphertext, inventory_codes.iv, inventory_codes.tag, inventory_codes.hint;
end;
$$;

revoke all on function release_expired_inventory() from public;
revoke all on function reserve_inventory(text, uuid[], timestamptz) from public;
revoke all on function release_order_inventory(text) from public;
revoke all on function finalize_inventory(text) from public;
grant execute on function release_expired_inventory() to service_role;
grant execute on function reserve_inventory(text, uuid[], timestamptz) to service_role;
grant execute on function release_order_inventory(text) to service_role;
grant execute on function finalize_inventory(text) to service_role;

alter table gift_card_skus enable row level security;
alter table supplier_batches enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table inventory_codes enable row level security;
alter table audit_logs enable row level security;

insert into gift_card_skus (sku, platform, region_code, region_name, currency, denomination, sell_price_kes)
values
  ('PS-ZA-100','PlayStation','ZA','South Africa','ZAR',100,700),
  ('PS-ZA-250','PlayStation','ZA','South Africa','ZAR',250,2100),
  ('PS-ZA-500','PlayStation','ZA','South Africa','ZAR',500,3900),
  ('PS-ZA-1000','PlayStation','ZA','South Africa','ZAR',1000,9800),
  ('XB-ZA-100','Xbox','ZA','South Africa','ZAR',100,700),
  ('XB-ZA-250','Xbox','ZA','South Africa','ZAR',250,2100),
  ('XB-ZA-500','Xbox','ZA','South Africa','ZAR',500,3900),
  ('XB-ZA-1000','Xbox','ZA','South Africa','ZAR',1000,9800),
  ('NS-ZA-100','Nintendo','ZA','South Africa','ZAR',100,700),
  ('NS-ZA-250','Nintendo','ZA','South Africa','ZAR',250,2100),
  ('NS-ZA-500','Nintendo','ZA','South Africa','ZAR',500,3900),
  ('NS-ZA-1000','Nintendo','ZA','South Africa','ZAR',1000,9800),
  ('PC-ZA-100','PC','ZA','South Africa','ZAR',100,700),
  ('PC-ZA-250','PC','ZA','South Africa','ZAR',250,2100),
  ('PC-ZA-500','PC','ZA','South Africa','ZAR',500,3900),
  ('PC-ZA-1000','PC','ZA','South Africa','ZAR',1000,9800)
on conflict (sku) do nothing;

-- Add US/UK/UAE/India SKUs through the admin/database once supplier denominations are verified.
