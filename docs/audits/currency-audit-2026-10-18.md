# Storelib currency and money audit, with the Option A plan (18 October 2026)

**Read-only. No code, data or setting was changed.** This replaces the short
audit in `money-audit-2026-10-18.md` and goes further: every charge path,
provider, table, email, job and report was traced against the rules below.

Every finding is marked:

- **Verified**: read in the code on `main` (`b9b3bc7ac`), or quoted from Stripe's own docs, with the file and line.
- **Assumption**: likely, but needs a check I could not make from here (a live Stripe or Vercel setting I did not read).

---

## 1. The rules this was measured against

| Where | Shows | Charges |
|---|---|---|
| `/app` (dashboard, products, analytics, revenue, customers, settings, shipping, coupons) | Store currency | n/a |
| The merchant's own website, live and in the builder | Store currency (and its existing market selector) | Store currency (or the market's, as today) |
| OnePage | Store currency | Store currency |
| Explore, creator pages, marketplace product pages, communities, recommendations and cross-selling | **USD** | **USD** |
| Orders, receipts, invoices, emails, refunds, disputes, subscriptions, notifications | The currency the buyer was actually charged in | n/a |
| Payouts | What Stripe actually settled and paid | n/a |
| Reports | Store currency, converted at the historical rate of each sale; originals kept | n/a |

Plus: never guess a currency, never convert twice, no automatic "psychological"
rounding, optional merchant-approved fixed USD prices, lock the quoted price
through payment, and never rewrite history when a store changes currency.

---

## 2. How money actually moves today

### 2.1 The provider (Verified)

- **Stripe is the only live processor.** `lib/payments/active-provider.ts` always returns `"stripe"`. Airwallex code exists but is inert.
- **Every sale is a destination charge.** The PaymentIntent is created on the platform with `transfer_data.destination` = the creator's account and `application_fee_amount` = Storelib's fee (`app/api/checkout/stripe-session/route.ts` 296-304, and the same shape in cart, site, physical, community and membership checkouts).
- **`on_behalf_of` is off.** It is only set when `NEXT_PUBLIC_SELLER_STATEMENT_NAME=1` (`lib/payments/platform-descriptor.ts` 35, 72).
- **Card only.** `lib/checkout/payment-methods.ts` `METHOD_SETS = [["card"]]`. Apple Pay and Google Pay ride on card.
- **The platform Stripe account is in Romania.** Evidence: `lib/payments/stripe/connect.ts` 400 records Stripe's own refusal "recipient ToS is not supported for platforms in RO creating accounts in RO". *(Assumption until confirmed in the Stripe dashboard.)*
- **Creators outside Romania** are created as cross-border "recipient" accounts (transfers only). Romanian creators get `card_payments` + `transfers`, falling back to transfers only (`connect.ts` 363-440).

### 2.2 What Stripe does with a USD charge on this setup (Verified from Stripe docs)

From [FX Quotes API in Connect](https://docs.stripe.com/connect/currencies/fx-quotes-api) and [Connect charges](https://docs.stripe.com/connect/charges):

1. **Destination charges' available currencies are set by the platform's country**, not the creator's. Stripe presents charges in 135+ currencies, USD included ([supported currencies](https://docs.stripe.com/currencies)). So a USD charge is possible for every creator who can be paid today.
2. **Without `on_behalf_of` there are two conversions.** "Stripe first converts the charge from the presentment currency to the platform's settlement currency. Stripe then converts the amount transferred to the connected account into the connected account's settlement currency."
3. **The application fee arrives in the creator's settlement currency.** "If you use `application_fee_amount`, Stripe deducts the application fee after converting the transferred funds."
4. **Stripe's fees, including FX, are debited from the platform's balance** for destination charges. So **Storelib pays the FX cost of a USD sale**, not the creator.
5. **Refunds use the live rate on the refund day**, and "Stripe doesn't refund the FX fee charged on the original transaction." The buyer always gets back the exact USD amount. The platform absorbs the rate difference and the original FX fee.
6. **No conversion** happens for a currency the account has multi-currency settlement enabled for.

**FX cost:** Stripe's pricing pages list conversion fees of roughly 1% to 2% per conversion ([pricing](https://stripe.com/pricing), [Global Payouts pricing](https://docs.stripe.com/global-payouts/pricing)). *(Assumption: confirm the platform's exact contracted FX rate in the Stripe dashboard.)*

**Important:** this double conversion **already happens today** for every EUR, GBP, CAD and AUD store, because the platform settles in one currency. Option A adds it for RON stores' marketplace sales, and removes it for USD sales if the platform enables USD settlement.

### 2.3 Can every creator receive a USD sale? (Verified, with one open question)

- Yes, for every creator whose checkout works today. Destination charges without `on_behalf_of` don't depend on the creator's country for presentment, and Stripe converts on the transfer.
- **If `on_behalf_of` is ever turned on**, the creator's country decides presentment and settlement instead. USD is still a supported presentment currency there, but this must be re-checked per country before enabling the flag.
- **Open question (Assumption / risk, not a currency bug):** Stripe's [cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts) page currently says "You can't make cross-border payouts to connected accounts under a recipient service agreement." Storelib creates its non-Romanian creators with that agreement. Payouts appear to work today, so this may be older wording or a grandfathered setup, but it should be confirmed with Stripe support. It affects payouts for non-RO creators whatever currency the buyer pays in.
- **Never offer USD where Stripe would refuse it.** The fee engine already refuses any charge currency without a rule (`lib/payments/fees/currency-rules.ts`). USD has one. The minimum card charge in USD is 50 cents (`lib/store/selling-currency.ts` 50).

