# Storelib money audit (18 October 2026)

Read-only audit. **No money code was changed.** Everything below is a
finding or a proposal waiting for approval.

The goal it was measured against:

- **Store currency** (for example RON) runs the merchant's own operations:
  dashboard, products, analytics, revenue charts, OnePage, the website
  builder, shipping, discounts and settings. The merchant's own website sells
  in it and keeps its existing currency selector.
- **The public Storelib ecosystem** (Explore, creator pages, marketplace
  product pages, communities) shows USD, converted correctly, without
  silently changing what the creator priced.
- **The checkout currency governs the whole transaction.** A purchase paid in
  USD is USD everywhere after: checkout, order, receipt, confirmation email,
  refund, notifications. A website purchase paid in RON is RON everywhere.
  Transactional emails never take their currency from the store's default.
- Historical transaction currencies never change. Payout settlement
  currencies are kept. Reporting conversions are kept apart from real money
  movements. No double conversions, no wrong reading of amounts.

---

## 1. How money works today (the short version)

There are four currencies in the code, and the files describe them well:

| Currency | Where it lives | What it is for |
|---|---|---|
| Selling currency | `store_settings.currency` (SQL part 176), `lib/store/selling-currency*.ts` | What a store prices and charges in |
| Visitor / display currency | `lib/markets/*` | A converted estimate on the website, or a real charge in a market's currency (`lib/markets/checkout-charge.ts`) |
| Payout / settlement currency | Stripe balance, `lib/payments/display-currency.ts` | Where the money lands |
| Platform / wallet currency | `NEXT_PUBLIC_PLATFORM_CURRENCY` (RON unless set to USD), `lib/payments/fees/currency-rules.ts`, `lib/payments/ledger-currency.ts` | The seller wallet ledger, fees |

Things that are already right and should be kept:

- Orders store the currency they were charged in (`orders.currency`), and the
  dashboard draws each order in it (`lib/orders/money.ts`).
- Physical order emails (confirmation, cancelled, refund) use the checkout's
  own currency (`lib/physical/jobs-server.ts` 643, 761, 764).
- The wallet converts each sale and refund into the wallet currency at the
  ECB rate of the day, and marks a line it could not convert instead of
  writing a wrong number (`lib/payments/ledger-currency.ts`,
  `lib/checkout/fulfil-payment.ts` 613, `lib/stripe/refund-sync.ts` 157).
- Changing a store's currency is one database transaction. It either keeps
  or converts the catalogue at a rate the merchant saw, can be undone within a
  day, and never touches orders, refunds, invoices or payouts
  (`app/api/store/currency/route.ts`, SQL part 176).
- Payouts show real balances and payouts in the currency Stripe holds them
  in, with no display conversion (`lib/payments/display-currency.ts`).
- Community lessons and programs refuse a checkout whose stored currency no
  longer matches (`lib/communities/server/learn-checkout.ts` 150).

---

## 2. Findings

Severity: **High** means a customer or merchant can see a wrong amount, or
money can move in the wrong currency. **Medium** means it's inconsistent and
can become High. **Low** means tidy-up.

### F1. Three different "store currencies" (High)

The same idea is read from three places:

1. `store_settings.currency`, the selling currency. Checkout, the website,
   product pages and the cart use it (`readStoreCurrency`, about 30 files).
2. `creators.payout_currency`, which defaults to `"USD"`. It is read as the
   store currency by:
   - `app/api/store/taxes/route.ts` 19-29 and `app/api/store/taxes/overview/route.ts` 22-23 (tax thresholds and totals)
   - `app/api/store/emails/route.ts` 30-44, `emails/test/route.ts` 54-72, `emails/preview/route.ts` 26-38 (customer email previews and test emails)
   - `app/api/store/settings/route.ts` 26-42 (the `currency` the Store details screen is given)
   - and it is described as the base currency in `lib/markets/money.ts` 8 and `lib/store/currency.ts` 14
3. `SHOP_CURRENCY`, the deployment's platform currency (`lib/store/shop-money.ts`). It is used as a store's currency by:
   - `components/onepage/tabs/links-tab.tsx` 412, 4129, 7328, 7390 and `products-tab.tsx` 378 (OnePage prices)
   - `components/website-builder/compat/compat-section-preview.tsx` 118 (imported-theme previews)
   - defaults in `components/physical/ui.tsx` 135, `lib/checkout/coupons.ts` 80/153, `lib/checkout/basket-decision.ts` 71, `lib/receipts/rules.ts` 207, `lib/search/app-search.ts` 146

