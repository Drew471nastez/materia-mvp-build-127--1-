# Storelib ecommerce audit, round AW (13 November 2026)

What was checked, what was wrong, what is fixed, and what is still open. The
shipping side has its own file: `STORELIB_PHYSICAL_COMMERCE_AUDIT.md`.

## How it was done

Eight read-only audits ran over separate areas (physical checkout, orders and
fulfilment, payments, customer emails, analytics, selling surfaces, tenant
isolation and integrations, digital delivery and memberships). Every finding
below was then re-read in the code before anything was changed. A finding
marked "suspected" was not confirmed and is listed as open.

Nothing here was tested against live Stripe, Shippo, EasyPost or Mailgun.
There are no sandbox keys in this environment. Provider behaviour is proven
against stubs of their documented answers, which is how this repository's
suites already work.

## Baseline, before any change (commit 58935f6b)

| | |
|---|---|
| Test suite | 1,098 suites. 4 fail: `admin-seo-console-r44`, `agent-loop`, `auth-session`, `sites`. None is commerce. |
| Production build | Succeeds. Peak memory 7,884 MB RSS (7,588 MB PSS) on 4 CPUs, over the 7,600 MB limit `scripts/ci/measure-build.mjs` enforces. |
| Bundle budgets | Already over on 8 routes and on server output (453 MB against a 240 MB budget set on 15 October). |
| GitHub CI | Every job on `main` has ended within two seconds, with no log, since at least run 821. The jobs never start. That is what GitHub does when an account is out of Actions minutes or has a billing hold. Nothing has been gating `main`. |
| Vercel | Production deployments from `main` are READY. |

## Fixed in this round

### P0

| # | What was wrong | Fix |
|---|---|---|
| 1 | A membership checkout reused whichever Stripe customer already had the typed email. Anyone could start a checkout with another person's address; the card portal of that row then opened that person's billing history and saved card. | A customer is reused only from a membership whose `buyer_id` is the signed in caller. `lib/memberships/billing.ts` `customerToReuse`. |
| 2 | An account made with somebody else's address (Supabase stamps it confirmed with nothing proven) found that person's guest membership by email, read the posts, and became its owner. | An address finds a guest's membership only when the account proved it. `lib/memberships/viewer.ts` `provenViewer`, on the API routes, the library pages, the product page and the membership checkout. |
| 3 | A community's one-time plan could be paid through the website basket: $49 charged as 49 of the store's currency, once, with no join check. Memberships the same. | `priceCart` drops both. `lib/checkout/pricing.ts`. |

### P1

| # | What was wrong | Fix |
|---|---|---|
| 4 | A refund that Stripe settled later (pending, then succeeded) wrote the lines and stopped. A shipping order kept reading Paid, the buyer got no email, stock stayed committed. | `refund.updated` runs everything `charge.refunded` does. `app/api/stripe/webhook/route.ts` `settleChargeRefund`. |
| 5 | A shipping order only caught up with its refund when the browser came back to say so. A closed tab, or a refund in cash (no webhook), left it stale. | The Refund route restates the order itself. `restateCheckoutRefunds`. |
| 6 | A receipt or a seller's new-order email that failed to send was recorded as done and never retried. | A send that did not go fails its step, and the ten minute sweep sends it. `lib/checkout/followups.ts` `sent`, three call sites. |
| 7 | A paid basket (and a paid shipping order) was dropped for good when Stripe could not be read during its webhook: any error was answered as "not found", so the webhook said 200 and Stripe never retried. | Only a missing session is a 404. Anything else is a 503 and Stripe sends the event again. |
| 8 | A Stripe hiccup after Cash out locked the wallet left it "in transit" for ever. | The lock is undone before answering. `app/api/stripe/cashout/route.ts`. |
| 9 | Members' files stayed downloadable for ever through the one-time download door, because every paid month writes an order. | The download door refuses a membership product's files to anyone but the creator. |
| 10 | `PUT /api/collections/<id>` with another store's collection id emptied that store's collection. | Not found unless the collection is the caller's. `lib/physical/collections-server.ts`. |
| 11 | The same option on two cart lines (two engravings) could never be paid: the database refused the second stock hold as a repeat. | Holds are merged per option and place. `mergeHolds`. |
| 12 | A cancelled order could still be emailed to a supplier or posted to the seller's webhook by a job that had been waiting out a failure. | Both check the order first. `notToShip`. |
| 13 | A return opened as "Keep it, no need to send" told the buyer to post it back and restocked it. | The method is read: no address, no restock, closes without a parcel. |
| 14 | A cash on delivery order on the storelib.com checkout never fired `purchase`. | The order page opens as just placed. |
| 15 | The Courier tracking card said "On" for every store, also with no tracking key set. | It follows whether parcels are actually followed. |
| 16 | The default theme printed a 30 day refund promise and two invented five star reviews marked verified on every new store's product page. | Removed. |

### P2 and P3

