-- Immutable quote snapshots, transactional reservation and durable payment state.

alter table public.orders
  add column if not exists quote_id uuid,
  add column if not exists delivery_token_hash text;

create unique index if not exists orders_payment_reference_unique_idx
  on public.orders(payment_reference)
  where payment_reference is not null;

create table if not exists public.checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id),
  product_name text not null,
  platform text not null,
  region_code text not null,
  region_name text not null,
  currency text not null,
  wallet_currency text not null,
  store_price numeric(12,2) not null check (store_price > 0),
  matched_credit numeric(12,2) not null check (matched_credit > 0),
  balance_remaining numeric(12,2) not null check (balance_remaining >= 0),
  kes_price integer not null check (kes_price > 0),
  credit_label text not null,
  card_breakdown jsonb not null check (jsonb_typeof(card_breakdown) = 'array'),
  sku_selections jsonb not null check (jsonb_typeof(sku_selections) = 'array'),
  status text not null default 'active' check (status in ('active','consumed','expired')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  order_ref text references public.orders(ref),
  created_at timestamptz not null default now()
);

alter table public.orders
  drop constraint if exists orders_quote_id_fkey;
alter table public.orders
  add constraint orders_quote_id_fkey foreign key (quote_id)
  references public.checkout_quotes(id);

create index if not exists checkout_quotes_expiry_idx
  on public.checkout_quotes(status, expires_at);

