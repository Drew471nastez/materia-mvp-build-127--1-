# Analytics events: the collection contract

What Storelib records about visits to a creator's pages, how, and where it is
kept. The reports layer and `/app/analytics` read what is described here and
nothing else. Code: `lib/analytics/events.ts` (types and constants, safe to
import anywhere), `lib/analytics/property.ts` (resolving a property, server
only), `lib/analytics/collect.ts` (the pipeline, server only),
`lib/analytics/page-tracker.ts` and `components/analytics/track-view.tsx` (the
browser). SQL: `supabase/sql/run-now/54_analytics_one_pipeline.sql`.

Revenue and order counts never come from here. `orders` is the source of
truth for money and sales; attribution of an order to a visit is on the order
itself (the attribution work: `lib/analytics/attribution.ts` and its own SQL part).

## 1. One pipeline

Every event from a visitor's browser goes through `collect()` in
`lib/analytics/collect.ts`, whichever route it arrives by:

| Route | Events | Sent by |
| --- | --- | --- |
| `POST /api/track-view` | `view` | `<TrackView>` on every public page |
| `POST /api/track-event` | `link_click`, `buy_click`, `checkout_start`, `checkout_complete`, `download` | the outbound link watcher in `<TrackView>`, `trackFunnelStep()` in `lib/analytics-utils.ts` |
| `POST /api/onepage/track` | `link_click` (and the OnePage's own `onepage_clicks` row) | the OnePage's link blocks |

The body is JSON, sent by `fetch` with `keepalive` or by `navigator.sendBeacon`
as `text/plain`; the server reads the text as JSON either way (at most 8,000
bytes). Every answer is an empty `204`, recorded or not, so a page never waits
on it and a robot learns nothing from it. The only thing a `204` carries is the
`visitor_id` cookie for a page view with analytics consent (set, or deleted
without consent).

`collect()` never throws. What it decided is in its return value
(`CollectOutcome.reason`): `recorded`, `invalid`, `bot`, `prefetch`,
`cross_site`, `rate_limited`, `unknown_creator`, `unknown_product`, `own`,
`no_property` (with `detail`: `bad_url`, `host_mismatch`, `preview`,
`not_a_property_page`, `foreign_host`, `no_onepage`, `no_website`),
`duplicate`, `not_ready`, `error`.

## 2. Event types

Stored in `analytics_events.event_type`. The names are the ones already in the
table; `lib/analytics/events.ts` `EVENT` maps a meaning to its stored name.

| Stored name | `EVENT.` | When it is written |
| --- | --- | --- |
| `view` | `pageView` | One real page navigation: a full page load, or a client side route change (Next `<Link>`, `router.push`, back and forward), of a creator page, a product page, a OnePage or any page of a website. With `product_id` set it is also a product view. |
| `link_click` | `linkClick` | A OnePage link block was clicked (`link_id` is the block), or a link out of the page on the creator page or a website (`link_url` is the destination). New in part 54. |
| `buy_click` | `buyClick` | Buy was pressed on a product (`components/checkout/*buy-button.tsx`, the website product section). |
| `checkout_start` | `checkoutStart` | The checkout page opened for a product (`app/checkout/checkout-client.tsx`). |
| `checkout_complete` | `checkoutComplete` | Allowed; no page sends it today. |
| `download` | `download` | Allowed; no page sends it today. |
| `purchase` | `purchase` | Written by the checkout when an order is paid (`lib/checkout/*`, the Stripe webhook). A marker only, with no amount. Count sales from `orders`. |

`view` is the page view. It was not renamed to `page_view`: every report, SQL
function (`analytics_visit_tally`, `analytics_all_time`, `refresh_daily_rollup`)
and admin view already reads `view` as "a page was opened", so one stored name
keeps old and new rows one series.

Legacy names, never written now and never read by any report:
`store_view`, `product_view`, `session_start`, `add_to_cart`
(`LEGACY_EVENT_TYPES`). They are from the table's first schema
(`scripts/023_analytics_migration.sql`). Reading them now would add rows to
past periods that no report ever counted, so they stay unread.

The database check `analytics_events_event_type_check` allows exactly
`ALLOWED_EVENT_TYPES`: the seven above and the four legacy names. It is
`NOT VALID`, so old rows are not rechecked.

## 3. Columns

`analytics_events`, as part 54 leaves it. Every column is nullable unless
said otherwise. Part 54 adds the last five and makes sure the rest exist; it
drops nothing.

| Column | Type | Meaning |
| --- | --- | --- |
| `id` | uuid | Primary key. |
| `created_at` | timestamptz | When the server recorded it. |
| `creator_id` | uuid, not null | The creator whose page it was. Checked to exist. |
| `product_id` | uuid | The product, on a product page or a funnel step. Checked to be this creator's. |
| `event_type` | text, not null | See section 2. |
| `session_id` | text | The visit (section 5). |
| `visitor_id` | text | The visitor (section 5). |
| `property_type` | text | `creator_page`, `onepage` or `website` (section 4). Null on legacy rows the backfill could not place, and on a funnel step with no page to place it by. |
| `property_id` | uuid | The website's `store_theme_installs.id`, or the OnePage's `onepages.id`. Always null for `creator_page`. |
| `path` | text | The page's path, normalised: no scheme, host, query or hash; lower case; repeated slashes made one; no trailing slash; `/` for the front page; at most 300 characters (`normalizePath`). On a website it is the website's own path (`/about`, `/products/ebook`); on storelib.com it is the whole path (`/ana`, `/ana/ebook`, `/ana/links`). Null on legacy rows (section 7). |
| `link_id` | text | `link_click` only: the OnePage block id. |
| `link_url` | text | `link_click` only: the destination, scheme, host and path, no query or hash, at most 500 characters; `mailto:`, `tel:` and `sms:` as the scheme alone (`normalizeLinkUrl`). |
| `page_url` | text | `view` only: the address the visit landed on (first touch, from `lib/analytics-utils` `getAttributionForTracking`). For a visitor with analytics consent this is the visit's first page on this site, not the page viewed; use `path` for the page. Kept as it always was, because the reports' landing page and Storelib or Website channel read it. |
| `referrer`, `referrer_domain` | text | `view` only: where the visit came from. Storelib itself, the creator's own site and Stripe are `Direct`. |
| `source_category` | text | `view` only: `direct`, `organic_search`, `paid_search`, `paid`, `email`, `affiliate`, `referral`, `social_<network>` or `social`. Worked out on the server by `lib/analytics/sources.ts` `categorizeServerSource`. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | text | `view` only, at most 200 characters each. |
| `device_type` | text | `view` only: `desktop`, `mobile` or `tablet`, from the request's user agent (`lib/analytics/user-agent.ts`); an iPad that says it is a Mac is a tablet. |
| `browser`, `os` | text | `view` only, from the user agent. |
| `screen_width`, `screen_height` | integer | `view` only. |
| `language` | text | `view` only: `navigator.language`. |
| `country_code` | text | Every event: two letters, from Vercel's `x-vercel-ip-country`. |
| `country_name` | text | `view` only: the English name (`Intl.DisplayNames`). |
| `city`, `region` | text | `view` only, and only with analytics consent. |

No IP address, user agent string or cookie value other than the ids above is
stored. Link destinations keep no query string.

## 4. Properties

A property is one of a creator's public places: their creator page (one per
creator), their OnePage (one per creator), or one of their websites.

