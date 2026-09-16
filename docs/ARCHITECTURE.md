# DROPKE architecture

## Storefront

The customer chooses a Fortnite product, platform and account region. The quote engine converts the Fortnite store price into the smallest supported wallet-credit combination that covers the purchase, then calculates the DROPKE selling price from the relevant SKUs.

`product -> platform -> region -> wallet denominations -> KSh price`

The frontend never chooses a redeemable code and never receives inventory internals.

## Inventory

`gift_card_skus` describes a platform, region, denomination and KSh selling price. `inventory_codes` stores encrypted code material and state:

- `available`
- `reserved`
- `sold`

Reservations are performed inside Postgres with row locking so two orders cannot receive the same code.

## Orders

Orders keep payment state separate from fulfilment state. A successful Paystack payment is verified server-side before inventory is finalized.

Typical lifecycle:

`awaiting_payment -> paid_pending_fulfilment -> delivered`

A payment can be successful while fulfilment requires attention. The system must never label a verified payment as failed simply because stock fulfilment encountered a problem.

## Admin

Admin access uses Supabase Auth plus an explicit email allowlist. All admin APIs verify the Supabase bearer token server-side before returning inventory, batches, pricing or orders.

## Paystack

The backend initializes Paystack transactions, verifies amount/currency/reference, authenticates webhooks using HMAC-SHA512 and performs idempotent fulfilment. The Paystack secret never reaches the browser.