-- A public setup must have at least one SKU in the configured wallet currency.
-- This safely disables the legacy UAE/USD mismatch until matching inventory is
-- intentionally created and verified.
update public.platform_region_settings s
set public_enabled = false, updated_at = now()
where s.public_enabled = true
  and not exists (
    select 1
    from public.gift_card_skus g
    where g.platform = s.platform
      and g.region_code = s.region_code
      and g.currency = s.wallet_currency
      and g.active = true
  );

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_ref text not null references public.orders(ref) on delete cascade,
  provider text not null default 'paystack',
  provider_reference text not null unique,
  amount integer not null check (amount > 0),
  currency text not null,
  status text not null default 'initializing'
    check (status in ('initializing','initialized','success','failed')),
  access_code text,
  authorization_url text,
  last_error text,
  initialized_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_ref, provider)
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack',
  provider_event_key text not null,
  order_ref text references public.orders(ref),
  event_type text not null,
  provider_status text,
  amount integer,
  currency text,
  processing_status text not null default 'received'
    check (processing_status in ('received','processed','ignored','failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, provider_event_key)
);

create index if not exists payment_events_order_ref_idx
  on public.payment_events(order_ref, received_at desc);
create index if not exists payment_attempts_status_idx
  on public.payment_attempts(status, updated_at);

create table if not exists public.fulfilment_jobs (
  order_ref text primary key references public.orders(ref) on delete cascade,
  status text not null default 'pending' check (status in ('pending','resolved','manual')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.api_rate_limits (
  key text primary key,
  bucket_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null
);

alter table public.checkout_quotes enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;
alter table public.fulfilment_jobs enable row level security;
alter table public.api_rate_limits enable row level security;

revoke all on table public.checkout_quotes from anon, authenticated;
revoke all on table public.payment_attempts from anon, authenticated;
revoke all on table public.payment_events from anon, authenticated;
revoke all on table public.fulfilment_jobs from anon, authenticated;
revoke all on table public.api_rate_limits from anon, authenticated;

create policy "deny direct client access" on public.checkout_quotes
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.payment_attempts
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.payment_events
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.fulfilment_jobs
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy "deny direct client access" on public.api_rate_limits
  as restrictive for all to anon, authenticated using (false) with check (false);

grant select, insert, update, delete on public.checkout_quotes to service_role;
grant select, insert, update, delete on public.payment_attempts to service_role;
grant select, insert, update, delete on public.payment_events to service_role;
grant select, insert, update, delete on public.fulfilment_jobs to service_role;
grant select, insert, update, delete on public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVER_ONLY' using errcode = '42501';
  end if;

  if nullif(trim(p_key), '') is null or p_window_seconds < 1 or p_limit < 1 then
    raise exception 'INVALID_RATE_LIMIT' using errcode = '22023';
  end if;

  insert into public.api_rate_limits(key, bucket_started_at, request_count, expires_at)
  values (p_key, v_now, 0, v_now + make_interval(secs => p_window_seconds))
  on conflict (key) do nothing;

  update public.api_rate_limits
  set bucket_started_at = case when expires_at <= v_now then v_now else bucket_started_at end,
      request_count = case when expires_at <= v_now then 1 else request_count + 1 end,
      expires_at = case when expires_at <= v_now then v_now + make_interval(secs => p_window_seconds) else expires_at end
  where key = p_key
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;

create or replace function public.release_expired_inventory()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  update public.inventory_codes
  set status = 'available', order_ref = null, reserved_at = null,
      reservation_expires_at = null
  where status = 'reserved' and reservation_expires_at < now();
  get diagnostics v_changed = row_count;

  update public.orders
  set status = 'cancelled'
  where status = 'awaiting_payment'
    and payment_status = 'pending'
    and reservation_expires_at < now();

  update public.checkout_quotes
  set status = 'expired'
  where status = 'active' and expires_at < now();

  delete from public.api_rate_limits where expires_at < now() - interval '1 day';
  return v_changed;
end;
$$;

create or replace function public.create_order_from_quote(
  p_quote_id uuid,
  p_order_ref text,
  p_email text,
  p_phone text,
  p_delivery_token_hash text,
  p_reservation_expires_at timestamptz
)
returns table(order_ref text, reservation_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.checkout_quotes%rowtype;
  v_selection jsonb;
  v_sku_id uuid;
  v_code_id uuid;
  v_position integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVER_ONLY' using errcode = '42501';
  end if;

  if p_reservation_expires_at <= now()
     or p_reservation_expires_at > now() + interval '30 minutes' then
    raise exception 'INVALID_RESERVATION_EXPIRY' using errcode = '22023';
  end if;

  select * into v_quote
  from public.checkout_quotes q
  where q.id = p_quote_id
  for update;

  if not found or v_quote.status <> 'active' or v_quote.expires_at <= now() then
    raise exception 'QUOTE_EXPIRED' using errcode = 'P0002';
  end if;

  if jsonb_array_length(v_quote.sku_selections) < 1 then
    raise exception 'OUT_OF_STOCK' using errcode = 'P0002';
  end if;

  insert into public.orders(
    ref, quote_id, status, payment_status, payment_provider,
    product_id, product_name, platform, region_code, region_name, currency,
    store_price, matched_credit, balance_remaining, kes_price,
    email, phone, delivery_token_hash, reservation_expires_at
  ) values (
    p_order_ref, p_quote_id, 'awaiting_payment', 'pending', 'paystack',
    v_quote.product_id, v_quote.product_name, v_quote.platform,
    v_quote.region_code, v_quote.region_name, v_quote.currency,
    v_quote.store_price, v_quote.matched_credit, v_quote.balance_remaining,
    v_quote.kes_price, lower(trim(p_email)), trim(p_phone),
    p_delivery_token_hash, p_reservation_expires_at
  );

  for v_selection in
    select value from jsonb_array_elements(v_quote.sku_selections)
  loop
    v_position := v_position + 1;
    v_sku_id := (v_selection->>'skuId')::uuid;
    v_code_id := null;

    select c.id into v_code_id
    from public.inventory_codes c
    where c.sku_id = v_sku_id and c.status = 'available'
    order by c.created_at
    for update skip locked
    limit 1;

    if v_code_id is null then
      raise exception 'OUT_OF_STOCK' using errcode = 'P0002';
    end if;

    update public.inventory_codes
    set status = 'reserved', order_ref = p_order_ref, reserved_at = now(),
        reservation_expires_at = p_reservation_expires_at
    where id = v_code_id;

    insert into public.order_items(order_ref, sku_id, denomination, position)
    values (
      p_order_ref,
      v_sku_id,
      (v_selection->>'denomination')::numeric,
      v_position
    );
  end loop;

  update public.checkout_quotes
  set status = 'consumed', consumed_at = now(), order_ref = p_order_ref
  where id = p_quote_id;

  return query select p_order_ref, p_reservation_expires_at;
end;
$$;

create or replace function public.finalize_paid_order(
  p_order_ref text,
  p_payment_reference text
)
returns table(order_status public.order_status, delivered_count integer, expected_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_code_id uuid;
  v_code_ids uuid[] := array[]::uuid[];
  v_expected integer := 0;
  v_delivered integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVER_ONLY' using errcode = '42501';
  end if;

  select * into v_order
  from public.orders o
  where o.ref = p_order_ref
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if nullif(trim(p_payment_reference), '') is null
     or (v_order.payment_reference is not null and v_order.payment_reference <> p_payment_reference) then
    raise exception 'PAYMENT_REFERENCE_MISMATCH' using errcode = '22023';
  end if;

  update public.orders
  set status = case when status = 'delivered' then status else 'paid_pending_fulfilment' end,
      payment_status = 'success',
      payment_reference = coalesce(payment_reference, p_payment_reference),
      paid_at = coalesce(paid_at, now())
  where ref = p_order_ref;

  select count(*)::integer into v_expected
  from public.order_items i
  where i.order_ref = p_order_ref;

  if v_expected < 1 then
    insert into public.fulfilment_jobs(order_ref, status, attempts, last_error, next_attempt_at)
    values (p_order_ref, 'manual', 1, 'ORDER_ITEMS_MISSING', now())
    on conflict (order_ref) do update
      set status = 'manual', attempts = public.fulfilment_jobs.attempts + 1,
          last_error = excluded.last_error, updated_at = now();
    return query select 'paid_pending_fulfilment'::public.order_status, 0, v_expected;
    return;
  end if;

  for v_item in
    select i.sku_id, i.position
    from public.order_items i
    where i.order_ref = p_order_ref
    order by i.position
  loop
    v_code_id := null;
    select c.id into v_code_id
    from public.inventory_codes c
    where c.sku_id = v_item.sku_id
      and not (c.id = any(v_code_ids))
      and (
        (c.status = 'sold' and c.order_ref = p_order_ref)
        or (c.status = 'reserved' and c.order_ref = p_order_ref)
        or c.status = 'available'
      )
    order by
      case c.status when 'sold' then 0 when 'reserved' then 1 else 2 end,
      c.created_at
    for update skip locked
    limit 1;

    if v_code_id is null then
      insert into public.fulfilment_jobs(order_ref, status, attempts, last_error, next_attempt_at)
      values (p_order_ref, 'pending', 1, 'MATCHED_INVENTORY_UNAVAILABLE', now() + interval '5 minutes')
      on conflict (order_ref) do update
        set status = 'pending', attempts = public.fulfilment_jobs.attempts + 1,
            last_error = excluded.last_error, next_attempt_at = excluded.next_attempt_at,
            updated_at = now();
      return query select 'paid_pending_fulfilment'::public.order_status, 0, v_expected;
      return;
    end if;

    v_code_ids := array_append(v_code_ids, v_code_id);
  end loop;

  update public.inventory_codes
  set status = 'sold', order_ref = p_order_ref, sold_at = coalesce(sold_at, now()),
      reserved_at = null, reservation_expires_at = null
  where id = any(v_code_ids);

  get diagnostics v_delivered = row_count;

  update public.inventory_codes
  set status = 'available', order_ref = null, reserved_at = null, reservation_expires_at = null
  where status = 'reserved' and order_ref = p_order_ref and not (id = any(v_code_ids));

  update public.orders
  set status = 'delivered', payment_status = 'success',
      delivered_at = coalesce(delivered_at, now())
  where ref = p_order_ref;

  insert into public.fulfilment_jobs(order_ref, status, attempts, resolved_at, updated_at)
  values (p_order_ref, 'resolved', 1, now(), now())
  on conflict (order_ref) do update
    set status = 'resolved', resolved_at = now(), updated_at = now(), last_error = null;

  return query select 'delivered'::public.order_status, v_delivered, v_expected;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.release_expired_inventory() from public, anon, authenticated;
revoke all on function public.create_order_from_quote(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.finalize_paid_order(text, text) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;
grant execute on function public.release_expired_inventory() to service_role;
grant execute on function public.create_order_from_quote(uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.finalize_paid_order(text, text) to service_role;

comment on table public.checkout_quotes is
  'Immutable, expiring server-generated quote snapshots consumed exactly once during transactional order creation.';
comment on table public.payment_events is
  'Idempotent Paystack event ledger containing operational payment fields without raw card payloads.';
comment on table public.fulfilment_jobs is
  'Recovery queue for verified payments that could not be delivered immediately.';
