# Storelib Payments on Airwallex

Storelib Payments is how a creator gets paid for what they sell. It runs on
Stripe today and on Airwallex for the creators it is switched on for. Nothing
about Stripe changed: a creator who is not on the Airwallex rollout sees, and is
charged through, exactly what they were before.

This file is the runbook: how it is built, what has to be set up in Airwallex by
hand, how to test it in the sandbox, and what is not built yet.

## How the money moves

Airwallex calls this model **collect payments directly**. It is the same shape
as Storelib's Stripe destination charges:

1. Storelib creates the payment intent on its own platform account, naming the
   creator's connected account in the body (`connected_account_id`).
2. The creator's share goes on the same request as `funds_split_data`. Airwallex
   splits it to the creator's wallet and releases it on its own once the
   payment succeeds.
3. Storelib's fee is whatever is not split. Airwallex takes its processing fee
   from the platform's part.
4. The buyer pays on Airwallex's hosted payment page. No card number touches
   Storelib.
5. The creator pays out from their wallet to their bank account whenever they
   choose, from Settings > Payments.

Refunds are Storelib's (it owns the payment). The creator's proportional share
of a refund is charged back from their wallet with the Charges API, the same
thing Stripe's `reverse_transfer` does. If that charge fails because the wallet
is short, the buyer's refund still stands, and `payment_audit_log` records
`refund.clawback / failed` for someone to settle by hand.

### Where `x-on-behalf-of` goes, and where it does not

| Request | Owner | `x-on-behalf-of` |
| --- | --- | --- |
| Payment intent, refund, funds split | Storelib | none (creator named in the body) |
| Charge (refund clawback) | Storelib | none (creator is `source`) |
| Account create / retrieve, hosted flow | Storelib | none |
| Embedded form authorisation | the creator | their account |
| Balances, beneficiaries, payouts | the creator | their account |

Sending `x-on-behalf-of` on a payment would turn the creator into the merchant
of record: a different contract, needing business verification (KYB), and not
open to individual creators. `lib/payments/airwallex/client.ts` makes
`onBehalfOf` a required argument, so every call site decides this on purpose.

## States

Two different things come back from Airwallex and are never mixed up:

- **The account's lifecycle**, from the Accounts API and `account.*` webhooks:
  `CREATED`, `SUBMITTED`, `ACTION_REQUIRED`, `ACTIVE`, `SUSPENDED`, and from API
  version `2026-08-21` `DORMANT` and `CLOSED`. Anything else is read as unknown
  and is not ready.
- **The embedded form's `kycStatus`**: `INIT`, `SUBMITTED`, `SUCCESS`, `FAILURE`.
  This is how far the person got through the form. It only changes wording.

Checkout opens only when the account is `ACTIVE` **and** has a payout account
(`lib/payments/model.ts checkoutOpen`). Storelib never marks a creator ready on
its own say-so.

| Airwallex | Creator sees |
| --- | --- |
| no account | Set up payments |
| `CREATED` | Verify your details |
| `SUBMITTED` (or `CREATED` after the form succeeded) | Payments under review |
| `ACTION_REQUIRED` | Action required, with what is needed |
| `ACTIVE`, no payout account | Add payout account |
| `ACTIVE` with one | Payments active |
| `SUSPENDED` / `DORMANT` / `CLOSED` | Payments paused / inactive / closed |

## Code map

| Path | What it is |
| --- | --- |
| `lib/payments/model.ts` | States, wording, readiness. Pure. |
| `lib/payments/money.ts` | Minor units in Storelib, major units at Airwallex, by currency precision. |
| `lib/payments/airwallex/config.ts` | Environment, sandbox guard, rollout. |
| `lib/payments/airwallex/client.ts` | Login and token cache, headers, errors, request ids. |
| `lib/payments/airwallex/resources.ts` | One function per Airwallex endpoint. |
| `lib/payments/airwallex/webhook.ts` | Signature check and event parsing. Pure. |
| `lib/payments/airwallex/events.ts` | What each event changes. |
| `lib/payments/store.ts` | The part 76 tables. |
| `lib/payments/service.ts` | What the hub, checkout and webhook ask. |
| `lib/payments/checkout.ts` | Starting and reading an Airwallex checkout. |
| `lib/payments/refunds.ts` | Refund plus clawback. |
| `lib/payments/readiness.ts` | "Are payments set up?" for Home, notices, reminders. |
| `app/api/payments/[action]` | The hub's server. |
| `app/api/payments/airwallex/webhook` | Airwallex's notification URL. |
| `app/api/payments/airwallex/return` | The buyer's return from the payment page. |
| `components/app/settings/payments-hub.tsx` | The Payments tab for an Airwallex creator. |
| `supabase/sql/run-now/76_storelib_payments.sql` | The tables. |

Every table in part 76 is server-only: row level security on, no policies, no
grants to the public or signed-in keys. What is stored is the minimum:
statuses as Airwallex sent them, requirement **codes** (never names or file
ids), and a payout destination as bank, country, currency and last four digits.
No bank account number, identity document, token or secret is stored or logged.

## Manual setup in Airwallex

None of this can be done from the code.

