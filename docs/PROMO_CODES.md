# Promo codes

## Operation

Administrators create promotions in the admin overview or subscriptions view.
Codes support letters, numbers, hyphens and underscores (1–64 characters), are
case insensitive and cannot be reused. Conditions are immutable. Disable an old
code and create a new one when changing an offer. Start/end inputs are always
Asia/Tashkent (UTC+05:00); stored dates are ISO UTC. The end boundary is exclusive.

Discounts apply to a single purchase, with one successful redemption per user
and code. Percent discounts round down to whole UZS; fixed discounts are capped
at the base price. A zero total activates PRO without a payment provider.
Free activations and paid purchases extend existing paid time, but do not add
remaining trial time. Promotion changes do not invalidate an existing checkout.

## Interfaces and records

Firebase callable APIs (also served through the existing same-origin /api/rpc):

- validatePromoCode({code, billingCycle}) returns code, baseAmount,
  discountAmount, amount and currency, or a typed details.reason.
- adminCreatePromoCode({code, type: percent|fixed, value, cycles,
  startsAt, endsAt}); adminDisablePromoCode({code}).
- adminListPromoCodes({after?}) returns at most 50 items and nextCursor.
- createSubscriptionCheckout accepts optional promoCode. Its response has
  checkoutId and either checkoutUrl or activated: true for a zero-total purchase.

Promotion IDs are SHA-256 hashes of normalized codes. promoCodes stores immutable
conditions, usage counts, creator and disable metadata; nested audit documents
record management actions. users/{uid}/promoUsages/{id} stores redemption locks.
All these records are inaccessible through client Firestore rules; callable
handlers enforce authentication and existing admin authorization.

The payment gateway receives the server-calculated discounted amount in UZS.
Its authenticated webhook must report that exact amount, provider, currency,
checkout ID, user ID and a unique transaction ID. Legacy full-price checkouts
remain supported. The verified checkout snapshot, rather than the promotion's
current conditions, determines settlement.

## Pending payments

An explicit non-transient 4xx rejection releases the redemption reservation.
Timeouts, 5xx responses, 408/409/425/429 responses and uncertain persistence
outcomes retain it, preventing two payable discounted invoices for one code.
Retrying checkout with the same code, cycle and provider returns its saved
payment URL when available. Other pending states require support reconciliation
with the payment provider; there is no automatic timeout release that could let
an old payable invoice consume a second promotion. A paid invoice can be settled
through the existing administrator verification operation after verifying payment.
No new provider status-query or cancellation API is assumed.

## Release and validation

Release frontend, functions (or the existing serverless RPC deployment) and
firestore.rules together using the project's existing release process. No
migration or seeded public code is required. Paid discounts need the existing
PAYMENT_CHECKOUT_URL, PAYMENT_CHECKOUT_SECRET, PAYMENT_ALLOWED_HOSTS and webhook
configuration; free promotions work without payment configuration.

- npm run lint
- npm --prefix functions run lint
- npm --prefix functions test
- npm run build
- node tests/run-fixture.mjs tests/browser-server.mjs 4180 tests/promo-browser.cjs
- npm run test:rules (requires Java and the Firestore emulator)

Browser fixtures use isolated fake promo responses and never create real codes,
payments or subscriptions. Screenshots are under artifacts/promo/.
