-- Prepare the encrypted inventory vault for key rotation before real stock is loaded.
alter table public.inventory_codes
  add column if not exists key_version integer not null default 1
  check (key_version > 0);

-- A redeemable code fingerprint should never be reused across different SKUs.
-- The vault is currently empty, so establishing global uniqueness is safe.
create unique index if not exists inventory_codes_fingerprint_unique_idx
  on public.inventory_codes(fingerprint);

comment on column public.inventory_codes.key_version is
  'Encryption-key version used for this ciphertext. Version 1 can use the legacy INVENTORY_ENCRYPTION_KEY fallback; newer versions use versioned deployment secrets.';
