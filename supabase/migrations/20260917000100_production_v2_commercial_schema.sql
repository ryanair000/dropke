-- DROPKE Production V2 commercial model.
-- Keeps encrypted inventory tables intact while moving product/region pricing
-- and support configuration into Postgres.

alter table public.gift_card_skus
  drop constraint if exists gift_card_skus_region_code_check;

alter table public.gift_card_skus
  add constraint gift_card_skus_region_code_check
  check (region_code in ('US','UK','ZA','AE','IN','BR'));

create unique index if not exists gift_card_skus_identity_idx
  on public.gift_card_skus(platform, region_code, currency, denomination);

create table if not exists public.products (
  id text primary key,
  name text not null,
  short_name text not null,
  description text not null,
  kind text not null check (kind in ('vbucks','crew','pack','custom')),
  vbucks_amount integer,
  active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_region_settings (
  platform text not null check (platform in ('PlayStation','Xbox','Nintendo','PC')),
  region_code text not null check (region_code in ('US','UK','ZA','AE','IN','BR')),
  region_name text not null,
  store_currency text not null,
  wallet_currency text not null,
  public_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (platform, region_code)
);

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  platform text not null check (platform in ('PlayStation','Xbox','Nintendo','PC')),
  region_code text not null check (region_code in ('US','UK','ZA','AE','IN','BR')),
  store_currency text not null,
  store_price numeric(12,2) not null check (store_price > 0),
  source_name text not null,
  source_url text,
  fetched_at timestamptz not null,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists product_prices_one_current_idx
  on public.product_prices(product_id, platform, region_code)
  where is_current = true;

create index if not exists product_prices_lookup_idx
  on public.product_prices(platform, region_code, product_id, is_current);

create table if not exists public.pricing_feed_imports (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_file_name text not null,
  fetched_at timestamptz not null,
  fetched_timezone text,
  row_count integer not null check (row_count >= 0),
  status text not null default 'staged'
    check (status in ('staged','applied','rejected')),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_feed_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.pricing_feed_imports(id) on delete cascade,
  product_id text references public.products(id),
  vbucks_amount integer,
  product_name text not null,
  platform_raw text not null,
  platform text not null check (platform in ('PlayStation','Xbox','Nintendo','PC')),
  region_code text not null check (region_code in ('US','UK','ZA','AE','IN','BR')),
  region_name text not null,
  available boolean not null,
  store_currency text not null,
  store_price numeric(12,2) not null check (store_price > 0),
  source_route_price_kes integer,
  required_gift_cards text,
  covered_amount numeric(12,2),
  extra_balance numeric(12,2),
  is_lowest_kes_option boolean not null default false,
  unavailable_reason text,
  pricing_basis text,
  source_url text,
  fetched_at timestamptz not null,
  fetched_timezone text,
  created_at timestamptz not null default now(),
  unique(import_id, product_id, platform, region_code)
);

create index if not exists pricing_feed_rows_lookup_idx
  on public.pricing_feed_rows(import_id, platform, region_code, product_id);

insert into public.products
  (id, name, short_name, description, kind, vbucks_amount, active, sort_order)
values
  ('vb800', '800 V-Bucks', '800', 'A quick Fortnite top-up.', 'vbucks', 800, true, 10),
  ('vb2400', '2,400 V-Bucks', '2,400', 'The most popular DROPKE top-up.', 'vbucks', 2400, true, 20),
  ('vb4500', '4,500 V-Bucks', '4,500', 'More room for bundles and cosmetics.', 'vbucks', 4500, true, 30),
  ('vb12500', '12,500 V-Bucks', '12,500', 'Large Fortnite wallet top-up.', 'vbucks', 12500, true, 40),
  ('crew', 'Fortnite Crew', 'Crew', 'Credit matched for your monthly Fortnite Crew subscription.', 'crew', null, false, 50),
  ('pack1', 'Featured Fortnite Pack', 'Featured Pack', 'Credit matched to a featured Fortnite pack.', 'pack', null, false, 60),
  ('pack2', 'Fortnite Quest Pack', 'Quest Pack', 'Credit matched to a quest or challenge pack.', 'pack', null, false, 70),
  ('pack3', 'Fortnite Bundle', 'Bundle', 'Credit matched to a larger Fortnite bundle.', 'pack', null, false, 80),
  ('custom', 'Other Fortnite Purchase', 'Other purchase', 'Enter the store price and DROPKE will match the wallet credit.', 'custom', null, true, 90)
on conflict (id) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  kind = excluded.kind,
  vbucks_amount = excluded.vbucks_amount,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.platform_region_settings
  (platform, region_code, region_name, store_currency, wallet_currency, public_enabled)
values
  ('PlayStation','US','USA','USD','USD',true),
  ('PlayStation','UK','United Kingdom','GBP','GBP',true),
  ('PlayStation','ZA','South Africa','ZAR','ZAR',true),
  ('PlayStation','AE','UAE','USD','USD',true),
  ('PlayStation','IN','India','INR','INR',true),
  ('PlayStation','BR','Brazil','BRL','BRL',false),
  ('Xbox','US','USA','USD','USD',true),
  ('Xbox','UK','United Kingdom','GBP','GBP',true),
  ('Xbox','ZA','South Africa','ZAR','ZAR',false),
  ('Xbox','AE','UAE','USD','USD',false),
  ('Xbox','IN','India','INR','INR',false),
  ('Xbox','BR','Brazil','BRL','BRL',false),
  ('Nintendo','US','USA','USD','USD',false),
  ('Nintendo','UK','United Kingdom','GBP','GBP',false),
  ('Nintendo','ZA','South Africa','ZAR','ZAR',false),
  ('Nintendo','AE','UAE','USD','USD',false),
  ('Nintendo','IN','India','INR','INR',false),
  ('Nintendo','BR','Brazil','BRL','BRL',false),
  ('PC','US','USA','USD','USD',false),
  ('PC','UK','United Kingdom','GBP','GBP',false),
  ('PC','ZA','South Africa','ZAR','ZAR',false),
  ('PC','AE','UAE','USD','USD',false),
  ('PC','IN','India','INR','INR',false),
  ('PC','BR','Brazil','BRL','BRL',false)
on conflict (platform, region_code) do update set
  region_name = excluded.region_name,
  store_currency = excluded.store_currency,
  wallet_currency = excluded.wallet_currency,
  public_enabled = excluded.public_enabled,
  updated_at = now();

alter table public.products enable row level security;
alter table public.platform_region_settings enable row level security;
alter table public.product_prices enable row level security;
alter table public.pricing_feed_imports enable row level security;
alter table public.pricing_feed_rows enable row level security;

revoke all on table public.products from anon, authenticated;
revoke all on table public.platform_region_settings from anon, authenticated;
revoke all on table public.product_prices from anon, authenticated;
revoke all on table public.pricing_feed_imports from anon, authenticated;
revoke all on table public.pricing_feed_rows from anon, authenticated;

create policy "deny direct client access" on public.products
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.platform_region_settings
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.product_prices
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.pricing_feed_imports
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.pricing_feed_rows
  as restrictive for all to anon, authenticated using (false) with check (false);

grant select, insert, update, delete on public.products to service_role;
grant select, insert, update, delete on public.platform_region_settings to service_role;
grant select, insert, update, delete on public.product_prices to service_role;
grant select, insert, update, delete on public.pricing_feed_imports to service_role;
grant select, insert, update, delete on public.pricing_feed_rows to service_role;

comment on table public.product_prices is
  'Current and historical Fortnite store pricing by product, platform and account region.';
comment on table public.platform_region_settings is
  'Separates account/store region from store currency and wallet currency. public_enabled controls storefront exposure.';
comment on table public.pricing_feed_rows is
  'Staged external pricing observations. source_route_price_kes is reference routing data, not DROPKE owned-inventory selling price.';
