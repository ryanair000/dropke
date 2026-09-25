# DROPKE

**Top up. Drop in.**

DROPKE is a Kenya-first Fortnite wallet-credit storefront. Customers choose the Fortnite purchase they want, select their gaming platform and account region, receive a server-generated wallet-credit route, pay in KSh, and redeem the delivered credit on their own account.

This repository is the canonical source for the storefront, commercial catalog, quote engine, secure inventory vault, admin operations, order tracking and Paystack integration.

## Production V2 model

DROPKE no longer treats gift-card denominations or Fortnite prices as hard-coded regional constants.

The production flow is:

```text
Fortnite product
  -> platform + account region
  -> current regional store price
  -> enabled wallet SKUs and live owned inventory
  -> lowest permitted KSh route
  -> immutable checkout quote
  -> transactional order reservation
  -> Paystack
  -> verified payment event
  -> fulfilment
```

Commercial configuration is database-backed:

- `products` stores Fortnite product definitions.
- `product_prices` stores current/historical Fortnite store prices by product, platform and region.
- `platform_region_settings` controls public setup availability and separates store currency from wallet currency.
- `gift_card_skus` stores wallet-credit denomination SKUs and DROPKE KSh sell prices.
- `pricing_feed_imports` and `pricing_feed_rows` stage external pricing observations.
- `supplier_batches` and `inventory_codes` hold DROPKE-owned inventory and provenance.
- `checkout_quotes` freezes the customer-visible route and KSh amount for checkout.
- `payment_attempts`, `payment_events` and `fulfilment_jobs` provide payment idempotency and recovery state.

## Product rules

- Fortnite-first storefront, not a generic gift-card marketplace.
- PlayStation and Xbox are enabled only where verified routes exist.
- Nintendo and PC remain disabled until pricing and inventory routes are verified.
- Brazil is supported by the data model but can remain hidden until intentionally enabled.
- Customer passwords are never requested.
- Codes are region-bound and the customer must confirm the account region before checkout.
- Guest checkout is supported.
- Paystack is the payment gateway. M-Pesa/mobile money and cards are exposed only when enabled and verified for the merchant account.
- Real redeemable codes are encrypted at rest and never returned by admin list APIs.

## Stack

- Next.js + TypeScript
- Supabase Postgres + Auth
- Paystack
- Vercel
- AES-256-GCM inventory encryption

## Quick start

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project.
3. Apply every timestamped migration under `supabase/migrations/` in order.
4. Add the Supabase URL, publishable key and server-only service-role key.
5. Generate a long random `INVENTORY_ENCRYPTION_KEY` and keep it only in deployment secrets.
6. Install dependencies with `npm install`.
7. Run `npm run build` and start locally with `npm run dev`.
8. Open `/admin` and sign in using an allowlisted admin email.

The initial database admin allowlist contains the current owner account. Create that user in Supabase Auth before requesting a magic link. Authorization is enforced server-side and in the database, not by merely hiding the admin page.

## Payment status

Checkout is intentionally **off by default**. No order can reserve stock until `NEXT_PUBLIC_CHECKOUT_ENABLED=true` is enabled. A live Paystack key is additionally blocked unless `PAYSTACK_LIVE_ENABLED=true` is enabled server-side.

Start with Paystack test mode. Verify initialization, amount/currency/reference checks, webhooks, duplicate callbacks, reservation expiry and fulfilment recovery before any live-money pilot.

## Pricing feeds

Pricing-feed uploads are operational observations, not schema. They are staged in Supabase for review and should not be committed to GitHub as migrations.

The current Production V2 foundation includes a database-backed catalog and a routing engine that prefers the lowest KSh in-stock wallet route, then lower overage, then fewer cards.

## Build

```bash
npm install
npm run check
```

CI is present in `.github/workflows/ci.yml`. GitHub's hosted runner has recently failed before assigning a runner (`runner_id: 0`), so a red run with zero steps is infrastructure-level rather than evidence that the DROPKE build failed.

## Important

Never commit `.env.local`, Paystack keys, Supabase service-role keys, inventory encryption keys, raw redeemable codes or supplier inventory exports. See `docs/SECURITY.md`, `docs/ARCHITECTURE.md` and `docs/DEPLOYMENT.md` before loading real inventory or enabling checkout.
