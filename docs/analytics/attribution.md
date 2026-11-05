# Attribution: where a buyer or a subscriber came from

Orders are the revenue source of truth. Attribution adds to an order, a
subscriber and a started checkout where the person came from (first touch and
last touch) and which property it happened on (the creator page, the OnePage,
or a specific Website Builder website). It never records, reads or changes an
amount: revenue, refunds and disputes are read from `orders` only.

Code:

| File | What it holds |
| --- | --- |
| `lib/attribution/touch.ts` | Pure, browser and server: what a touch is, the first/last rules, the 90 days, the wire format, every field check. |
| `lib/attribution/browser.ts` | The browser: first-party storage per scope, consent, carrying to checkout. |
| `components/attribution/capture-touch.tsx` | `<CaptureTouch>`: notes a visit as it arrives. |
| `lib/attribution/server.ts` | The server: checks what a page sent, resolves the property, carries it through Stripe, writes it once. |
| `supabase/sql/run-now/60_attribution.sql` | The columns, checks and indexes. |
| `tests/attribution.test.ts` | What this document promises, run against the real fulfilment code. |
| `scripts/check-attribution.mjs` | A real browser: Instagram, a website, Buy, the checkout request. |

## For the reports: the fields, exactly

### `orders`

| Column | Type | Meaning |
| --- | --- | --- |
| `property_type` | `text`, one of `creator_page`, `onepage`, `website` | The property the purchase came through. Null only for an order made before part 60 and for an admin test sale. |
| `property_id` | `uuid` | `creator_page`: the creator's id (`creators.id`). `website`: the website's install id (`store_theme_installs.id`, the published install the site renderer draws). `onepage`: `onepages.id`. Null when it could not be read in time; the type is still set. |
| `first_touch` | `jsonb` object or null | The first touch, see below. Null when nothing is known (a buyer who landed straight on checkout). |
| `last_touch` | `jsonb` object or null | The last touch. Null exactly when `first_touch` is null. Equal to `first_touch` when there was one touch. |
| `attributed_at` | `timestamptz` | When the attribution was written. Set on every order made after the deploy, including those with no touches. It is also the write-once guard. |

`orders.source` (`storelib` or `website`) is unchanged and always agrees with
`property_type`: `source = 'website'` if and only if `property_type =
'website'`. Both are worked out from the same value in the same request
(`purchaseProperty` in `lib/attribution/server.ts`). `orders.source_detail`
is unchanged.

A basket writes the same attribution onto every one of its lines, so revenue
grouped by source or property sums the lines as it sums amounts.

### `subscribers`