One refund email per press instead of one per line. A declined-card email no
longer goes after the buyer paid on a fresh try. A parcel refused at the door
no longer gets "pack the items and send them back" and "if you were charged".
A company name reaches every email's address. A duplicate purchase refunded
once keeps the library entry. A part refund whose amount write was lost no
longer reads as a full refund. Storelib's own admin refund no longer emails
twice. The loser of the paid race is no longer told "failed". A once per
customer code counts a partly refunded order. A
ShipStation shipment naming only shipped items ships nothing more, and
ShipStation's numbered hosts are accepted. A corrected tracking number starts
from no carrier state. The packing slip pile leaves out fully shipped orders,
numbers a parcel among the live ones, and answers not found for another
order's shipment. A carrier price is kept under the postcode however it was
typed. The label apps' card now says an address is sent at checkout for a
carrier calculated rate.

## Tests

Two new suites: `tests/labels-safe-aw.test.ts` (69 checks) and
`tests/commerce-aw.test.ts`. Seven existing assertions were changed on
purpose and say why in place. The full run and the build figures are in
"Verification" at the end of this file.

## Still open

These are real, confirmed unless marked, and not fixed. Each needs either a
decision from you or a larger change than a safe batch allows.

### Needs your decision

1. **Refunds and the platform fee.** A refund uses `reverse_transfer` without
   `refund_application_fee`, so Stripe takes the whole amount back from the
   seller and Storelib keeps its fee. The ledger records the seller giving
   back only what they were paid. On a $100 sale with a $5.25 fee the seller's
   Stripe balance ends at minus $5.25 while the wallet reads 0. Either refund
   the fee too (one line), or post the full amount in the ledger. This is fee
   policy, so I left it. The sold-out auto refund has the same effect: a
   seller pays the fee on a sale Storelib refused.
2. **Fee base.** Digital checkouts take the fee before added tax. The shipping
   checkout and memberships take it on tax (and delivery) as well.

### Confirmed, larger than this round

3. A line refunded before it ships keeps its units reserved, and the order
   can never finish. Needs a per-line stock release.
4. A print partner's second parcel is dropped: the first tracking number
   ships everything.
5. An address changed after an order went to a partner reaches the buyer
   only, never the partner.
6. A buyer's own stock hold is counted against them after a declined card
   when stock is under twice the quantity.
7. Cash on delivery places the order at a total the page never showed when a
   rate changed between quote and Place order.
8. A carrier calculated rate is priced once per shipping profile, each time
   for the whole cart's weight.
9. A dispute on a ticket, program, module or tip debits a wallet those sales
   never entered.
10. The hold release pays out more than the sale put in pending (needs a SQL
    part).
11. Removing a digital option hands its buyers every file of the product.
12. A discount link, and a code applied in the cart, are erased on the next
    page load of a website.
13. A website Buy link on a product with several options picks one for the
    buyer.
14. Payouts' revenue card reads only the oldest 1,000 order lines.
15. A digital sale on storelib.com or a OnePage has one id in the browser
    and another on the server, so a store with both the tag and a destination
    can count it twice. I wrote the fix and backed it out: an existing suite
    pins the server id as the thank you page's, so the two pages need one rule
    first. A course can be bought at a quantity above 1 for one enrolment;
    also pinned by an existing suite, so left.
15b. The purchase event omits shipping, tax and coupon; `begin_checkout` fires
    more than once on the website checkout.
16. Email platform cards promise refund events for downloads; none is sent.
17. An integration never leaves "connected" when its key is revoked.
18. The orders-to-ship CSV lists items that already shipped.
19. Two Fulfill presses at the same moment with different keys can ship the
    same unit twice.

### Suspected, not confirmed

20. Dispute take-back mixes currencies when the transfer is not in the
    charge's currency.
21. Omnisend's adapter uses an address and auth scheme that could not be
    confirmed against Omnisend's published API.
22. A chargeback leaves the membership running.

### Cannot be proven from this repository

`supabase/schema/` is empty, so production's row level security could not be
read. As written in the SQL parts, no commerce table lets one store read or
change another's, and no audit found a route that does. To confirm what
production has, run `supabase/sql/run-now/99_check_after.sql` and read the
rows for parts 62 and 334.

## Verification

Run on the merged tree, 14 November 2026.

| | Result |
|---|---|
| Full test suite | 1,101 suites. One failed, a source-text assertion on a variable I had renamed; fixed, and every suite that reads that file was run again (44 suites, all pass). The four suites failing at the baseline pass now on current `main`. |
| New suites | `labels-safe-aw` 69 checks, `commerce-aw` 44 checks, all pass. |
| Translations | Dashboard 100% in six languages; email sentences regenerated. |
| Lint | Clean on the changed scripts. |
| Type errors | 373, the same as `main` before this round (the baseline file says 313; 44 files had already regressed on `main`). This round adds none. |
| Production build | Succeeds. Peak memory 8,252 MB RSS, 7,600 MB PSS, against a 7,600 MB gate. Before this round, same machine: 7,884 MB RSS, 7,588 MB PSS. The gate was already failing; the proportional figure moved by 12 MB. |
| Bundle sizes | Within 0.1 KB of the baseline on every route. Already over budget on 8 routes before this round. |
| Not verified | Nothing was run against live Stripe, Shippo, EasyPost or Mailgun. No real browser pass on storelib.com/app behind sign in: there is no account session here. |

The container restarted once during verification (two heavy jobs at once).
Nothing was lost; the suite and the build were then run one at a time.
