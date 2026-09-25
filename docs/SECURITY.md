# Security

## Admin

Every `/api/admin/*` handler validates a Supabase session and checks the verified email against `public.admin_users` with the server-only service role. The browser bundle does not publish the allowlisted address, and the admin sign-in form does not create new Auth users. Provision authorized Auth users deliberately before they sign in.

## Inventory encryption

Real redeemable values are encrypted server-side using AES-256-GCM. The database stores ciphertext, IV, authentication tag, fingerprint and a masked hint. Admin list APIs never return ciphertext or plaintext values.

`INVENTORY_ENCRYPTION_KEY` must be a long random deployment secret. Rotating it requires a controlled re-encryption migration. Do not change it casually after loading stock.

## Code delivery

Customers can retrieve order status with the DROPKE order reference plus the matching checkout email or phone number. Revealing delivered codes additionally requires the 256-bit delivery token issued once when the order is created. Codes are decrypted only inside a server request after both checks pass.

## Payments

Checkout is blocked by default. `NEXT_PUBLIC_CHECKOUT_ENABLED=true` must be set before an order can reserve inventory. A Paystack test key can then initialize checkout. A live Paystack key additionally requires `PAYSTACK_LIVE_ENABLED=true` on the server.

Paystack payment success is accepted only after server-side verification of transaction status, DROPKE order reference, amount in minor units and KES currency. Webhook signatures are checked using HMAC-SHA512. Payment attempts and events are recorded in an idempotency ledger; failed processing remains retryable.

## Repository hygiene

Never commit raw gift-card codes, supplier exports, `.env` files, Supabase service-role keys, Paystack secret keys or the inventory encryption key.