The same five columns: `property_type`, `property_id`, `first_touch`,
`last_touch`, `attributed_at`. `property_type` is the property the sign-up
happened on (a checkout opt-in takes the order's property). The first door
wins: once `attributed_at` is set, a later sign-up of the same address to the
same creator changes nothing, as with `source_detail`. An import, a manual add
or an API add is on no property and gets no attribution.

### `checkout_starts`

`property_type`, `property_id`, `first_touch`, `last_touch` (no
`attributed_at`). See "Checkout start" below for what a row is.

### A touch (`first_touch`, `last_touch`)

A JSON object. Keys other than `source` and `at` are present only when known.

| Key | Example | Meaning |
| --- | --- | --- |
| `source` | `social_instagram` | Always present. One of `direct`, `organic_search`, `paid_search`, `paid`, `email`, `affiliate`, `referral`, `social`, `social_<network>` with network one of instagram, facebook, threads, tiktok, x, youtube, pinterest, linkedin, snapchat, reddit, whatsapp, telegram, discord, twitch, bluesky, tumblr. The same words `analytics_events.source_category` uses (`lib/analytics/sources.ts`). |
| `referrer_host` | `l.instagram.com` | The referring host, lower case, without `www.`. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | `spring` | The tags, at most 80 characters, letters, digits and ` _.+-/|:` only; any value with an `@` is dropped. |
| `landing_path` | `/products/guide` | The path the visit landed on. Never a query or a fragment. |
| `landing_host` | `luca.storelib.com` | The host it landed on. Always one of the creator's own hosts or storelib.com (checked, see below). |
| `property_type` | `website` | The kind of property it landed on. Absent when not known. |
| `client_app` | `instagram` | The in-app browser, when the visit came through one. |
| `at` | `2026-09-20T10:00:00.000Z` | When. Whole seconds for anything that went through a payment. |

To group revenue by last touch source for a creator:

```sql
select last_touch ->> 'source' as source, sum(amount_cents) as revenue
from orders
where creator_id = $1 and created_at >= $2 and status = 'completed'
group by 1;
```

`last_touch ->> 'source'` null means "not recorded" (an order from before
part 60, or no touch). Revenue by property groups by `property_type,
property_id`. Refunds and disputes are read from the same order rows.

Indexes (part 60): `orders (creator_id, property_type, property_id,
created_at) where property_type is not null`, `orders (creator_id,
(first_touch ->> 'source'), created_at) where first_touch is not null`, the
same for `last_touch`, `subscribers (creator_id, property_type, property_id)`,
`subscribers (creator_id, (last_touch ->> 'source'))`, `checkout_starts
(creator_id, property_type, created_at)`. On Postgres 16 both report shapes
above plan as index scans on these.

## Why new columns, not `source_detail`

`orders.source_detail` is the order's "which page, from where" as the Orders
table shows it, and is cleaned to a fixed set of keys everywhere it is read
(`cleanOrigin`). Putting touches in it would mean either changing what that
cleaning keeps, which every reader of it depends on, or a second meaning
hidden in the same object. A report grouping by `source_detail -> 'x' ->> 'y'`
cannot use a plain index on the property either.

So: `property_type` and `property_id` as real columns (grouped and filtered
on directly, typed, checked), the touches as two `jsonb` objects (their keys
grow without a migration; the one key reports group by, `source`, has an
expression index), and `attributed_at` as the write-once guard. The same
shape on orders, subscribers and started checkouts, so one reader works for
all three.

## What a touch is

A touch is recorded when a visit ARRIVES on a public page. `touchFromVisit`:

* The referrer is `document.referrer`. A referrer that is the page's own host,
  storelib.com or one of its subdomains, Stripe or PayPal is internal
  (`isInternalReferrer`, the same rule the view tracker uses): that page load
  is the next page of a visit, not an arrival, and records nothing, unless
  its address carries new UTM tags.
* UTM tags from the page's address, or from the address the document first
  loaded with when a client navigation has dropped them.
* Only the document's first page is an arrival. After a client navigation
  (the next page of a visit, or another creator's page reached from Explore)
  `document.referrer` still names the first page's referrer, so those pages
  record nothing, unless their address carries new UTM tags, which are then a
  campaign touch of their own with no referrer.
* The in-app browser from the user agent (`detectClientAppFromUA`).
* The source is worked out by `categorizeServerSource` from those three,
  on the server as well, never taken from what a page claims.

**Direct** means: no referrer at all, no UTM tags, no in-app browser
signature. A typed address, a bookmark, an app that sends nothing.

Two touches are kept per scope:

* **first**: the first touch seen. Never replaced while younger than 90 days.
  A direct visit can be a first touch.
* **last**: the latest touch that was not direct. A direct visit replaces it
  only when the last one was direct too (or there is none).

A touch counts for 90 days from when it happened. When the first has aged out
and the last has not, the last is the earliest touch still known and serves
as the first too. Instagram, then a typed address, then a purchase: first
Instagram, last Instagram. Google, then an email campaign link: first
organic search, last email.

Two records of the same buyer (the website's own and storelib.com's, see
scopes) are merged at checkout by the same rules: earliest first, latest real
source last (`mergeTouches`).

## Where touches are captured

`<CaptureTouch>` is mounted on:

| Page | Property | Mounted in |
| --- | --- | --- |
| The creator page, `storelib.com/<handle>` and `/u/<handle>` | `creator_page` | `app/(storelib)/(marketing)/u/[username]/page.tsx` |
| A product page, `/p/<slug>` and `/<handle>/<product>` | `creator_page` | `app/(storelib)/(marketing)/p/[slug]/page.tsx` |
| The OnePage, `/<handle>/links`, `/l/<slug>`, `<domain>/links` | `onepage` | `app/(storelib)/(marketing)/l/[slug]/page.tsx` |
| Every page of a website (`<name>.storelib.com`, a custom domain, its product pages, cart, account, contact) | `website` | `app/(site)/layout.tsx` |

It does nothing inside a frame (the editor's canvas shows real pages), on a
preview (`/preview/…`, `?preview=`), and on storelib.com without a creator.

## Scopes, storage, consent

**A scope per creator.** storelib.com serves every creator, so a touch there
is kept under the creator whose page it landed on (`c:<creator id>`): a visit
from Instagram to one creator's page is never the source of another
creator's sale. Every other host (a website subdomain, a custom domain)
belongs to one creator, and its touches are kept under the host
(`h:<host>`).

**Stored only with analytics consent**, exactly as the view tracker stores its
identifiers. One local storage entry, `materia_attr_touches`:
`{ v: 1, s: { <scope>: { first, last, seen } } }`, at most 20 scopes (the
most recently seen), each touch dropped 90 days after it happened. Its name
starts with `materia_attr_`, which the consent record already lists
(analytics, "Where a visit came from") and which saying no to analytics
removes (`lib/consent/client` `writeConsent`). A yes given after the page
opened keeps what the page had already seen.

**Without consent** nothing is written to the device. The touch of the
current document lives in memory only and goes with an order or a sign-up
made from that document, and is gone when the tab is. That is the same thing
the order's Source column has always recorded without consent (where this
visit came from), and the same thing the view tracker counts without consent:
the source of the visit, with no identifier stored. The cost: without consent,
a buyer who comes back another day has only that day's visit as both first
and last touch.

## Carrying touches to checkout

Local storage does not cross hosts. The checkout runs on storelib.com (a
website subdomain's `/checkout` is redirected there by `proxy.ts`), and on a
creator's custom domain it runs on that domain.

* **Links to checkout** on a host that is not storelib.com carry the touches
  in `sl_at` (base64url of a short JSON, at most 2000 characters):
  `checkoutHrefWithOrigin` adds it for every website link and the product
  section's Buy (`CheckoutLinkOrigin`, `ProductSection`), and `carryTouches`
  for the Buy buttons (`buy-button`, `smart-buy-button`,
  `sticky-add-to-cart`). On storelib.com nothing is added: checkout reads its
  own storage.
* **The checkout page** reads `sl_at` once (`adoptCarriedTouches`), keeps it
  in memory, and takes it off the address with `history.replaceState`, so it
  is not bookmarked, shared or sent on as a Referer. When Pay is pressed it
  sends the carried touches merged with what its own address kept for the
  product's creator (`checkoutOrigin(creator.id)`).
* **Requests a page makes itself** (the website's cart, every sign-up form,
  the OnePage's free download) already send `origin: pageOrigin()`; the
  touches ride inside it as `origin.touches`. `cleanOrigin` never keeps
  `touches`, so they never reach `source_detail`.

A buyer who lands straight on checkout has no touches: the order gets its
property and nothing else. A basket is filled and paid on the website's own
host, so its touches are that host's.

## On the server: untrusted until checked

`attributionForCheckout` (single product, basket, free order) and
`contactAttribution` (sign-ups):

1. `decodeTouches`: a string, at most 2000 characters, base64url, UTF-8, a
   JSON object with `f` (and optionally `l`) objects, else nothing at all.
   Each touch keeps only known fields, each checked on its own (hosts by a
   host pattern and at most 100 characters, UTM words as above, a path
   without query and at most 120 characters, the property and in-app browser
   from fixed lists) and needs a time that is younger than 90 days and not
   more than a day ahead. `__proto__` and any other key are ignored. The
   source is worked out again from the fields that survived.
2. `verifyTouches`: a touch must have landed on storelib.com or on one of the
   creator's own hosts (`siteHostsFor`: their subdomains and verified
   domains), where the creator is the product's, decided before any of this
   runs. Anything else is another shop's or made up, and is dropped whole. A
   touch on storelib.com cannot claim to be a website.
3. The property is the server's (next section), never the page's.
4. Every database read here gives up after 1.5 seconds and counts as no
   answer. Nothing here throws; the worst case is the property alone.

None of it is ever read for a price, a product, a creator or a payment. In
`stripe-session` and `cart` it runs after the price is decided and goes into
the payment's metadata last.

## The property of a purchase

From the same value the order's `source` is written with, so they cannot
disagree:

* `source = 'website'` (a website's link or basket): `website`, id the
  creator's published install, as `buildSite` in
  `lib/website-builder/published-site.ts` picks it (published, lowest
  `sort_order`).
* else, checkout began on the OnePage: `onepage`, id the creator's published
  OnePage (by `seller_id`, then `creator_id`, then `owner_id`, as the OnePage
  route finds it).
* else (the creator page, a product page, Explore, a checkout link opened on
  its own): `creator_page`, id the creator's id.

## Through Stripe, and written once

A paid checkout's order is made from its PaymentIntent (or a basket's Checkout
Session) by whichever of the buyer's browser and the webhook arrives first.
So the checked attribution goes into the payment's metadata when it is made:

| Key | Value |
| --- | --- |
| `attr_property` | `website:<uuid>`, `onepage:<uuid>`, `creator_page:<uuid>`, or the type alone |
| `attr_first` | the first touch, compact JSON, at most 500 characters (least useful fields dropped first to fit) |
| `attr_last` | the last touch; absent when it is the first |

They are added only while Stripe's 50 keys allow (a product checkout uses 35
keys, 44 with a held code and a company, so 47 with these three), never at
the payment's expense. Fulfilment reads them back
(`attributionFromMetadata`) without checking age (a delayed payment is still
that visit's). A payment made before this has none of them; its order gets
the property from its `source` and no touches.

Every write is an update after the row exists, onto rows whose
`attributed_at` is null, naming only the five attribution columns. So:

* the webhook and `confirm-payment` racing: only the caller whose insert made
  the order writes, and a second write would find no row;
* a webhook retry writes nothing;
* a database without part 60 refuses only this update, quietly, and the
  order is made exactly as before.

Every order-making path:

| Path | Where |
| --- | --- |
| Card, wallet or PayPal checkout (browser or webhook) | `lib/checkout/fulfil-payment.ts`, from the PaymentIntent (`app/api/checkout/stripe-session`) |
| The app's card form | the same, via `confirm-with-pm` then `confirm-payment` |
| A free product on checkout | `app/api/checkout/process` |
| The OnePage's free download | `app/api/checkout/quick-free` |
| A basket, paid (return or webhook) | `lib/checkout/fulfil-cart-session.ts` then `fulfil-cart-item.ts`, from the session (`app/api/checkout/cart`) |
| A basket a code made free | `app/api/checkout/cart` `freeBasket` then `fulfilFreeCart` |
| The older hosted product checkout in the webhook | `app/api/stripe/webhook` |
| Admin test sale | not attributed (`source_detail.surface = 'admin'`) |

## Subscribers

Every sign-up door records its property and the touches its page sent, right
where it records `source_detail` (`recordSignupAttribution`):

| Door | Route | Property |
| --- | --- | --- |
| A website's newsletter section, footer, popup, section forms | `app/api/website-builder/subscribe` | `website` |
| A website's contact form, when the sender is added | `app/api/website-builder/contact` | `website` |
| The subscribe bar on the creator page and on a product page | `app/api/subscribers` | `creator_page` (a custom domain's website: `website`) |
| The OnePage's subscribe button | `app/api/subscribe` | `onepage` (`creator_page` when called from the creator page) |
| The OnePage's lead form and email capture | `app/api/onepage/leads`, `email-capture` | `onepage` |
| Checkout's "Email me news and offers" and every buyer contact | stripe-session (at Pay), fulfil-payment, process, quick-free, the basket, the webhook | the order's property and touches |

The property follows the `ContactSource` the route already works out from the
page's own address (`contactSourceFrom`), not what the page claims.

## Checkout start

`checkout_starts` is reused. A row is one PaymentIntent that reached Pay with
an email (it is what the checkout reminder is made from), written by
`recordCheckoutStart` in `stripe-session`; its attribution is written onto it
right after. So a report can say where abandoned checkouts came from, for
checkouts that got as far as Pay. A basket goes to Stripe's hosted page and
has no row here (there is no email before it, and a row would start reminder
emails), and a free order completes at once. The funnel's "started checkout"
count is the `checkout_start` event in `analytics_events` (the collection
pipeline); this table adds attribution to the ones that reached Pay.

## No money in analytics

Nothing in `lib/attribution` reads or writes an amount (`tests/attribution.test.ts`
checks the source for it). The reports read revenue, refunds and disputes
from `orders` and join attribution by the same row.

## Not verified here

* Stripe: the PaymentIntent and Checkout Session reads are stood in by the
  tests. Metadata sizes are checked against Stripe's documented limits (50
  keys, 500 characters a value), not against Stripe.
* Email and notification providers are not reachable here; the fulfilment
  runs with them failing, which it is built to survive.
* The custom domain case is read from `proxy.ts` (checkout is served on the
  domain itself; a subdomain's is redirected to storelib.com) and handled by
  the host scope, but not run against a real domain.
* Safari's tracking prevention can cap script-written storage at seven days;
  first touches older than that may then be lost on Safari.
