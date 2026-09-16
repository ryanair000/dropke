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

The Paystack integration is implemented, but the site remains safe when no Paystack secret is configured. Add a **test** secret first, test initialization, webhook verification and fulfilment end to end, then add a live secret only when the production domain, policies and real inventory are ready.

## Important

Never commit `.env.local`, Paystack keys, Supabase service-role keys, inventory encryption keys, or raw inventory exports. See `docs/SECURITY.md` before loading real codes.