1. **Payments for Platforms** enabled on the platform account, with the
   *collect payments directly* model and funds splits. Ask the Account Manager.
2. **Connected accounts** enabled, and confirm which account type Storelib's
   creators get (full or withdrawal) in which countries. A funds split needs a
   destination account that has passed onboarding verification.
3. **Hosted onboarding template.** Ask for one and put its id in
   `AIRWALLEX_HOSTED_FLOW_TEMPLATE`. Individuals are verified here, since the
   embedded identity form is for business accounts only. It also answers
   requests for information.
4. **Embedded components** (identity form for businesses, payout account form,
   RFI form). Ask for them to be switched on, then set
   `AIRWALLEX_EMBEDDED_COMPONENTS=1`. Until then the hub uses the hosted page
   for verification and says plainly that payout accounts are not available yet.
5. **API key.** Create a scoped key for the platform account in the web app.
   Put its client id and key in the environment (below). Never in the browser.
6. **Webhook.** Add the notification URL
   `https://<deployment>/api/payments/airwallex/webhook` and subscribe to:
   - `account.*` (including `account.dormant`, `account.closed`, and
     `account.offboarding.*` on version 2026-08-21)
   - `rfi.*`
   - `payment_intent.succeeded`, `payment_intent.cancelled`
   - `refund.*`
   - `payment_dispute.*`
   - `funds_split.*`
   - `payout.transfer.*`

   Copy the subscription's secret into `AIRWALLEX_WEBHOOK_SECRET`. Without it,
   every event is refused.
7. **API version.** Pin `2026-08-21` (`AIRWALLEX_API_VERSION`) on requests and on
   the webhook subscription, so `DORMANT` and `CLOSED` arrive as themselves.

## Environment

| Variable | |
| --- | --- |
| `AIRWALLEX_CLIENT_ID`, `AIRWALLEX_API_KEY` | The platform's API credentials. |
| `AIRWALLEX_ENV` | `sandbox` (default) or `production`. |
| `AIRWALLEX_ALLOW_LIVE` | `1` only once going live is approved. Without it, `production` refuses to start. |
| `AIRWALLEX_API_VERSION` | e.g. `2026-08-21`. |
| `AIRWALLEX_WEBHOOK_SECRET` | The notification URL's secret. |
| `AIRWALLEX_HOSTED_FLOW_TEMPLATE` | The hosted onboarding template id. |
| `AIRWALLEX_EMBEDDED_COMPONENTS` | `1` once components are switched on. |
| `STORELIB_PAYMENTS_AIRWALLEX` | Who is on Airwallex: unset (nobody), `all`, or comma-separated creator ids. |

A creator who already has an Airwallex account row stays on Airwallex even if the
rollout variable is later changed, so nobody is stranded half way through.

## Testing in the sandbox

Production has none of these variables, so nothing about Airwallex runs there.
To test:

1. Run `supabase/sql/run-now/76_storelib_payments.sql`.
2. On a Vercel **Preview** environment, set the sandbox credentials, the webhook
   secret, the template and `STORELIB_PAYMENTS_AIRWALLEX=<your test creator id>`.
   Preview deployments usually share the production database, so name only test
   creators.
3. Point a sandbox webhook subscription at that preview's URL.
4. Walk it through: Settings > Payments > set up, verify, add a payout account,
   buy a product as a buyer, refund it, request a payout.

`tests/storelib-payments.test.ts` drives the client against a fake Airwallex
built from the documented request and response shapes. It proves what Storelib
sends. It cannot prove Airwallex accepts it. These need a sandbox run:

- account creation with only a country for an individual (Airwallex may ask
  for more at creation)
- the `reason` values on payouts and charges (`transfer_to_own_account`)
- funds splits to the account type Storelib's creators get
- the embedded forms' events in practice (`ready` payload, `success`)
- Airwallex.js loading under the site's Content-Security-Policy (`*.airwallex.com`
  is allowed; the policy is report-only, so check the CSP reports)

## Not built yet, on purpose

These say so in the product rather than pretending:

- **Baskets and memberships on Airwallex.** The cart and memberships still need a
  Stripe account. An Airwallex-only creator's basket or membership checkout
  refuses with "cannot take payments yet". Recurring charges would need Airwallex
  payment consents and a Storelib-run billing schedule.
- **A payout schedule.** Airwallex has none for this. Creators pay out when they
  choose.
- **Deferred identity verification.** Only with Airwallex's approval for
  Storelib's program, and only through the native API.
- **Merchant-of-record seller registration** (Airwallex's Seller API).
  Only needed if Airwallex asks for it under Storelib's merchant-of-record setup.
- **Abandoned checkout reminders** for Airwallex checkouts. The start is recorded
  only for Stripe's payment intents.
- **Storelib's own Pro plan billing** stays on Stripe. That is Storelib charging
  creators, not creators getting paid.

## Going live

1. Airwallex approves the platform for production.
2. Production credentials, template, webhook secret and version in the
   **Production** environment, plus `AIRWALLEX_ENV=production` and
   `AIRWALLEX_ALLOW_LIVE=1`.
3. Roll out by creator id first, then `all` for new creators. Existing Stripe
   creators move only when each of them sets up on Airwallex.
