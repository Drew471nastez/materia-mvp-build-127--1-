# Stripe Connect checklist

What to set in Stripe and Vercel so a seller in any country Stripe can pay out to can set up payouts on Storelib. Do it once in a sandbox (test keys), then again in live mode: Stripe keeps the two apart.

Storelib's platform account is in Romania. That decides who can be paid out.

## 1. Keys in Vercel

Project → Settings → Environment Variables.

| Name | Production | Preview |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `sk_live_...` | `sk_test_...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | `pk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_` of the "Your account" destination (section 6) | the sandbox one |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | the `whsec_` of the "Connected accounts" destination | the sandbox one |
| `STRIPE_PLATFORM_COUNTRY` | `RO` | `RO` |
| `ORDER_LINK_SECRET` | any long random string | any long random string |

- The secret and publishable key must be the same mode. A live secret with a test publishable key opens nothing.
- `STRIPE_PLATFORM_COUNTRY` is optional, but set it: without it Storelib asks Stripe once per server, and the first seller to open setup on a cold server waits for that answer.
- `ORDER_LINK_SECRET` signs the link the iOS and Android apps open setup with.
- Leave `NEXT_PUBLIC_SELLER_STATEMENT_NAME` unset. It makes sales `on_behalf_of` the seller, and Stripe does not pay that out across a border.
- Never set `STRIPE_API_BASE` in Vercel. It is for tests, and it is ignored with a live key.
- Redeploy after changing any of these.

## 2. Platform profile

Settings → Connect → Platform profile. Complete and save every question. Until it is saved, Stripe refuses to open accounts and sellers see "a setting on our side".

Answer it the way Storelib opens accounts:

- Storelib collects the sellers' information (onboarding is embedded in Storelib).
- Storelib is responsible for negative balances and pays Stripe's fees.
- Sellers do not get a Stripe Dashboard.
- Business: a marketplace for digital products, paid by card, delivered straight after payment.

## 3. Which countries

Settings → Connect → Onboarding options → Countries.

Turn on all of these. Stripe can pay them out from a Romanian platform:

- United States, United Kingdom, Canada, Switzerland
- Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Liechtenstein, Lithuania, Luxembourg, Malta, Netherlands, Norway, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden, Iceland

Everywhere else (Australia, Japan, Singapore, Brazil, Mexico, India, the UAE and others) Stripe has no self-serve payouts from a European platform. Storelib tells those sellers so before anything is opened, and asks them to choose a country where they also have a bank, or to write to support. To open them, talk to Stripe sales (Global Payouts is for US and UK platforms).

## 3a. Each account is in the seller's country

Stripe never changes a connected account's country, and its form asks its questions for that country (citizenship, ID, address, bank format). So:

- Setup asks "Where is your bank account?" before any account is opened. The answer is the account's `country`. Storelib sends nothing else about the person when it opens the account: no name, address, nationality or ID. Stripe's form asks those.
- Accounts are opened as a person (`business_type: individual`). An account that was made as a company keeps that type.
- Every account opened from the seller's answer carries `metadata.storelib_country_chosen = 1`.
- An account with nothing sent on it and no such mark (every account opened before Nov 23 2026, most of them in Romania because setup used to fall back to the platform's country) never opens Stripe's form. The seller is asked the country first. The same country marks it and the form opens; another country deletes it on Stripe and opens one in the right country. An account with details already sent keeps its country: Disconnect on Payouts, then set up again.

Nothing to do in the Dashboard for this. To see it happen, search the Vercel logs for `stripe_connect_account_opened` with `"replaced":"wrong_country"`.

## 4. Capabilities and approval

Settings → Connect → Configuration (Express) if it is shown: Card payments and Transfers on.

Ask Stripe support (support.stripe.com, "Connect") for two things:

1. Approval for connected accounts with the `transfers` capability without `card_payments`, on the full service agreement. Without it Stripe answers "Your platform needs approval for accounts to have requested the transfers capability without the card_payments capability". Storelib now falls back to accounts with card payments and transfers, so sellers are not blocked meanwhile. Once approved, new sellers in other countries get transfers only.
2. Confirmation that cross-border payouts are on for the platform (US, UK, EEA, Canada, Switzerland).

Never use the recipient service agreement. Stripe makes no cross-border payouts to it.

## 5. Branding and public details

- Settings → Connect → Branding: name Storelib, the Storelib icon, brand colour `#1a1a2e`. This is what sellers see in Stripe's form and emails.
- Settings → Business → Public details: support email support@storelib.com, website https://storelib.com, and the terms and privacy links.
- Statement descriptor: STORELIB.

