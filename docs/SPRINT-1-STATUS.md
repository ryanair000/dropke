# Sprint 1 status

## Completed

- Reconciled legacy numbered migrations into timestamped migrations aligned with the live Supabase ledger.
- Added Production V2 commercial schema for products, product prices, platform/region settings and staged pricing feeds.
- Loaded the first 48-row pricing feed into Supabase.
- Added Brazil as a disabled capability.
- Disabled unverified Nintendo/PC combinations and unsupported Xbox region combinations in the public availability matrix.
- Moved quote inventory reads behind the server boundary.
- Reworked the quote matcher to optimize in-stock KSh price first, then overage, then card count.
- Added explicit store-currency/wallet-currency modeling and a same-currency quote guard.
- Added inventory encryption key versioning and separate encryption/fingerprint key derivation in server code.
- Added the pricing-feed product foreign-key index to production Supabase.
- Blocked Paystack initialization for expired or already-processed reservations.
- Changed Paystack webhook failures to return retryable 5xx responses instead of silently acknowledging failures.
- Prepared server-only admin authorization and the final service-role RPC cutover migration.
- Restored CI configuration, although GitHub-hosted runners are currently failing before runner assignment on this repository.

## Intentionally not activated yet

- Final admin service-role database cutover
- Real inventory encryption secret in Vercel
- Real redeemable inventory
- Checkout
- Paystack live mode
- SEO indexing

These remain gated until the matching application deployment and deployment secrets are verified.