**What goes wrong.** Take a store selling in EUR whose payout currency is still
the default USD. The Taxes tab, its thresholds and the email previews say USD.
OnePage shows lei on a lei deployment, while the store's own website shows
euros for the same product.

**Proposal.** One reader for the store currency (`readStoreCurrency`) used
everywhere the merchant's own operations are drawn. `payout_currency` is used
only for payouts. `SHOP_CURRENCY` is used only as the fallback for a store
that never chose one.

### F2. Analytics and the dashboard add up different currencies (High)

`lib/analytics/home-figures.ts` 97 (`homeTotals`), `lib/analytics/reports.ts`
1075 and `lib/analytics/creator-orders.ts` (`creatorSalesTotals`) sum
`amount_cents` across orders with no currency check. Since market checkout can
charge a visitor in their own currency (`lib/markets/checkout-charge.ts`), a
RON store can have EUR orders. Their cents get added to lei as if they were
lei.

**Proposal.** Reporting converts each order into the store currency at the
ECB rate of the order's day, using the same rates the website uses. Report
lines say "converted", and the original amount stays on the order. Totals are
never stored back onto orders. This is a reporting conversion, not a money
movement.

### F3. Transactional email fallbacks use the wrong currency (High)

- `lib/email.tsx` 527-529: when a receipt cannot be read, the fallback
  receipt prices the purchase in the **store's** currency
  (`readStoreCurrency`), not the currency it was charged in.
- `lib/email.tsx` 665: `first?.currency || sale.currency || "usd"`, a silent
  USD default.
- `lib/email.tsx` 1714-1729: the refund email formats with
  `currency || "USD"`.
- `lib/payments/refunds.ts` 59: `fee?.currency ?? "USD"`. If the fee row is
  missing, the refund is **created** in USD for a charge that may have been
  in RON. The provider would refuse it, or worse, refund the wrong amount.

**Proposal.** Every transactional email and refund takes its currency from
the payment record (PaymentIntent/charge, then `orders.currency`, then the
checkout row). If none is known, the email is held and flagged, not sent
with a guessed currency. A refund with no recorded currency is refused, with
a clear error.

### F4. 77 hard-coded `"usd"` fallbacks in money paths (Medium)

These are in `lib/checkout`, `lib/payments`, `lib/stripe`, `lib/orders`,
`lib/receipts`, `lib/memberships`, `lib/communities/server`,
`app/api/checkout` and `app/api/webhooks`. Examples:

- `lib/checkout/fulfil-payment.ts` 169, 242, 268, 463
- `lib/memberships/billing.ts` 66, 86 (a plan with no currency is billed in USD)
- `lib/communities/server/membership-lifecycle.ts` 234, 466, 480. Line 484 also
  picks the most common currency in a refund summary and drops the others
  from its total.

On a lei deployment, every one of these is a wrong-currency default.

**Proposal.** Replace each with the platform currency (`platformChargeCurrency()`)
where a currency truly can't be known, or with an explicit failure where
money moves. Add a test that fails the build on a new `"usd"` literal in
these folders.

### F5. The public ecosystem shows each store's own currency, not USD (Medium, decision)

Explore, category pages, creator pages and marketplace product pages print a
product in its store's currency (`components/platform/price-currency.tsx`,
`components/explore/product-card.tsx` 155-269, `lib/pricing/list-price.ts`).
So a lei store shows "49 lei" on Explore. The goal says USD.

### F6. A marketplace purchase is charged in the store's currency (Medium, decision)

`app/api/checkout/stripe-session/route.ts` 154-204 and
`app/api/checkout/cart/route.ts` 263-414 charge the store's selling currency.
So a product shown in USD on Explore (after F5) would be charged in lei. The
goal says the checkout currency governs the transaction, so this needs a
decision (see section 3).

### F7. Two live exchange-rate sources and one static table (Medium)

- `lib/markets/fx-server.ts`: ECB daily rates, stored in `fx_rates`. Used by
  the website, store currency changes and the wallet.
- `lib/exchange-rate.ts`: the Frankfurter API with a 1 hour cache, falling
  back to a Stripe-derived rate. Used by `app/api/stripe/cashout/route.ts`.
  So cash-out converts with a different rate than the wallet it is paying out.
- `lib/i18n/currency.ts`: a **static** table (`RON: 4.6`, `EUR: 0.92`). Its
  comment says products are stored in USD cents, which is no longer true.
  `components/locale-provider.tsx` imports it.