The page never says which property it is. `resolveProperty()` in
`lib/analytics/property.ts` works it out on the server from the page's address
(`href`, the page's `location.href`, sent with every event) and the host the
request arrived on, and checks it is the claimed creator's. Anything it cannot
place is dropped.

1. `href` must be an http(s) address on the same host as the request
   (`host_mismatch` otherwise): the trackers post to their own origin.
2. `?preview`, `?embedded`, `?draft`, `?_preview`, `?sl_preview`, and paths
   under `/preview/` (or `/w/<name>/preview/`) are builder previews: dropped.
3. On storelib.com itself (also `www.`, `localhost`, `127.0.0.1` and
   `*.vercel.app`):

   | Path | Property |
   | --- | --- |
   | `/<handle>`, `/u/<handle>` | `creator_page` |
   | `/<handle>/<slug>`, `/p/<slug>` | `creator_page` (a product on it) |
   | `/<handle>/links`, `/l/<slug>` | `onepage`, the creator's OnePage |
   | `/w/<name>/...` | `website`, when `<name>` is this creator's (development) |
   | anything else, including every reserved first segment (`/app`, `/checkout`, `/onepage-preview`) and `/` | not a property: dropped |

4. On any other host, the host must be the creator's own:
   - `<name>.storelib.com` or a connected domain that serves their published
     website (`lib/site-accounts/hosts.ts` `siteOwnerOfHost`, the check website
     sign in makes) is `website`;
   - a connected domain of theirs that serves the creator page (purpose
     `creator_page`, or a website domain with nothing published) is
     `creator_page`;
   - `/links` on either is `onepage`;
   - any other host is `foreign_host`: dropped.
5. A website's `property_id` is the install the published site is drawn from:
   `store_theme_installs` with `status = 'published'`, first by `sort_order`,
   the query `lib/website-builder/published-site.ts` uses to draw it.
6. A OnePage's `property_id` is found by `seller_id`, then `creator_id`, then
   `owner_id` (the creator's user), as `app/(marketing)/l/[slug]` finds it.

A client sent `propertyId` or `propertyType` is never read. The answers are
kept in memory for a minute per server instance.

Funnel steps: `buy_click` is placed by its page like a view. `checkout_start`
and `checkout_complete` happen on storelib.com's `/checkout`, which is not a
property, so they take the property of the latest `view` in the same session
within 30 minutes (on a website's own `/checkout` they take that website). A
step with nothing to place it by is still recorded, with a null property, as
every step was before.

## 5. Visitors, sessions and repeats

With analytics consent (`lib/consent/consent.ts`, the visitor's own
`storelib_consent` cookie, read on the server):

- `visitor_id` is the server's `visitor_id` cookie, else the page's
  `materia_visitor` cookie, else a new `v_<random>`; set back as the
  `visitor_id` cookie (httpOnly, one year).
- `session_id` is the page's `sl_asid` cookie: a new one after 30 minutes
  without a page, pushed on by every page (sliding).
- Both are per host: a visitor on storelib.com and on a website's own domain
  has a cookie on each.

Without consent nothing is stored on the device. `visitor_id` is
`anon_` + HMAC(daily key, IP | user agent | creator), the key changing every
UTC day (`lib/analytics/anon-visit.ts`); `session_id` is the session of that
visitor's last `view` of this creator within 30 minutes, else a new one. So a
declining visitor is one visitor per creator per UTC day, and one visit across
the creator's properties.

A visit (session) ends after 30 minutes without a page (`SESSION_TIMEOUT_MS`).

Repeats, all inside `PAGE_VIEW_REPEAT_MS`, 30 minutes:

- `view`: one per visitor, property and path. A refresh, or back and forward
  to a page seen in the last 30 minutes, is not a new view. A, B, then A again
  counts A again only once 30 minutes have passed since A's last recorded view.
  The browser checks this too (per tab, `sessionStorage` key
  `sl_pv:<creator>|<host><path>`), so a refresh sends nothing at all.
- `link_click`: one per visit (or visitor), property and link (`link_id`,
  else `link_url`); the browser sends a link once per page load.
- `buy_click`, `checkout_start`, `checkout_complete`, `download`: one per visit,
  step and product, as before.

Unique visitors on a day are `count(distinct visitor_id)` of that day's
`view` rows. Over a longer range, count distinct over the range's raw rows;
adding daily counts gives visitor-days.

## 6. Exclusions

Nothing is written for:

| What | How it is known |
| --- | --- |
| The builder canvas and previews | Preview routes draw no tracker; a page inside a frame sends nothing (`skipReason: framed`: the website builder canvas, the creator page workspace and the OnePage editor frame the real pages); preview addresses are refused on both sides. |
| The owner | `lib/analytics/own-visit.ts`: a signed in Storelib session whose user is the creator. Covers storelib.com and `*.storelib.com` (the sign in cookie is on `.storelib.com`); a connected custom domain never carries it, so the owner on their own custom domain is counted. |
| Robots | `lib/analytics/user-agent.ts` `isBotAgent` (crawlers, link previews, uptime checks, HTTP libraries, `HeadlessChrome`, `puppeteer`, `playwright`, `lighthouse`, and an empty user agent); and `navigator.webdriver` in the browser. |
| Prefetches and prerenders | The tracker runs in the page after it is shown, so a Next prefetch (which renders nothing) never sends; a prerendered page waits for `prerenderingchange`, a background tab for `visibilitychange`. The server also refuses `Next-Router-Prefetch`, `Purpose: prefetch` and `Sec-Purpose: prefetch`/`prerender`. |
| Another site's requests | `Sec-Fetch-Site` other than `same-origin`, or an `Origin` on another host. |
| Floods | More than 120 events a minute or 2,000 an hour from one address: `rate_limit_hits`, bucket `track` (`lib/api/rate-limit.ts` `LIMITS.track`), counted by an HMAC of the address under the daily key, never the address. |
| Invalid payloads | Ids that are not uuids, a creator that does not exist, another creator's product, an address that is not a property of the creator. |

## 7. Legacy rows and new rows together

On the day part 54 runs:

- Old `view` rows are placed by the backfill: `property_type` from the host of
  `page_url` (storelib.com, `www.`, localhost, `127.0.0.1` and `*.vercel.app`
  are `creator_page`; a domain connected for the creator page is
  `creator_page`; any other host is `website`), and `property_id` only where it
  is certain: a website row of a creator with exactly one install. `path` is
  left null: for a visitor with consent `page_url` was the visit's first page,
  not the page viewed. Rows with no `page_url`, and every non-`view` row, keep a
  null property. The backfill skips rows already placed, so a second run
  changes nothing.
- Views before this change were deduped per creator and product, and a
  website's pages all shared one key: a website counted one view per visit.
  From this change a website counts one view per page. Its sessions and
  visitors do not move; its page views rise to what was read. That rise is the
  fix, not a double count: no page is recorded twice.
- OnePage views are new rows in `analytics_events` (property `onepage`), and
  still rows in `onepage_views` as before. The Storelib figures
  (`analytics_visit_tally`, `analytics_all_time`, the reports route's Node
  fallback, the website performance bar) leave `view` rows with property
  `onepage` out, so the Storelib view counts exactly what it did. The OnePage
  view in Analytics and the OnePage editor's stats read `onepage_views`,
  `onepage_clicks` and `onepage_leads`, untouched. A future report that reads
  OnePage traffic from `analytics_events` must not add `onepage_views` to it.
- OnePage link clicks: written to `onepage_clicks` exactly as before (one per
  address and device, block and UTC day) and to `analytics_events` as
  `link_click` (one per visit and block).
- Before part 54 has run, a view is written as it was (no new columns), and a
  OnePage view or a link click is not written at all (`not_ready`), since with
  no property it would read as a creator page view.
- `components/app/dashboard-client.tsx` reads link taps as `event_type =
  'click'`, which nothing has ever written; link clicks are `link_click`.

## 8. The daily rollup

Reading raw events for a year does not scale, so each finished UTC day is
counted once into `analytics_property_daily`.

| Column | Meaning |
| --- | --- |
| `creator_id` uuid, `property_type` text, `property_id` uuid, `day` date | The key: one row per creator, property and UTC day that had any event. Unique on `(creator_id, property_type, coalesce(property_id, zero uuid), day)`. |
| `visitors` | Distinct visitors (`visitor_id`, else `session_id`, else the row) with a view that day. |
| `sessions` | Visits whose first view in this property falls on this day (looked for in the day and the day before, so a visit across midnight is counted once, on the day it began). Adds over days. |
| `bounces` | Of those, visits with one view in this property up to the end of the day. |
| `page_views` | `view` rows. |
| `product_views` | `view` rows with a product. |
| `link_clicks` | `link_click` rows. |
| `buy_clicks`, `checkout_starts` | Distinct visits with that step, as the funnel counts them. |
| `sources`, `referrers`, `campaigns`, `devices`, `countries`, `browsers` | jsonb `{key: sessions}`, from each visit's first page, as the reports describe a session. Referrers are hosts without `www.` (`direct` for none), devices, browsers and countries `unknown` when missing; the 100 largest keys (300 for countries), the rest under `(other)`. |
| `session_slots` | jsonb `{quarter hour of the UTC day, 0 to 95: sessions}`: when each visit began. Every time zone's offset is a whole number of quarter hours, so each slot lies inside one day or hour of any zone's chart, and a report in Los Angeles or Kolkata can place a rolled up day's visits in its own days. |
| `paths` | jsonb `{path: page views}`, the 200 busiest, the rest under `(other)`; legacy rows with no path under `(unknown)`. |
| `landing_paths` | jsonb `{path: sessions}` by the path each visit began on, 200 busiest. |
| `updated_at` | When the row was counted. |

Each breakdown adds up to its total: `sources` and the other session maps to
`sessions`, `paths` to `page_views`. Only rows with a property are rolled up.

`analytics_rollup_days (day, refreshed_at, properties)` names every day that
was refreshed for all creators.

`analytics_refresh_property_day(p_day date, p_creator_id uuid default null)`
deletes that day's rows (for one creator, or all) and counts them again from
`analytics_events`, under an advisory lock per day. Running it again for any
day gives the same rows. For all creators it also records the day in
`analytics_rollup_days`. It returns the number of rows written. Service role
only.

Kept current by `GET /api/cron/rollup-daily` (Vercel cron, 01:00 UTC, with
`CRON_SECRET`): yesterday by default, `?date=YYYY-MM-DD`, or
`?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive, at most 92 days a call) to fill
the past the first time. The same call refreshes the older product rollup,
`analytics_daily_rollups` (`refresh_daily_rollup`), which the notifications
read and which is unchanged.

The rule for reading: a day comes from the rollup only if it is in
`analytics_rollup_days`, is before today (UTC), and lies wholly inside the
period asked for; every other day of a range (today, a day not rolled up yet,
and the part days at either edge of a period in a zone that is not UTC) is
counted from the raw events by `analytics_property_counts`, the function the
rollup itself is made with, so the two cannot disagree. `analytics_report`
does this split in the database (lib/analytics/report-read.ts, lib/analytics/reports.ts); `splitDays()` in
`lib/analytics/events.ts` states the same rule. A day rolled up before
`browsers` and `session_slots` existed is forgotten by part 54 and counted
from the events until the cron rolls it up again.

Unique visitors are never read from the rollup: people cannot be added up
across days. `analytics_report` counts them from the events for the period
and for each bucket of the chart.

A plain run of the cron also rolls up the most recent days of the last 400
that were never rolled up, as many as fit in 20 seconds, so a year fills in by
itself.

Creators may read their own rollup rows (row level security); only the server
writes them.

## 9. Indexes

On `analytics_events` (part 54 adds the first four):

| Index | Columns | For |
| --- | --- | --- |
| `idx_analytics_events_property_type_time` | `(creator_id, property_type, property_id, event_type, created_at)` | Any report filtered to one property over a period: equality on the first four, the period as a range. |
| `idx_analytics_events_property_path_time` | `(creator_id, property_type, property_id, path, created_at) WHERE event_type = 'view' AND path IS NOT NULL` | One page of a property over time (a path drill down); partial, so only page views with a path pay for it. |
| `idx_analytics_events_visitor_time` | `(visitor_id, created_at) WHERE visitor_id IS NOT NULL` | The repeat check (a visitor's views in the last 30 minutes) and `anonSession` (a declining visitor's last view): one visitor's few rows rather than a creator's half hour. |
| `idx_analytics_events_time_brin` | BRIN `(created_at)` | The rollup's scan of a day across all creators, and a backfill by date. BRIN because rows arrive in time order: a few pages of index for the whole table. |
| `idx_analytics_events_creator_type_time_id` (part 25) | `(creator_id, event_type, created_at, id)` | Every creator wide read over a period, keyset paged: the reports, `analytics_visit_tally`, `analytics_all_time`; and the lookup of a visit's last view that places a checkout step. |
| `idx_analytics_events_product_type_time_id` (part 25) | `(product_id, event_type, created_at, id) WHERE product_id IS NOT NULL` | One product's figures. |

On `analytics_property_daily`: the unique key above (creator, property, day,
which also serves a creator's range read) and `analytics_property_daily_day`
on `(day)` for the refresh's delete.

## 10. The browser

`<TrackView creatorId productId? links?>` (`components/analytics/track-view.tsx`)
is on the creator page, product pages (storelib.com and websites), the OnePage
(`links={false}`: its blocks report their own clicks), and every public page of
a website: home and every page (`render-site.tsx`), shop, search, cart,
contact and wishlist. Not on account pages, previews or cover renders.

It runs after the page is shown, has fired its `load` event (10 seconds at
most) and the browser is idle (`requestIdleCallback` with a 2 second deadline,
a 400 ms timer where there is none), keyed by the path, so a client side route
change is a new view and a re-render is not. A route change finds the page
loaded and waits only for idle. A page left before then, once shown, sends its
view as it goes, by beacon. The idle callback alone is not enough: in Chromium
it ran 2 ms after the document was parsed while the page's hero picture was
still downloading (`scripts/check-analytics-collection.mjs`). It never
throws: every request has a 5 second limit and every failure is dropped. No
third party script is involved.

## 11. Privacy

Consent is read exactly as before: without analytics consent no cookie is set
or read and no attribution is kept in the browser; the server keeps the
country but no city or region, and the visitor is the daily hash. What is
stored per event is listed in section 3. Paths never include a query string,
so search terms on a website's search page are not kept. `page_url` and
`referrer` are kept as they were before this change.
