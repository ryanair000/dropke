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
- Prepared server-only admin authorization and the final service-role RPC cutover migration.
- Restored CI configuration, although GitHub-hosted runners are currently failing before runner assignment on this repository.

## Intentionally not activated yet

- Final admin service-role database cutover
- Real inventory encryption key
- Real redeemable inventory
- Checkout
- Paystack live mode
- SEO indexing

These remain gated until the matching deployment secrets and preview checks are complete.
