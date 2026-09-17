-- Keep the database source of truth explicit for wallet/store currency routing.
-- Existing quote execution is server-side. This migration documents the supported
-- currency relationship and adds no browser privileges.
comment on table public.platform_region_settings is
  'Separates account/store region from store currency and wallet currency. Public quote routing currently requires store_currency = wallet_currency; FX routes must be explicitly configured in application pricing logic.';