## 6. Webhooks

Workbench (Developers) → Webhooks → Add destination. Two destinations, both API version as the account default.

**Connected accounts** (events from sellers' accounts):

- URL: `https://storelib.com/api/stripe/webhook/connect`
- Events: `account.updated`, `account.application.deauthorized`, `account.external_account.created`, `account.external_account.updated`, `account.external_account.deleted`, `capability.updated`, `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`
- Put its signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.

**Your account** (the platform's own events):

- URL: `https://storelib.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.refund.updated`, `refund.updated`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`
- Put its signing secret in `STRIPE_WEBHOOK_SECRET`.

Do the same in the sandbox with the sandbox secrets in Preview.

## 6a. Payouts schedule

Nothing to set. Storelib keeps every connected account on a manual payout schedule (it writes `settings.payouts.schedule.interval = manual` when an account is opened and whenever a sync finds it changed), and money moves when the seller presses Cash out. Stripe's own payout buttons are turned off inside the embedded forms. Leave Settings → Connect → Payouts schedule at Stripe's default: the per-account setting wins.

## 7. Redirects

Nothing to register. Storelib does not use Connect OAuth, so there is no client id and no redirect URI list. Stripe's own pages send sellers back to `https://storelib.com/app/payouts?setup=1` (browser) or `https://storelib.com/stripe-done` (the apps), which Account Links accept without an allowlist.

## 8. Check it works

1. With test keys, sign up a test seller, open Payouts, Set up payouts, choose Germany, and finish Stripe's form with Stripe's test data (address line `address_full_match`, ID number `000000000`, IBAN `DE89370400440532013000`). The form should never ask about Romania.
2. Payouts should read "Payments active".
3. Repeat with the United States (routing `110000000`, account `000123456789`) and Brazil. Brazil should be refused in words before anything opens.
4. Leave setup half way (close it after Stripe's first screen), open Payouts again and press Continue setup. If nothing was sent yet, the country is asked again with your answer already in it; Continue goes straight back to Stripe's form. If details were sent, Stripe's form opens where you left it.
5. Do steps 1 and 4 on a phone browser (390px wide), where setup is a full screen sheet, and in the iOS app, where it opens in the browser sheet over the app.

If a seller is still stuck, search the Vercel logs for:

| Log line | What it is |
| --- | --- |
| `payments_api_problem` | what the seller was shown, and its code |
| `stripe_connect_attempt_refused` | Stripe's exact answer to opening an account, with its `req_` id for Workbench → Logs |
| `stripe_connect_account_opened` | an account opened, its country, and whether it replaced one |
| `stripe_connect_country_mark_failed` | the seller's country could not be saved on the account; setup asked them to try again |
| `stripe_account_session_failed` | Stripe refused the embedded form's session |
| `stripe_start_session_skipped` | Continue could not make the form's session beside the account; the form asked for its own |
| `[stripe embed]` | the form failing in a browser |

## 9. How setup loads

For the record, so a later change does not undo it:

- Stripe's `connect.js` is preloaded when a seller points at, focuses or presses Set up payouts, and while the country question is on screen.
- Continue on the country step opens the account and makes the form's Account Session in the same request.
- For an account already under way, the session is made on that same hover or press, held in the browser for at most 90 seconds and used once.
- The form starts loading Stripe's script while its session is still being made, and shows a gray outline of the form, not a spinner, until Stripe draws.

`node scripts/check-payouts-connect.mjs` measures the time from the press to Stripe's first frame against a stubbed Stripe, the old way and the new.
