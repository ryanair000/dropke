# Deployment

## 1. Supabase

DROPKE uses timestamped migrations under `supabase/migrations/`. The migration filenames mirror the production Supabase migration ledger. Apply them in timestamp order with the Supabase CLI or your normal migration workflow. Do not run only the first migration and do not rename migrations that have already reached production.

The Production V2 schema separates:

- Fortnite products and current regional store prices
- platform/account-region availability
- wallet currency and denomination SKUs
- supplier/inventory records
- staged pricing-feed imports
- orders, payments and encrypted fulfilment inventory

Configure Supabase email authentication after the schema is in place. The admin UI uses passwordless email sign-in.

## 2. Vercel

Import the GitHub repository as a Next.js project and add the environment variables from `.env.example`.

Keep both production switches locked while the store is being commissioned:

```text
NEXT_PUBLIC_CHECKOUT_ENABLED=false
PAYSTACK_LIVE_ENABLED=false
```

The public site should remain `noindex, nofollow` until the permanent domain, policies, payment flow and real inventory have all passed launch QA.

## 3. Catalog and pricing

Commercial pricing is database-backed. `products`, `product_prices` and `platform_region_settings` are the source of truth used by the quote engine. Source-code product metadata is display fallback only.

Pricing feeds are staged in `pricing_feed_imports` and `pricing_feed_rows`. Feed rows are observations and should not be committed as schema migrations. Review platform, region, currency, availability and price changes before treating a feed as current commercial data.

Nintendo and PC must remain disabled until their pricing and inventory routes are verified. Brazil can exist in the database model without being publicly enabled.

## 4. Inventory

Before loading valuable redeemable codes:

1. Configure a strong server-only `INVENTORY_ENCRYPTION_KEY`.
2. Verify the inventory-vault encryption path using dummy codes.
3. Confirm supplier provenance and regional compatibility.
4. Set the correct KSh sell price and low-stock threshold for each enabled wallet SKU.

Real code values are encrypted before database storage and must never be committed to GitHub.

## 5. Paystack test mode

Add a Paystack `sk_test_...` secret and configure the test webhook as:

```text
https://YOUR-DOMAIN/api/paystack/webhook
```

Before live mode, test at minimum:

- successful payment and delivery
- M-Pesa/card availability on the actual merchant account
- repeated callbacks/webhooks
- wrong amount/currency/reference
- abandoned and expired checkout
- inventory exhaustion
- payment success with fulfilment failure
- retry without duplicate code delivery

## 6. Production launch gate

Before switching to live Paystack credentials:

- reconcile GitHub migrations with production Supabase
- clear or explicitly accept Supabase Security Advisor findings
- connect the permanent domain
- configure Supabase Auth redirects and production SMTP
- publish Terms, Privacy, Digital Delivery, Refund/Wrong-Region and Contact pages
- load verified legitimate inventory
- verify every publicly enabled platform/region combination
- test backup restore
- enable monitoring for paid-but-undelivered orders
- run a small live-money pilot

Only after the pilot passes should `NEXT_PUBLIC_CHECKOUT_ENABLED` and `PAYSTACK_LIVE_ENABLED` be enabled for normal sales.