### 2.4 The production platform currency (Assumption)

`NEXT_PUBLIC_PLATFORM_CURRENCY` defaults to RON in code (`currency-rules.ts` 62). The live Explore page at storelib.com shows only `$` prices today, so production very likely sets it to `usd`. **I did not read any Vercel env values.** Confirm it before Phase 1, because three findings below (F9, F10, F12) change size depending on it.

---

## 3. The lifecycle of one amount, traced

| Stage | Where the currency comes from today | Right? | Files |
|---|---|---|---|
| Product price saved | `products.price_cents`, no currency column; meaning = the store's `store_settings.currency` | Yes | `lib/store/selling-currency.ts` |
| Membership / community plan saved | `membership_plans.currency`, **never written**, so the column default `'usd'` | Consistent but implicit (F2) | `lib/memberships/creator.ts` 141-151, `lib/communities/server/tiers.ts` |
| Event / program / module priced | Platform currency | Wrong under Option A (F4) | `event-ticket-setup.ts` 18, `learn-builder.ts` 14 |
| Shown on `/app` | Store currency (`LiveStoreCurrency`, `useSellerMoney`) | Yes, except F5/F6 | `components/platform/price-currency.tsx` |
| Shown on the website and builder | Store currency, or the market's converted price | Yes | `lib/markets/*` |
| Shown on OnePage | Store currency (`usePageMoney`) | Yes | `components/onepage/public-onepage.tsx` 3373 |
| Shown on Explore / creator page / `/p/` page | Store currency | Wrong under Option A (F3) | `app/(marketing)/explore/page.tsx` 175, `app/(marketing)/p/[slug]/page.tsx` 886 |
| Shown on a community page | Membership: USD. One-time tier: "$" | One-time is wrong (F1) | `lib/communities/server/public.ts` 170 |
| Checkout charge | Store currency (product, cart, physical), market currency (site), platform currency (community events, programs, modules), USD (memberships) | Four rules (F4) | see 2.1 |
| Order written | `orders.currency` from the PaymentIntent | Yes, except one fallback (F8) | `lib/checkout/fulfil-payment.ts` 242 |
| Receipt and emails | The order's currency | Yes, except fallbacks (F7) | `lib/email.tsx`, `lib/physical/jobs-server.ts` |
| Refund | Stripe always refunds in the charge's currency | Yes (money). Records have `"usd"` fallbacks (F11) | `app/api/stripe/refund/route.ts`, `lib/stripe/refund-sync.ts` |
| Wallet ledger | Converted to the platform currency at ECB rate | Labelled correctly; cash out reads it wrongly (F9) | `lib/payments/ledger-currency.ts` |
| Payout | Stripe's real balance in its own currency | Money yes; the record is wrong (F9) | `app/api/stripe/cashout/route.ts` |
| Analytics, Home, Customers | Sums `amount_cents` over every currency | Wrong (F5) | `lib/analytics/*`, `fulfil-payment.ts` 539 |

---

## 4. Findings, most serious first

### P0: a buyer can be shown one currency and charged another

**F1. One-time community tiers are shown in dollars and charged in the store currency.** *(Verified)*
- `lib/communities/server/public.ts` 170: `currency = (plan?.currency || "usd")`. A one-time tier has no membership plan, so it is always `"usd"`, and the community page says "$29".
- The tier's Join button goes to `checkoutPath(product.id)` (public.ts 180), the normal product checkout, which charges `readStoreCurrency()` (`stripe-session/route.ts` 154).
- The creator's editor shows a hard `$` (`components/community/creator/parts.tsx` 591).
- **Impact:** on a RON store, the page says $29 and the card is charged 29 lei (about $6.30). On an EUR store, it is charged €29.
- **Root cause:** two parts of the code each assume the other's currency.
- **Safe fix:** under Option A, communities sell in USD. Price the one-time tier in USD like recurring plans (Phase 1b). Until then, show it in the currency it is charged in.

**F2. Membership prices show in the store currency on cards but bill in USD.** *(Verified)*
- `membership_plans.currency` is never written on save (`lib/memberships/creator.ts` 141-151; `tiers.ts` update path), so it is the column default `'usd'`. `stripe.prices.create` bills `plan.currency || "usd"` (`lib/memberships/billing.ts` 66).
- The plan editor shows a hard `$` (`components/memberships/creator-screen.tsx` 634). So the plan itself is consistently USD, which is already right under Option A.
- But the product row's `price_cents` (the monthly price) is drawn on Explore, creator pages and OnePage in the **store's** currency (`lib/pricing/list-price.ts`, `public-onepage.tsx` 5314). A RON store's $9/month plan reads "9 lei/month".
- **Safe fix:** write `currency = 'USD'` explicitly on every plan save, and draw membership prices from the plan's own currency everywhere. **No change to existing subscriptions**: they are already in USD at Stripe.

### P1: wrong numbers, inconsistent rules, or records that disagree with money

