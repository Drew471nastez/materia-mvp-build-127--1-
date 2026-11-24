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
| `STRIPE_SETTLEMENT_COUNTRIES` | only after section 3b: `AU,NZ,JP,HK,SG,AE,GI` | the same, once done in the sandbox |
| `ORDER_LINK_SECRET` | any long random string | any long random string |

- The secret and publishable key must be the same mode. A live secret with a test publishable key opens nothing.
- `STRIPE_PLATFORM_COUNTRY` is optional, but set it: without it Storelib asks Stripe once per server, the first seller to open setup on a cold server waits for that answer, and the country step cannot say in advance which countries are open.
- `STRIPE_SETTLEMENT_COUNTRIES` opens countries outside the cross-border region (section 3b). Leave it unset until those countries are on in the Dashboard: a country listed here that Stripe has not turned on is refused when the seller presses Continue (they are told it is not open yet, and the log line `stripe_settlement_country_not_enabled` names the country to turn on).
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

These are cross-border payouts: Stripe's docs (docs.stripe.com/connect/cross-border-payouts) allow them from a US, UK, EEA, Canadian or Swiss platform to accounts in any of those countries, on the full service agreement, with destination charges without `on_behalf_of`. That is how every Storelib sale is made, so nothing else is needed for them.

## 3b. Countries outside that region (Australia, Japan and others)

Stripe moves money from a European platform to a seller outside the region only when the sale is made on the seller's behalf (`on_behalf_of`, the seller is the settlement merchant; docs.stripe.com/connect/destination-charges). Storelib does that for these sellers once you open their countries. Their account is a full agreement account with Card payments and Transfers; the money settles in their country and currency, and the card statement shows their store's name.

1. Settings → Connect → Onboarding options → Countries: turn on Australia, New Zealand, Japan, Hong Kong, Singapore, United Arab Emirates and Gibraltar (any of them you want).
2. Confirm with Stripe support that the platform may make destination charges with `on_behalf_of` to connected accounts in those countries and take an application fee on them. Stripe's docs allow it "with certain exceptions"; support can say whether any apply to Storelib.
3. In Vercel set `STRIPE_SETTLEMENT_COUNTRIES` to the ones that are on, for example `AU,NZ,JP,HK,SG,AE,GI`, and redeploy.

Until step 3, setup tells sellers in those countries "Stripe works in Australia, but payouts to banks there aren't open on Storelib yet", with "Tell me when it opens" and the option to choose a country where they also have a bank.

What the code does once a country is listed: the country step says "Payouts arrive in Australian dollar (AUD) at a bank in Australia. Sales are made in your name"; Continue opens a card payments and transfers account (never transfers only, never the recipient agreement); every checkout for that seller (single product, cart, website, physical) carries `on_behalf_of`; and the seller can take orders only once Stripe has turned Card payments on for them, not only Transfers.

The fees and the dispute side change for these sellers: Stripe's fee is their country's, and disputes are filed against their account (Storelib still covers losses, accounts are opened with `losses.payments = application`).

## 3c. Countries Storelib cannot open on its own

These need something from Stripe that code cannot ask for. Setup names the reason for each country before anything is opened, never offers Continue into a refusal, and offers "Tell me when it opens". Each press is a row in `integration_requests` named "Payouts in <country>" (note `payouts_country:<code>`), so /admin → Integrations shows which countries sellers are asking for.

| Countries | Why | What would open them |
| --- | --- | --- |
| Brazil, Mexico, India, Indonesia, Malaysia, Thailand, Côte d'Ivoire, Ghana, Kenya, Nigeria, South Africa | Stripe operates there, but a platform abroad needs Stripe's review (Mexico, Brazil), an invitation (India, Indonesia) or has limits on fees and `on_behalf_of` | Ask Stripe support for each. Once approved, turn the country on (3b step 1) and add it to `STRIPE_SETTLEMENT_COUNTRIES`: the code opens it like Australia |
| Argentina, Chile, Colombia, Peru, the Philippines, Vietnam, Korea, Taiwan, Turkey, Israel, Egypt and others | No Stripe accounts there. Stripe pays them only through Global Payouts, which needs a US or UK sender (EEA is in private preview) and Treasury | A Global Payouts platform account, or a separate US or UK platform. Not something this code can switch on |
| Everywhere else | Stripe does not pay out there at all | Nothing on Stripe today |

The recipient service agreement is never used: Stripe makes no cross-border payouts to it ("You can't make cross-border payouts to connected accounts under a recipient service agreement"), so for a Romanian platform it would only hold the seller's money.

