# Deployment

## 1. Supabase

Create a Supabase project and run the SQL migration under `supabase/migrations/0001_dropke.sql`. Configure email authentication. The admin UI uses email magic-link sign-in.

## 2. Vercel

Import this repository into Vercel and add the environment variables from `.env.example`. Keep `NEXT_PUBLIC_CHECKOUT_ENABLED=false` until end-to-end payment testing is complete.

## 3. Inventory

Sign in at `/admin` with `nitradefc24p@gmail.com`. Create encrypted supplier batches for the required SKU. Real codes are encrypted before database storage.

## 4. Paystack test mode

Add a Paystack `sk_test_...` secret. Configure the webhook URL as:

`https://YOUR-DOMAIN/api/paystack/webhook`

Test mobile money/card checkout, repeated callbacks, wrong amounts, abandoned checkout and stock exhaustion.

## 5. Production

Before switching to live Paystack credentials:

- connect the permanent domain
- publish Terms, Privacy, Digital Delivery and Refund/Wrong-Region policies
- load verified legitimate inventory
- test every enabled platform/region combination
- enable checkout
- replace the test Paystack secret with the live secret
