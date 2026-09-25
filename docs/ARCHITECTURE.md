# DROPKE architecture

## Storefront

The customer chooses a Fortnite product, platform and account region. The quote engine converts the Fortnite store price into the lowest-cost supported wallet-credit combination that covers the purchase, then stores a short-lived immutable checkout quote. Order creation consumes that exact snapshot, so the amount shown to the customer is the amount reserved and sent to Paystack.

`product -> platform -> region -> wallet denominations -> KSh price`

The frontend never chooses a redeemable code and never receives inventory internals.

## Inventory

`gift_card_skus` describes a platform, region, denomination and KSh selling price. `inventory_codes` stores encrypted code material and state:

- `available`
- `reserved`
- `sold`

Order insertion, item creation and reservations run in one Postgres transaction with row locking, so partial orders cannot survive and two orders cannot receive the same code.

## Orders

Orders keep payment state separate from fulfilment state. A successful Paystack payment is verified server-side before inventory is finalized.

Typical lifecycle:

`awaiting_payment -> paid_pending_fulfilment -> delivered`

A payment can be successful while fulfilment requires attention. Atomic finalization either assigns the complete code set or leaves the order in `paid_pending_fulfilment` and creates a durable recovery job.

## Admin

Admin access uses Supabase Auth plus an explicit email allowlist. All admin APIs verify the Supabase bearer token server-side before returning inventory, batches, pricing or orders.

## Paystack

The backend initializes Paystack transactions, verifies amount/currency/reference, authenticates webhooks using HMAC-SHA512 and performs idempotent fulfilment. Payment attempts and webhook/verification events are persisted without storing raw card payloads. The Paystack secret never reaches the browser.