## 3a. Each account is in the seller's country

Stripe never changes a connected account's country, and its form asks its questions for that country (citizenship, ID, address, bank format). So:

- Setup asks "Where is your bank account?" before any account is opened. The field starts on the country the request comes from (Vercel's `x-vercel-ip-country`, nothing to configure), then the country on the seller's profile, then the browser's language region; an account whose country the seller already chose starts on that. Under it the seller reads the currency payouts arrive in, or why that country is not open. The answer is the account's `country`. Storelib sends nothing else about the person when it opens the account: no name, address, nationality or ID. Stripe's form asks those.
- Accounts are opened as a person (`business_type: individual`). An account that was made as a company keeps that type.
- Every account opened from the seller's answer carries `metadata.storelib_country_chosen = 1`.
- An account with nothing sent on it and no such mark (every account opened before Nov 23 2026, most of them in Romania because setup used to fall back to the platform's country) never opens Stripe's form. The seller is asked the country first. The same country marks it and the form opens; another country deletes it on Stripe and opens one in the right country. An account with details already sent keeps its country: Disconnect on Payouts, then set up again.

Nothing to do in the Dashboard for this. To see it happen, search the Vercel logs for `stripe_connect_account_opened` with `"replaced":"wrong_country"`.

## 4. Capabilities and approval

Settings → Connect → Configuration (Express) if it is shown: Card payments and Transfers on.

Ask Stripe support (support.stripe.com, "Connect") for two things:

1. Approval for connected accounts with the `transfers` capability without `card_payments`, on the full service agreement (for sellers in the region outside Romania). Without it Stripe answers "Your platform needs approval for accounts to have requested the transfers capability without the card_payments capability". Storelib now falls back to accounts with card payments and transfers, so sellers are not blocked meanwhile. Once approved, new sellers in other countries get transfers only.
2. Confirmation that cross-border payouts are on for the platform (US, UK, EEA, Canada, Switzerland).
3. For section 3b: confirmation that destination charges with `on_behalf_of` and an application fee are allowed to the countries you list, and, for each country in the first row of 3c you want, its review.

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
3. Repeat with the United States (routing `110000000`, account `000123456789`) and Brazil. Brazil should be refused in words before anything opens, with Tell me when it opens; pressing it adds "Payouts in Brazil" to /admin → Integrations.
4. If you did 3b: repeat with Australia (BSB `110000`, account `000123456`). The test checkout for that seller should show the store's own name as the merchant, and the PaymentIntent in Workbench should carry `on_behalf_of`.
5. Leave setup half way (close it after Stripe's first screen), open Payouts again and press Continue setup. If nothing was sent yet, the country is asked again with your answer already in it; Continue goes straight back to Stripe's form. If details were sent, Stripe's form opens where you left it.
6. Do steps 1 and 5 on a phone browser (390px wide), where setup is a full screen sheet, and in the iOS app, where it opens in the browser sheet over the app.

If a seller is still stuck, search the Vercel logs for:

| Log line | What it is |
| --- | --- |
| `payments_api_problem` | what the seller was shown, and its code |
| `stripe_connect_attempt_refused` | Stripe's exact answer to opening an account, with its `req_` id for Workbench → Logs |
| `stripe_connect_account_opened` | an account opened, its country, and whether it replaced one |
| `stripe_connect_country_unsupported` | a country refused before Stripe was asked, with `why` (`not_opened`, `needs_stripe_review`, `global_payouts_only`, `no_stripe`) |
| `stripe_settlement_country_not_enabled` | a country in `STRIPE_SETTLEMENT_COUNTRIES` that Stripe refused: turn it on in the Dashboard or take it off the list |
| `payouts_country_requested` | a seller pressed Tell me when it opens |
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

`node scripts/check-payouts-connect.mjs` measures the time from the press to Stripe's first frame against a stubbed Stripe, the old way and the new (set `PAYOUTS_NO_BEFORE=1` on a machine without git history), and walks each country group from the request's country.

## 10. What code cannot do without the Dashboard

- Open any account before the platform profile is saved (section 2).
- Open a transfers-only account before Stripe approves it (section 4); until then sellers in the region get a cards and transfers account, which still pays out.
- Pay a seller outside the region until their country is on (3b) and listed in `STRIPE_SETTLEMENT_COUNTRIES`.
- Pay Brazil, Mexico, India and the rest of 3c's first row before Stripe's review, or any country Stripe only reaches through Global Payouts.
- Receive account and payout updates without the two webhook destinations (section 6): the page then reads Stripe on every open instead.
