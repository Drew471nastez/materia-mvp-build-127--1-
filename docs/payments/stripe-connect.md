# Storelib Payments — Stripe Connect

## Architecture

`Storelib Commerce → lib/payments/service → lib/payments/stripe/* → Stripe API`

Creators on Stripe (default) use the `creators` row as the payment account record (`stripe_account_id`, capability flags, requirements). Airwallex was removed; its old rows in `payment_accounts` (part 76) and old orders with `provider = 'airwallex'` are kept and read only (`lib/payments/past-provider.ts`).

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
| `POST /api/stripe/webhook` | Platform account events (payments, billing, disputes) |
| `POST /api/stripe/webhook/connect` | Connected account events (`account.*`, payouts on connected accounts) |

## Environment

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (and `STRIPE_CONNECT_WEBHOOK_SECRET` if split endpoints)

## Dashboard setup

1. Connect → Settings → Platform profile (losses / responsibilities).
2. Enable embedded components for Connect.
3. Two webhook destinations:
   - **Your account:** `https://<app>/api/stripe/webhook`, signed with `STRIPE_WEBHOOK_SECRET`.
   - **Connected accounts:** `https://<app>/api/stripe/webhook/connect` (recommended), signed with `STRIPE_CONNECT_WEBHOOK_SECRET`.
     A Connect destination still pointing at `/api/stripe/webhook` works too: that endpoint checks both secrets.
     Both endpoints hand account events to `lib/stripe/connect-webhook.ts` and share one record of handled events,
     so an event that reaches both is acted on once.
   - Connected-account events it needs: `account.updated`, `account.external_account.created`,
     `account.external_account.updated`, `payout.created`, `payout.paid`, `payout.failed`, `payout.updated`, `payout.canceled`.
4. Storelib fees: `lib/payments/fees/*` (Free 6%+$0.25 / Pro 3%+$0.25; micro tier under $4 USD equivalent).

## The creator's side

One card, `components/app/settings/storelib-payments-settings.tsx`, in Settings → Payments and on Payouts.

Stripe's embedded forms need `https://connect-js.stripe.com` in `script-src` and `frame-src`, and
`https://fonts.googleapis.com` in `connect-src` (`lib/security/csp.ts` and `vercel.json`).

Payouts keeps its whole dashboard (balance, Cash out, history) for every creator with an account, with the
card at the top; payouts are manual, so Cash out is how money leaves. Without an account the card is the page.

## Sandbox testing

1. Use test keys; Settings → Payments → Individual/Business → complete embedded onboarding.
2. Test card `4242…` on a product checkout; confirm application fee on the PaymentIntent.
3. Trigger `account.updated` via Stripe CLI; confirm creator row flags refresh.