**F3. The public marketplace shows each store's own currency, not USD.** *(Verified, by today's design)*
- Explore and category pages (`app/(marketing)/explore/page.tsx` 175, `[category]/page.tsx` 174), the featured carousel, creator pages and `/p/[slug]` (`page.tsx` 886) all draw in the store's currency.
- This is the main Option A change. See section 5.

**F4. Four different charge-currency rules in one ecosystem.** *(Verified)*
- Product, cart and physical checkouts: store currency (`stripe-session` 154, `cart` 263, `lib/physical/checkout-server.ts` 277).
- Website checkout: the market's currency, or the store's (`app/api/checkout/site/route.ts` 326).
- Community events, programs and modules: the **platform** currency (`app/api/community/[communityId]/events/[eventId]/checkout/route.ts` 59, `learn/[programId]/checkout/route.ts` 56).
- Memberships and community plans: USD (F2).
- **Impact:** a RON creator on a USD deployment sells community events in USD and community one-time tiers in RON, from the same page.

**F5. Revenue figures add up different currencies as if they were one.** *(Verified)*
- `lib/analytics/home-figures.ts` 95-97 (`homeTotals`), `lib/analytics/reports.ts` (~970), `lib/analytics/creator-orders.ts` (`SALE_COLUMNS` has no currency), and the `analytics_all_time` SQL function all sum `amount_cents` with no currency check.
- `customers.total_spent_cents` is a running sum over orders in any currency (`fulfil-payment.ts` 539). The Customers page then labels it with the store currency (`app/app/customers/page.tsx` 153, 199).
- **Today's exposure:** a store gets orders in another currency through website markets (EUR visitor on a RON store), a store currency change, and community events or programs in the platform currency. Under Option A, every marketplace sale is USD, so **this becomes common**. It must be fixed before marketplace USD checkout goes live.
- **Already right:** the Stripe revenue chart keeps one currency per chart and lists the rest separately (`app/api/stripe/revenue-chart/route.ts` 159-161), and community analytics carries its own currency.

**F6. Three readers of "the store currency".** *(Verified)*
- `creators.payout_currency` (default `"USD"`) is read as the store currency by:
  - Taxes (`app/api/store/taxes/route.ts` 19-29)
  - customer email previews and test emails (`app/api/store/emails/route.ts` 30-44, `emails/test/route.ts` 54-72, `emails/preview/route.ts` 26-38)
  - Store details (`app/api/store/settings/route.ts` 26-42)
- A EUR store whose payout currency was never changed sees USD on its Taxes tab and in its email previews.
- **Safe fix:** read `readStoreCurrency()` in all five routes. `payout_currency` keeps its meaning (payouts only). No data change.
- (OnePage, listed in the earlier audit, is already fixed on main.)

**F7. Transactional emails can fall back to the wrong currency.** *(Verified)*
- `lib/email.tsx` 527-529: when a receipt cannot be read, the fallback receipt uses the **store's current** currency.
- `lib/email.tsx` 665: `first?.currency || sale.currency || "usd"`.
- `lib/email.tsx` 1727-1728: the refund email formats with `currency || "USD"`.
- Normal paths pass the charge currency. These fallbacks only bite when data is missing, but when they do the email shows a wrong amount.
- **Safe fix:** read the currency from the order, then the PaymentIntent. If neither is known, hold the email and flag it in admin Health. Never send it with a guessed currency.

**F8. One order path can write a paid order with no currency, which becomes USD.** *(Verified)*
- `app/api/stripe/webhook/route.ts` 585-594: when the full insert fails, the "minimal" insert sets `amount_cents` but not `currency`. `orders.currency` defaults to `'usd'` (`scripts/004…`, `supabase/migrations`).
- **Safe fix:** include `currency` from the session in the minimal insert. Add a reconciliation report for any past rows (section 7.3).

**F9. Cash out mixes units, and the payout record stores the wrong amount.** *(Verified in code; exact impact depends on 2.4)*
- The wallet ledger is kept in the **platform currency** (`lib/payments/ledger-currency.ts` 24).
- Cash out treats it as **USD**. It re-syncs `available_amount` from the Stripe balance converted to USD with the Frankfurter API (`app/api/stripe/cashout/route.ts` 100-142). It writes `ledger_events.currency = "usd"` with a `$` description (262-271).
- The `payouts` row stores `amount_cents: cashoutUsdCents` with `currency: payoutCurrency` (288-291). That is a USD figure labelled as the payout's real currency.
- **The money itself is right:** the Stripe payout sends the creator's full native available balance (223-233).
- **Impact:** on a USD deployment, a Romanian creator's 460 lei payout is recorded as "100.00 RON". On a RON deployment, the ledger also gets a USD figure written over a lei balance.
- **Safe fix:** record the payout row from the Stripe payout object itself (`amount`, `currency`). Keep the ledger in its own currency, and convert with the same ECB rates as everything else (retire `lib/exchange-rate.ts`, F14).

**F10. "Payout available" push notifications always say dollars.** *(Verified)*
- `lib/push/notifications.ts` 56-60 formats with `currency: "USD"`. It is called from `app/api/cron/release-holds/route.ts` with a ledger amount in the platform currency.
- (`notifySale` has the same issue, but only the admin test trigger calls it.)

