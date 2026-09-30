# Storelib Payments — Stripe Connect

## Architecture

`Storelib Commerce → lib/payments/service → lib/payments/stripe/* → Stripe API`

Creators on Stripe (default) use the `creators` row as the payment account record (`stripe_account_id`, capability flags, requirements). Airwallex creators use `payment_accounts` (part 76).

## Connect configuration

- **Account type:** Express, platform-created (no OAuth / `STRIPE_CONNECT_CLIENT_ID`).
- **Embedded UI:** Account Sessions + `@stripe/connect-js` in Settings → Payments.
- **Charge model:** Destination charges — platform `PaymentIntent` with `transfer_data.destination` + `application_fee_amount` (`app/api/checkout/stripe-session`).
- **Capabilities:** `card_payments`, `transfers`.
- **Payouts:** Manual schedule re-enforced server-side; creators cash out via Storelib Payouts / ledger.

## API routes

| Route | Role |
|-------|------|
| `GET/POST /api/payments/*` | Unified hub (overview, start, component, refresh) |
| `POST /api/checkout/stripe-session` | Checkout gate + PaymentIntent |
| `POST /api/stripe/webhook` | Platform + Connect events (idempotent ledger) |

## Environment

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (and `STRIPE_CONNECT_WEBHOOK_SECRET` if split endpoints)

## Dashboard setup

1. Connect → Settings → Platform profile (losses / responsibilities).
2. Enable embedded components for Connect.
3. Webhook endpoint(s) for `account.updated`, `payment_intent.*`, `charge.*`, `payout.*`, subscription/invoice events as already configured in `app/api/stripe/webhook/route.ts`.

## Sandbox testing

1. Use test keys; Settings → Payments → Individual/Business → complete embedded onboarding.
2. Test card `4242…` on a product checkout; confirm application fee on the PaymentIntent.
3. Trigger `account.updated` via Stripe CLI; confirm creator row flags refresh.
