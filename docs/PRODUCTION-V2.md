# DROPKE Production V2

Production V2 turns DROPKE from a static Fortnite pricing prototype into a database-driven wallet-credit routing and fulfilment system.

## Current foundation

- Supabase migration history is timestamped and aligned with the production ledger.
- Products, platform/region settings and current product prices live in Postgres.
- Brazil exists as a disabled capability.
- Nintendo and PC remain disabled until verified supply exists.
- UAE store/wallet currency is modeled explicitly rather than inferred from physical country.
- Quote routing reads stock only on the server and chooses the lowest KSh in-stock route, then lowest overage, then fewest cards.
- Checkout remains disabled.

## Production gates

### Gate 1: Commercial model

- [x] Database-backed products and regional prices
- [x] Platform/region availability matrix
- [x] Staged pricing-feed tables
- [x] Server-side wallet routing foundation
- [ ] Admin pricing-feed preview and approval workflow
- [ ] Verified wallet SKU inventory for every enabled platform/region

### Gate 2: Security and inventory

- [x] Public quote stock RPC removed from browser roles
- [x] Server-side admin authorization code prepared
- [ ] Deploy server-side admin code with `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Apply final admin service-boundary migration
- [ ] Security Advisor returns no unintended SECURITY DEFINER exposure
- [ ] Add encryption key versioning and separate fingerprint-key derivation
- [ ] Load dummy encrypted inventory and verify round-trip delivery

### Gate 3: Orders and payments

- [ ] Quote IDs and expiry
- [ ] Reject payment initialization for expired reservations
- [ ] Payment attempts/events ledger
- [ ] Idempotent webhook processing
- [ ] Retryable webhook failures return non-2xx
- [ ] Paid-but-not-delivered recovery queue
- [ ] Paystack test-mode M-Pesa/card end-to-end tests

### Gate 4: Launch operations

- [ ] Order timeline and support actions
- [ ] Transactional email
- [ ] Terms, Privacy, Digital Delivery, Refund/Wrong-Region and Contact pages
- [ ] Rate limiting and POST-based order tracking
- [ ] Monitoring and paid-not-delivered alerts
- [ ] Backup restore test
- [ ] Custom production domain
- [ ] Small live-money pilot
- [ ] Remove `noindex` only after launch approval

## Important cutover rule

Do not apply `20260916225300_production_v2_admin_service_boundary.sql` to the live Supabase project until the matching Next.js admin code is deployed with a working `SUPABASE_SERVICE_ROLE_KEY`. Applying the database cutover first would intentionally remove direct authenticated RPC execution and break the old admin runtime.