**F11. Website markets re-read the rate at Pay time.** *(Verified by reading; low probability)*
- The page and the PaymentIntent both convert with the **newest** ECB rates (`lib/markets/checkout-charge.ts`, `lib/markets/checkout-market-server.ts`). If the daily rates arrive between the page loading and Pay, the charge can differ by a few cents from what was shown.
- **Safe fix:** carry the rate date (`fx_as_of`) from the page into the checkout and convert with that day's immutable row (section 5.3). The same mechanism serves the marketplace.

### P2: tidy-ups that remove future risk

**F12. Hard-coded `"usd"` fallbacks in money paths.** *(Verified)*
- Examples:
  - `lib/checkout/fulfil-payment.ts` 169, 242, 268, 463
  - `lib/memberships/billing.ts` 66, 86
  - `lib/memberships/sync.ts` 296, 332, 415, 446
  - `lib/communities/server/plan-change.ts` 150, 160, 206, 277
  - `app/api/stripe/refund/route.ts` 117, 199
  - `app/api/admin/orders/refund/route.ts` 71, 161, 202
  - `lib/notifications/format.ts` 9
  - `lib/checkout/invoice.ts` 373, 422
- Most only apply when Stripe returned no currency, which it always does. Each should become an explicit failure, or the record's own currency.

**F13. Column defaults that guess.** *(Verified)*
- `orders.currency DEFAULT 'usd'`, `orders.variant_currency DEFAULT 'USD'`, `membership_plans.currency DEFAULT 'usd'`.
- Free orders are written with `currency: "usd"` (`app/api/checkout/quick-free/route.ts`, `app/api/checkout/process/route.ts`). The amount is 0 so no money is wrong, but a lei store's free order says USD.

**F14. Three sources of exchange rates.** *(Verified)*
- `lib/markets/fx-server.ts` (ECB daily, stored per day in `fx_rates`) is used by websites, the wallet and currency changes.
- `lib/exchange-rate.ts` (Frankfurter, 1 hour cache, with a fallback derived from Stripe) is used only by cash out.
- `lib/i18n/currency.ts` holds a static table (`RON: 4.6`) whose comment says products are stored in USD cents. That is no longer true. Only `formatPlatformMoney` is still imported from it, but the table invites misuse.

**F15. Airwallex refund fallback to USD.** *(Verified, inert code)*
- `lib/payments/refunds.ts` 59: `fee?.currency ?? "USD"`. Not reachable while Stripe is the only processor. Make it refuse instead, so it is safe if Airwallex is ever switched on.

### What is already right (keep it)

- **Orders keep their own currency.** Orders store the currency they were charged in, and the dashboard draws each order in it (`lib/orders/money.ts`).
- **Store currency changes never touch history.** The change is one transaction, idempotent per request key, snapshotted, and undoable for the latest change. It converts catalogue, shipping, coupons and COD fee only, never orders, refunds, invoices or payouts (SQL part 176). It also clears the Explore cache, store tags and published sites (`app/api/store/currency/route.ts` 255-259).
- **Refunds can't go out in the wrong currency.** Stripe always refunds in the charge's currency, and refunds are idempotency-keyed.
- **The wallet never adds a number it couldn't convert.** It converts at the ECB rate of the day, and leaves a line in its own currency rather than writing a wrong number (`ledger-currency.ts`).
- **Payouts show real balances.** The Payouts page uses the real Stripe balance and its currency (`lib/payments/display-currency.ts`).
- **Stale prices are refused.** Community programs and events refuse a checkout when their stored currency no longer matches the charge (`learn-checkout.ts` 150, `event-checkout.ts` 173). Physical checkout refuses to reuse a payment after a currency change (`checkout-server.ts` 329-335).
- **Unsupported currencies are refused up front.** The fee engine refuses any currency it has no rule for, and selling currencies are limited to two-decimal currencies Stripe charges.
- **Physical order emails use the checkout's own currency** (`lib/physical/jobs-server.ts`).

---

## 5. Recommended architecture (Option A)

Built on what exists. No new provider, no new rate source, no new setting for merchants.

### 5.1 One question decides the currency: which side of Storelib is selling?

A single pure function, `pricingContext(surface)`:

- **merchant**: `/app`, the merchant's website (live and builder), OnePage, a checkout link the merchant shared, a website basket. Store currency.
- **marketplace**: Explore, category pages, creator profile, `/p/[slug]`, community pages and their checkouts, recommendations and "More from", marketplace cross-sell. **USD.**

The surfaces already exist (`lib/orders/order-source.ts` `SURFACES`: website, profile, onepage, product, explore, link, admin). Today they only label analytics. They become the input, decided **on the server** from the page that rendered the price, never from a URL parameter alone.

### 5.2 One converter: the marketplace price

`marketplacePrice(product, variant)` returns `{ amountMinor, currency: "USD", source, storeAmountMinor, storeCurrency, fxAsOf, rate }`:

1. If the merchant set a **fixed USD price** for this product (optional, merchant-approved), use it exactly. `source: "fixed"`.
2. If the store already sells in USD, the price is used as is. `source: "native"`.
3. Otherwise convert with the ECB rate of one day (`fx_rates`, `convertMinor`), rounded half-up **to the cent only**. No psychological rounding. `source: "converted"`.
4. If no fresh rate exists (`fxFresh` false, older than 4 days), **no USD price is invented**. See decision D2.