**Proposal.** One source of rates, the ECB `fx_rates` table, behind one
function. Retire the static table, or keep it only for a clearly labelled
offline estimate that never reaches a price a buyer pays.

### F8. Store details reads the wrong currency (Low)

`app/api/store/settings/route.ts` 42 returns `currency: payout_currency`.
This is fixed as part of F1.

---

## 3. Decisions needed from you

1. **Marketplace charge currency (F5 and F6).** Two clean options:
   - **A. Show USD, charge USD (recommended for the public marketplace).**
     Explore, creator pages and marketplace product pages show USD,
     converted from the creator's price at the ECB rate of the day and
     rounded for display. The checkout quotes the USD amount, locks it for
     the session, and charges USD. The order, receipt, emails and refunds
     are all in USD. The creator's price is never edited. The wallet
     converts USD into the wallet currency like any other foreign sale.
     Trade-off: the creator receives an amount that moves slightly with the
     rate.
   - **B. Show USD as an estimate, charge the creator's currency.** Pages
     say "≈ $10.65", and checkout says "You'll be charged 49 lei". Simpler
     and safer for creators. The trade-off is that the buyer's statement is
     in lei.
2. **The fallback when a currency is unknown (F3 and F4).** I recommend
   refusing or holding over guessing, everywhere money moves.
3. **Reporting conversion (F2).** Convert into the store currency at the rate
   of each order's day (recommended), or show one total per currency.

---

## 4. Migration requirements

- **No change to stored amounts.** `price_cents`, `orders.amount_cents`,
  ledger rows and payouts stay as they are. Historical currencies are
  immutable.
- **Backfill `orders.currency`** where it is null, from the Stripe charge
  (or the checkout row), in a dry-run-first script that reports what it
  would write. Rows it can't prove are left null and listed.
- **Option A only:** add `charge_currency`, `charge_amount_minor`,
  `fx_rate` and `fx_rate_date` to marketplace checkout sessions and orders.
  The quote shown is then the amount charged, auditable later.
- **F1:** no data change. `payout_currency` keeps its meaning. Readers move
  to `readStoreCurrency`.
- **F7:** retire `lib/exchange-rate.ts` after cash-out moves to the ECB
  rates (no schema change; `fx_rates` already exists).

---

## 5. Risks

- **Charging a different currency than shown.** This is avoided by locking
  the quote for the session and charging exactly it (option A), or by
  saying the charge currency before payment (option B).
- **Double conversion.** Each amount carries its currency, and converting
  checks the source currency first. The test matrix below covers this.
- **Rate gaps.** If no fresh ECB rate is available, marketplace display
  falls back to the creator's own currency with no estimate, and checkout
  charges in the creator's currency. A price is never invented.
- **Stripe minimums and decimals.** These are checked per currency
  (`minimumChargeMinor` exists).
- **Refunds.** These always use the original charge's currency and amount
  cap, never a recalculated one.
- **Webhooks and background jobs.** Scheduled emails, review reminders and
  membership renewals read currency from the record they are about, never
  from current store settings.

---

## 6. Test scenarios (each one written as an automated test before any change)

1. A RON store sells on its website. Checkout, order, receipt page, receipt
   email, seller notification, refund, refund email and dashboard are all in
   RON.
2. The same RON store gets a German visitor paying through the EUR market.
   Everything for that order is in EUR. Analytics shows it converted to RON,
   labelled, and the order still says EUR.
3. A marketplace purchase from Explore (option A). The product page shows
   USD, checkout charges USD, and the receipt, emails and refund are USD. The
   creator's product price is unchanged in RON. The wallet line is converted
   and marked.
4. The same purchase under option B. The page shows "≈ USD", checkout says
   RON before payment, and everything after is RON.
5. A store changes from RON to EUR. Old orders, receipts and refunds still
   say RON. New orders are EUR. Undo works within a day.
6. A refund on an order whose fee row is missing is refused with a clear
   message, never created in USD.
7. A receipt email whose receipt can't be read is held and flagged, never
   sent in the store's default currency.
8. A membership renewal for a plan created in RON renews in RON after the
   store switches to EUR.
9. A community program bought in USD on a lei deployment shows USD in every
   email and refund.
10. Cash-out uses the same ECB rate as the wallet line it pays out.
11. No `"usd"` literal remains in money paths (a build-time check).
12. A currency with zero decimals (JPY) or three (KWD) is refused for
    selling, as today, and display formats them with the right decimals.
