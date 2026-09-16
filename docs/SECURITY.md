# Security

## Admin

The default authorized admin is `nitradefc24p@gmail.com`. Every `/api/admin/*` handler calls the same server-side allowlist check. Frontend hiding is not treated as authorization.

## Inventory encryption

Real redeemable values are encrypted server-side using AES-256-GCM. The database stores ciphertext, IV, authentication tag, fingerprint and a masked hint. Admin list APIs never return ciphertext or plaintext values.

`INVENTORY_ENCRYPTION_KEY` must be a long random deployment secret. Rotating it requires a controlled re-encryption migration. Do not change it casually after loading stock.

## Code delivery

Customers can retrieve delivered codes only with the DROPKE order reference plus the matching checkout email or phone number. Codes are decrypted only inside a server request after authorization checks.

## Payments

Checkout is blocked by default. `NEXT_PUBLIC_CHECKOUT_ENABLED=true` must be set before an order can reserve inventory. A Paystack test key can then initialize checkout. A live Paystack key additionally requires `PAYSTACK_LIVE_ENABLED=true` on the server.

Paystack payment success is accepted only after server-side verification of transaction status, DROPKE order reference, amount in minor units and KES currency. Webhook signatures are checked using HMAC-SHA512.

## Repository hygiene

Never commit raw gift-card codes, supplier exports, `.env` files, Supabase service-role keys, Paystack secret keys or the inventory encryption key.