The same function is used by every marketplace card, page, recommendation and checkout, so the same product reads the same everywhere.

### 5.3 Locking the price through payment

- The page's quote carries `fxAsOf` (the rate date it used).
- The checkout route recomputes the price itself from the database and that day's **immutable** `fx_rates` row. It accepts only the latest or the previous published day, never a date the buyer picks freely.
- The PaymentIntent is created for exactly that amount.
- If the quote is too old, the checkout answers "price updated" with the new amount **before** any charge. It never silently charges a different number.
- The PaymentIntent metadata and the order record:
  - `pricing_context`
  - `charge_currency` / `charge_amount` (the existing `currency` / `amount_cents`)
  - `list_currency` / `list_amount` (the creator's own price)
  - `fx_rate`, `fx_as_of`, `price_source`
- Everything after (receipt, emails, invoice, refund, dispute, analytics) reads the order, never the store's settings.

### 5.4 Subscriptions

Stripe Prices are fixed amounts, so a recurring USD price must not drift with the rate:

- **Existing plans** are already USD and keep billing exactly as they do.
- **New and edited plans:** the editor shows the store-currency equivalent as a suggestion ("$10.65 a month on Storelib"). The creator confirms or types their own USD price. That confirmed USD price is the fixed Stripe Price.
- **Renewals** never re-convert.

### 5.5 Reporting

`reportAmount(order, storeCurrency)`:

- An order in the store currency counts as is.
- Any other order is converted at the ECB rate of **the order's date** (the previous published day for weekends and holidays).
- The result is cached per order. The order row is never changed.
- Report totals say "converted" when any line was converted. Order lists always show the original amount.
- A sale with no historical rate is shown separately as "not converted", never estimated.

This needs **historical rates**: `fx_rates` only has rows since the daily cron started, so a one-time backfill from the ECB's published history file is required (7.2).

### 5.6 Everything after payment

- **One currency source.** Emails, invoices, receipts, push and in-app notifications take the currency from the order or charge, through one helper. If it is unknown, they hold and flag.
- **Payout records** are written from Stripe's payout object.
- **The ledger** is converted with ECB rates like everything else (no Frankfurter).

### 5.7 Caching

- Marketplace prices depend on the product, the store's currency and the rate date. Caches are tagged with the existing `FX_TAG` (cleared when new rates arrive) and the existing store currency tags (already cleared on a currency change).
- The checkout never reads a cached price or rate.

### 5.8 The settings notice

Short, under the currency selector in **Settings › Store details**, in the existing grey helper style (13px, `#6b7280`, no icon, no banner):

> Explore and the Storelib marketplace show prices in US dollars, so buyers in every country see one currency. Your store, website and dashboard stay in {currency}.

For a USD store, the second sentence is dropped. It is not shown anywhere else.

---

## 6. Implementation plan

Each phase ships on its own, behind a server-side flag where it touches charging, with tests written first.

**Phase 0: safety net (no behaviour change)**
- Write the tests in section 9 against today's code, and mark expected failures.
- Add a read-only reconciliation script for past orders (7.3).
- Add a build check that fails on a new `"usd"` literal in money folders.

**Phase 1: fix what is wrong regardless of Option A**
1. F6: one store-currency reader (Taxes, email previews and tests, Store details).
2. F7: email currency from the order or charge, held and flagged when unknown.
3. F8: currency in the webhook's minimal insert.
4. F9 and F10: payout records from Stripe, ledger in its own currency, push in the right currency, Frankfurter retired.
5. F2: write `currency = 'USD'` on every plan save, and draw membership prices from the plan everywhere.
6. F1: one-time community tiers priced and charged in USD (the community side of Option A, done first because it is a live mismatch).
7. F12, F13, F15: fallbacks become explicit failures. Free orders use the store currency.

**Phase 2: reporting in the store currency**
- Backfill historical ECB rates.
- Add `reportAmount`, and wire it into Home, Analytics, the analytics SQL totals and Customers. Show the "converted" marker.
- Must ship before Phase 4.

**Phase 3: marketplace shows USD (flag: display only)**
- `pricingContext` + `marketplacePrice`.
- Wire into Explore, category pages, carousel, creator pages, `/p/[slug]`, communities, recommendations.
- Checkout still charges the store currency in this phase, so cards show "≈ $X" until Phase 4 is on.

**Phase 4: marketplace charges USD (flag: charging, rolled out to a creator allowlist first)**
- Quote lock (5.3) in `stripe-session` and `cart`, community events, programs and modules.
- Order fields, metadata, emails.
- Fee rule USD (exists), USD minimum charge (exists).
- Remove the "≈" once on.

**Phase 5: optional fixed USD prices + the settings notice + cleanup**
- Per-product "Price on Storelib" field (hidden behind "Set a fixed US dollar price", off by default).
- Remove the static rate table.

---

## 7. Migration requirements

All additive. Nothing deletes or rewrites a stored amount.

### 7.1 Schema (one new SQL part)

- **`orders`** (all nullable, so older rows simply have none):
  - `pricing_context text CHECK (pricing_context IN ('merchant','marketplace'))`
  - `list_currency text`, `list_amount_cents integer`
  - `fx_rate numeric(24,12)`, `fx_as_of date`
  - `price_source text CHECK (price_source IN ('native','converted','fixed'))`
- **`products`**: `marketplace_usd_cents integer CHECK (marketplace_usd_cents IS NULL OR marketplace_usd_cents >= 0)`, plus `marketplace_usd_approved_at timestamptz`. The same pair on `product_variants`.
- **`membership_plans`**: no change. A backfill-safe `UPDATE … SET currency = 'usd' WHERE currency IS NULL` only (none expected, the column is NOT NULL).
- **`community_events`, `community_courses`, programs and modules**: they already carry `currency`. New prices are written in USD. Existing rows keep theirs, and the existing "price changed" guard refuses a mismatched checkout until the creator re-saves.
- **`report_fx_cache`** (`order_id`, `store_currency`, `amount_minor`, `fx_as_of`): optional, for speed.
- Column defaults that guess (`orders.currency DEFAULT 'usd'`) are **left as they are** in the schema. Every insert sets the currency explicitly, and a test enforces it. Changing a default under live inserts is riskier than the benefit.

### 7.2 Data

- **ECB history backfill** into `fx_rates`: one row per published day, `source = 'ecb-history'`. Dry run first; never overwrites an existing day.
- **No backfill of prices.** Marketplace USD prices are computed on read. Fixed USD prices only exist once a merchant sets one.

### 7.3 Historical orders with an unknown or suspect currency

- A read-only script lists orders where `currency` is null, or is `'usd'` on a path that could have defaulted (F8). For each one it asks Stripe for the PaymentIntent and compares currency and amount.
- **Matches are reported, not written.**
- After you approve the report, a second script writes only the rows Stripe proved, each one logged.
- Anything Stripe cannot prove stays as it is and is listed for manual review. **It is never assumed to be USD.**

---

## 8. Edge cases

- **Coupons:** a fixed coupon is in the store currency. On a marketplace checkout it is converted with the same locked rate as the price. A percentage coupon needs nothing. The minimum purchase is compared in the store currency, before conversion.
- **Taxes and VAT:**
  - Tax is computed on the converted USD amount with the same rules (`digitalTax`), so "included" stays included.
  - Membership tax stays on Stripe Tax or the creator's rate, as today.
  - Tax reports convert like revenue.
- **Shipping and COD on marketplace physical orders:** shipping converts with the same locked rate. Cash on delivery is not offered on a USD marketplace checkout, because the courier collects local cash. See decision D1.
- **Pay what you want and tips:**
  - The minimum is converted and rounded **up** to the cent, so the creator never receives less than their minimum.
  - The tip cap stays $1,000.
  - A typed amount is taken in USD as typed.
- **Stripe minimum charge:** USD 50 cents. Also checked against the creator's settlement currency after conversion (RON 2.00), so a tiny order is refused before charging.
- **Partial refunds:** in the charge currency, capped by what was charged, as today.
  - The wallet line converts at the refund day's rate, labelled.
  - Stripe's FX on refunds is borne by the platform (2.2).
- **Disputes:** always in the charge currency (`payment_disputes.currency` exists). No change.
- **Subscriptions:**
  - Renewals bill the fixed USD Stripe Price.
  - A store currency change never touches them.
  - Plan changes between different currencies stay refused (`plan-change.ts` 206).
- **Mixed baskets:** a website basket is one store and one currency, as today. A marketplace basket across stores is not offered. Each store checks out separately, as today.
- **Store changes currency mid-checkout:**
  - Marketplace: the locked USD quote stays valid, because it is computed from the store price the quote recorded, and the checkout re-checks it.
  - Merchant: the existing refusal stands.
- **Currencies with other decimals:** JPY, HUF and KWD stay refused for selling (`canSellIn`). The formatting helpers already use each currency's own decimals.
- **Rate outage:** see decision D2. A price is never invented.
- **Double conversion:** every amount carries its currency, and the converter refuses to convert from USD to USD or to convert an amount whose source currency isn't stated.
- **Webhook replays and races:** order creation is already idempotent per PaymentIntent. The new fields are written in the same insert, so a replay writes the same values.

---

## 9. Testing plan

### 9.1 Unit (pure, run in the push suite)

- **The converter:**
  - USD to USD is the identity.
  - RON to USD at a known rate.
  - EUR to USD.
  - A fixed price wins.
  - Rounding is half-up to the cent, and the minimum rounds up.
  - No rate means null, never a number.
  - An unstated source currency is refused.
- **`pricingContext`:** every surface maps to the right side, and an unknown surface maps to merchant.
- **Quote lock:**
  - The same `fxAsOf` gives the same amount.
  - A date outside {latest, previous} is refused.
  - A changed store price is refused.
- **`reportAmount`:**
  - A same-currency order counts as is.
  - A foreign order converts at its own day's rate.
  - A weekend order uses the previous business day.
  - With no rate, it is shown as "not converted".
- **The email currency helper:** reads the order, then the PaymentIntent, then holds.
- **Static checks:**
  - No `"usd"` literal in money folders.
  - Every `orders` insert sets `currency`.
  - Every `membership_plans` write sets `currency`.

### 9.2 Integration (Stripe test mode, test clocks for subscriptions)

1. **RON store, own website.** Product page, checkout, PaymentIntent, order, receipt page, buyer email, seller notification, push, refund (full and partial), refund email and dashboard are all in RON.
2. **RON store, EUR market visitor on the website.**
   - Everything for the order is in EUR.
   - Analytics shows it converted to RON and marked; the order still says EUR.
   - A rate update between page and Pay changes nothing (quote lock).
3. **EUR store, OnePage purchase.** Everything is in EUR.
4. **USD store, marketplace purchase from Explore.** USD with no conversion, `price_source = native`.
5. **RON store, marketplace purchase from Explore.**
   - The card, `/p/` page and checkout show the same USD amount.
   - The PaymentIntent is in USD, and the order is USD with `list_currency RON`, `fx_rate` and `fx_as_of`.
   - The receipt, emails and refund are in USD.
   - The creator's product price is unchanged.
   - The wallet line is converted and labelled.
   - Stripe's transfer to the creator arrives in their settlement currency.
6. **The same product** on Explore, the creator page, the community page, "More from" and checkout: one identical USD amount.
7. **Fixed USD price set:** used everywhere on the marketplace and ignored on the website.
8. **Community one-time tier (F1):** page, checkout and order all in USD.
9. **Membership:**
   - Subscribe, and the card shows the right USD per month.
   - Renew with a test clock: USD.
   - Change the store currency, then renew: still the same USD.
   - Upgrade and downgrade: USD.
10. **Failed payments:**
    - A declined card leaves no order. The coupon and sales-limit holds are released.
    - A 3DS failure behaves the same.
    - An async payment that fails later writes no order.
    - A failed renewal goes past due and the dunning email is in USD.
11. **Coupons and tax on a marketplace order:**
    - A fixed RON coupon is converted with the same rate.
    - Inclusive and exclusive VAT give the same totals as the page.
12. **Store currency change RON to EUR:**
    - Old orders, receipts, refunds, invoices and subscriptions are unchanged.
    - New website orders are in EUR.
    - Marketplace prices update within the cache window.
    - Undo works.
13. **Rate outage** (no `fx_rates` row for 5 days): marketplace behaves as decided in D2, and no USD price is invented.
14. **Cash out:**
    - The payout row equals Stripe's payout amount and currency.
    - The ledger stays in its own currency.
    - The push shows the right currency.
15. **Unknown-currency order** (seeded): the email is held and flagged, the refund route refuses with a clear message, and the reconciliation report lists it.
16. **Webhook replay** of the same PaymentIntent: one order, the same fields.

### 9.3 Browser checks

- Explore, a creator page, `/p/`, a community page, checkout, the receipt page, `/app` Home, Analytics, Customers, Payouts and Settings › Store details.
- Run at phone and desktop sizes, light and dark, in RON, EUR and USD stores.

---

## 10. Decisions I need from you

**D1. Physical products sold from the marketplace.**
- **Recommended:** charge USD like everything else, convert shipping with the same locked rate, and don't offer cash on delivery there.
- Alternative: keep physical marketplace sales in the store currency.

**D2. When no fresh exchange rate exists** (ECB down for more than 4 days, very rare).
- **Recommended:** the marketplace shows and charges that store's own currency for those days, with the normal "charged in RON" line.
- Alternative: pause marketplace checkout for non-USD stores until rates return.
- Never invent a rate.

**D3. Checkout links shared by a merchant** (the "link" surface) **and OnePage** count as **merchant** (store currency), as your rules say for OnePage. Confirm the links too.

**D4. Stripe's FX cost on marketplace sales is paid by Storelib** (destination charges). Options:
- **Recommended for now:** absorb it.
- Later: fold it into the marketplace fee for converted sales.

**D5. Production platform currency.** Confirm `NEXT_PUBLIC_PLATFORM_CURRENCY` in Vercel (I didn't read it), and confirm the cross-border recipient question with Stripe support (2.3).

---

## 11. What was built (round AM), and how to switch the marketplace on

Your answers to section 10, as built:

- **D1.** Physical products are sold on the store's website only, in its currency, with its shipping. They never appear on Explore, creator pages, communities, the wishlist or recommendations.
- **D2.** With no fresh rate (older than 4 days), a marketplace purchase **pauses** with a plain message. It is never switched to the store's currency.
- **D3.** Shared checkout links and OnePage use the store's currency. Only links from Storelib's own marketplace pages carry `ctx=mp`.
- **D4.** Stripe's FX cost is absorbed for now.
- **D5.** Still to confirm on your side (below).

### Where each phase lives

- **Phase 1 (bugs):** store-currency readers, emails, refunds, webhook, cash out, push, plan currency. No `"usd"` guesses remain in money paths (`tests/round-am.test.ts` pins them).
- **Phase 2 (plans):** `lib/money/product-currency.ts`. Membership and community plans are dollars everywhere.
- **Phase 3 (physical):** website only.
- **Phase 4 (reports):**
  - `lib/money/report-currency.ts` (pure) and `report-currency-server.ts`.
  - Home, Analytics (with a "converted" note), Customers, the revenue chart and Payouts all report in the store's currency, each sale at its own day's ECB rate.
  - The 1099-K figures are converted to dollars.
  - The daily cron keeps ECB history (`refreshHistory`).
- **Phase 5 (marketplace, off by default):**
  - `lib/money/marketplace.ts` (pure rules) and `marketplace-server.ts` (switch, rates, list pricer, product page quote).
  - Explore, categories, creator pages, `/p/`, the wishlist and the checkout.
  - `priceOrder` charges the dollar quote at the rate day the page showed (`fxAsOf`).
- **Phase 6:**
  - Optional creator-approved dollar price (`/api/products/marketplace-price`, editor card).
  - The Settings note, which appears only when true.
  - The order pricing record (one metadata key, then `orders.pricing_context` and the columns after it).
  - SQL part 244.
  - The static rate table and `/api/fx` removed.
  - `scripts/reconcile-order-currency.mjs` (read only).

### Switching it on, in order

1. **Run SQL part 244** (`supabase/sql/run-now/244_marketplace_pricing.sql`, or the run-four files). It only adds columns.
2. **Confirm with Stripe, for the platform account:**
   - USD charging is enabled.
   - The USD settlement currency and its payout bank account.
   - Destination charges in USD to connected accounts in Romania, the EU, the UK, Canada and Australia, including any cross-border restriction on the recipient agreement (section 2.3).
3. **Confirm `NEXT_PUBLIC_PLATFORM_CURRENCY` in Vercel** (production, preview, development).
4. **Run the reconciliation report** with production keys: `node scripts/reconcile-order-currency.mjs`. Look at every "unknown" or "differs" row. Nothing is changed by it.
5. **Turn it on for one store first.** In Vercel, set the server-only variable `MARKETPLACE_USD` to that store's creator id. Never use a `NEXT_PUBLIC_` variable for this. Buy one product from Explore with a test card, then check:
   - the card, product page, checkout, receipt and refund amounts;
   - the order's `currency = usd` and its `pricing_context`.
6. **Widen gradually:** a comma list of creator ids, then `all`. Setting it to `off` (or removing it) puts every page back on the store's own currency at once. Orders already made keep the currency they were charged in.

## 12. Before any store is switched on (round AN)

`MARKETPLACE_USD` stays unset. Nothing below turns anything on.

### Fixed

- **Stripe's 50 metadata keys.**
  - A business buyer's details now take 3 keys instead of 8. Payments made before the change are still read the old way.
  - `lib/checkout/stripe-metadata.ts` checks every payment before Stripe is called. Only the buyer's device (type, system, browser) may be left out to make room. If a payment still does not fit, it is refused before anything is charged, and its coupon and stock holds are let go.
  - Worst cases, measured in `tests/round-an`:
    - single product with a business buyer, a coupon hold, a sale hold and the marketplace record: within 50;
    - a full 50-line website basket with a code, tax and a business buyer: within 50.
- **Emails with no known currency are held, never sent with a guess.** `lib/money/held-email.ts`. Each one is flagged on the admin Health view with its order.
  - Notification engine: skip reason `CURRENCY_UNKNOWN`.
  - Receipt and receipt copy.
  - The seller's sale email.
  - The refund email.
  - The in-app bell drops the number instead of printing a bare one.
- **Translations.** The paused purchase, "Back to the product" and the too-large refusal are in all 9 curated checkout languages. The paused page reads the buyer's browser language.

### Verified

- **SQL 244**, rehearsed on PostgreSQL 16 with 200,000 stand-in orders:
  - 59 ms;
  - no table rewrite (same relfilenode);
  - existing rows byte-for-byte unchanged;
  - safe to run again;
  - skips cleanly on an empty database;
  - the checks accept what the app writes and refuse bad values;
  - the migrations copy is identical.
  - In production, run it with `SET lock_timeout = '5s';` first, so a busy `orders` table makes it wait and retry rather than queue other writes behind it.
- **Vercel.** The environment variables could not be listed through the connected account (403), and no value was read.
  - Live Explore shows `$` for stores that never chose a currency, so production's platform currency resolves to USD.
  - Live Explore links carry no `ctx=mp`, so the switch is off.
  - Admin › Payments › Configuration now shows both settings.
- **Reconciliation script.** Proven read-only (GET requests only) against a local stand-in. It needs the production keys, so it has not run against production.
  - New `--prices` option: it lists products of stores that never chose a currency whose price is a whole number times 4.6.
  - Live Explore shows prices like this: $165.60 (36 × 4.6), $312.80 (68 × 4.6), $18.40 (4 × 4.6). They may be lei amounts charged as dollars. Not changed; to look at.
- **One store end to end** (`tests/e2e-marketplace-usd`, real routes, simulated Stripe with signed webhooks):
  - **Switch off:** an Explore link still charges lei.
  - **Switch on for one store:**
    - the website or shared link charges 49.00 lei;
    - Explore charges $10.65 at the day's ECB rate;
    - the order records `pricing_context`, list price, source and rate day;
    - receipts and sale emails show each sale in its own currency;
    - the ledger keeps the platform wallet currency, with "from 49.00 lei";
    - the revenue chart is in lei, with the dollar sale converted at its day's rate;
    - the Payouts tax total is in dollars.
  - **Stale rate:** 409, Stripe not called.
  - **No rate:** 503, Stripe not called; the website still sells in lei.
  - **Another store not in the switch:** keeps its lei.
  - **Refund:** a $5.00 refund on the dollar charge, refund email "$5.00", the chart's refund converted to lei.

### Found, not changed

- **Revenue chart, partial refunds.** An order with any refund drops out of gross entirely and only its refund is subtracted. This happens in every currency and predates this work. Proposed fix: count the order's gross, and subtract the refunded part.
