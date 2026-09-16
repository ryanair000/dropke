# DROPKE

**Top up. Drop in.**

DROPKE is a Kenya-first Fortnite credit storefront. Customers choose the Fortnite purchase they want, select their gaming platform and account region, pay in KSh, receive the matched wallet credit, and redeem it on their own account.

This repository is the canonical source for the storefront, secure inventory vault, admin operations, order tracking and Paystack integration.

## Product rules

- Fortnite-first storefront, not a generic gift-card marketplace.
- Platforms: PlayStation, Xbox, Nintendo and PC/Epic.
- Account regions: USA, UK, South Africa, UAE and India where inventory is supported.
- Customer passwords are never requested.
- Codes are region-bound and the customer must confirm the account region before checkout.
- Guest checkout is supported.
- Paystack is the payment gateway. M-Pesa/mobile money and cards are exposed through Paystack when enabled.
- Real redeemable codes are encrypted at rest and never returned by admin APIs.

## Stack

- Next.js + TypeScript
- Supabase Postgres + Auth
- Paystack
- Vercel-compatible deployment
- AES-256-GCM inventory encryption

## Quick start

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and run `supabase/migrations/0001_dropke.sql`.
3. Add your Supabase URL, anon key and service-role key.
4. Generate a long random `INVENTORY_ENCRYPTION_KEY` and keep it only in your deployment secrets.
5. Install dependencies with `npm install`.
6. Start locally with `npm run dev`.
7. Open `/admin` and sign in using an allowlisted admin email.

The initial admin allowlist contains `nitradefc24p@gmail.com`. Additional admin emails can be added through `DROPKE_ADMIN_EMAILS`.

## Payment status

Checkout is intentionally **off by default**. The Paystack integration is implemented, but no order can reserve stock until `NEXT_PUBLIC_CHECKOUT_ENABLED=true` is set. A live Paystack secret is additionally blocked until `PAYSTACK_LIVE_ENABLED=true` is set server-side.

Start with a Paystack test secret, test initialization, webhook verification and fulfilment end to end, then move to live only after the production domain, policies and real inventory are ready.

## Catalog warning

The regional Fortnite store prices and KSh SKU prices in the current seed are operational starting values carried from the DROPKE prototype. Verify every enabled platform, region, denomination and selling price against your legitimate inventory and the current platform store before production launch.

## Build

Run:

```bash
npm install
npm run build
```

See `docs/CI.md` for the current GitHub runner note.

## Important

Never commit `.env.local`, Paystack keys, Supabase service-role keys, inventory encryption keys, or raw inventory exports. See `docs/SECURITY.md` before loading real codes.
