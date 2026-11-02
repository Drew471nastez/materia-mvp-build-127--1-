# Edge failover: public pages without the database (round 49)

What a visitor to a published website, a OnePage or a community's public
page depends on, what keeps answering when Supabase, the dashboard or the
app's functions are down, what still needs Vercel, and the owner's steps for
surviving Vercel itself. Code: `lib/edge/`, `proxy.ts`, SQL part 356.
Tests: `tests/edge-r49.test.ts`. Local check: `scripts/serve-edge-stub-r49.mjs`.

## 1. The dependency chain of one page view (audit)

`lena.storelib.com/about` or `www.lenashop.test/about`:

| Step | Runs on | Needs the database? | If Supabase is down, before this round |
| --- | --- | --- | --- |
| DNS | the domain's DNS (Vercel DNS for `*.storelib.com`, the creator's registrar for a custom domain) | no | fine |
| TLS + Vercel edge | Vercel | no | fine |
| `proxy.ts` (Routing Middleware, Node runtime, every request but static files: `config.matcher`) | a Vercel Function | yes, per server: live AI site (`site_deployments`), imported theme or not (`site_route_facts`), password gate (`site_access`, every 15 s), languages and markets (`store_localization`), the site's own domain (`custom_domains`); a custom domain's owner (`custom_domains`, `profiles`). Every answer held per server 30 s to 10 min (`rememberedAnswer`, `heldLookup`) | a warm server keeps its held answers. A cold server, or one whose answers expired past their stale window, answered **503 "One moment"** (SITE-8) for every page of every site it had not seen |
| CDN cache | Vercel | no | Vercel runs Routing Middleware before its cache: a `HIT` for `asgardshop.storelib.com/` is reported with `x-matched-path: /w/[username]`, the address the proxy rewrote to (live, 2 November). So the proxy's lookups above are on the path of every request, cached or not |
| The page | a Vercel Function (`/w/[username]` ISR, 60 s; `/api/site-theme/site/...` per request; `/l/[slug]`; `/community/[slug]`) | yes: the site, its products, menus, blog, release pointer (`siteRead`, 4 s + 7 s budget) | Storelib theme: ISR served the held page stale, and a missing one fell back to the last good copy (per server, then the shared data cache). Imported theme: the stranger hold (60 s), then the last good copy, else **503**. OnePage and community: the data cache's held reads, else an error page |
| Render | the same function | no | fine |

What was not independent of the database: the proxy's routing on a cold
server (the 503s), every imported theme page past its hold with no last
good copy, a OnePage or community page with nothing held.

Measured locally (production build, `scripts/serve-edge-stub-r49.mjs`,
the database stub killed, nothing held on a fresh server): section 5. A
community page answered **404** with the database away, not 503: its read
failing was taken for "no such community".

## 2. What changed

**Stored copies of public pages** (`lib/edge/public-snapshot.ts`,
`snapshot-capture.ts`, `snapshot-store.ts`). After Publish, Unpublish, a take
down, a product save, a password change and a OnePage change, and as
stranger pages are drawn (at most hourly per page per server), Storelib asks
for the page at its public address exactly as a stranger would (GET, no
cookie) and keeps the HTML in Supabase Storage, bucket `public-snapshots`
(SQL part 356, private), keyed by host and path. The warm run after a deploy
takes copies for sites that have none (the rollout backfill).

- Only a 200 page of HTML that set no cookie, was asked for with no cookie
  and is not itself a copy (a page let in with a password pass needs the
  pass cookie, so it never comes back to this request). Never a cart, checkout,
  account, search, password, preview, receipt or API address, never a file.
  A password protected site's copy is its password page.
- A page that answers 404 or 410 loses its copy. A front page that is gone
  wipes every copy under the host and the host's records (a site taken down
  is never served from a copy). Any other failure keeps the copy it had.
- A OnePage's or community's copy not refreshed for a week is not served.

**Served when the database is away** (`proxy.ts`):

- `lib/edge/db-health.ts` keeps, per server, whether the database answered:
  every proxy read reports, and a one row probe runs in the background when
  the last word is older than 20 s. Down = a failure in the last 30 s with no
  success since.
- While down, a page of a website host, `storelib.me/<name>` or
  `storelib.com/community/<slug>[/about]` is answered from its copy before
  any routing (`snapshotWhileDown`). No seven second wait on `siteRead`.
- Every SITE-8 503 now tries the copy first, and the imported theme's own
  503 does too.
- **A connected domain without the database.** A record per host
  (`v1/h/<host>.json`: the site's name, its renderer, whether it is open)
  is written with the copies. A cold server that cannot read
  `custom_domains` and has no copy of the page routes a Storelib theme site
  that was open when kept to `/w/<name>`, where ISR and the shared last good
  copy can still answer. Never an imported theme, an AI site or a closed one.
- A website's Storelib subdomain whose site lives at its connected domain
  has no copies of its own (it only redirects); its host record names the
  domain, and while the database is away it answers a `302` there, where
  the copies are.
- The answer from a copy is `200`, `Cache-Control: private, no-store` (no
  cache keeps the outage's copy past the outage), `X-Storelib-Snapshot:
  <when taken>`. Everybody gets the stranger's page, a signed in member or a
  buyer with a cart too: degraded, never somebody else's.

## 3. Headers per page type (live, 2 November, and unchanged by this round)

| Page | Cache-Control | CDN | Per visitor? |
| --- | --- | --- | --- |
| Storelib theme site, `/` | `public, s-maxage=60, stale-while-revalidate=300` | HIT/STALE | no. A market's currency copy is `private, no-cache`; a page let in with a password pass `private, no-store` |
| Storelib theme site, other pages | ISR 60 s (browser sees `public, max-age=0, must-revalidate`) | HIT/STALE | no |
| Imported theme, any page | `private, no-cache` | MISS, `X-Storelib-Held: hit` | yes for a visitor with a cart or session: Liquid draws `cart` and `customer` on the server |
| OnePage `storelib.me/<name>` | `private, no-cache, no-store` | MISS | no, but scheduled links (round 40) need per request time |
| Community `/community/<slug>` | `private, no-store` | MISS | yes: a member gets the feed, a stranger the sales page |
| Stored copy | `private, no-store` | never | no |

Why the TTLs were not raised. Publish purges the ISR pages by path and tag,
but a scheduled blog post and a scheduled OnePage link go live by time only,
so a longer `s-maxage` delays them. Under a spike a Storelib theme page is
drawn about once per path per minute already (section 5); the lever for "a
spike never touches the database" is the proxy's held answers and the
copies, not a longer TTL.

**Imported theme pages stay out of the CDN, and cache tags are not why.**
Vercel does support tag purges on Next 16 (`revalidateTag` reaches CDN
entries; `Vercel-Cache-Tag` header; `invalidateByTag` in `@vercel/functions`;
docs "CDN cache, purge"), which answers round 41's "a CDN copy could not be
purged on Publish". The blocker is the other one, measured live in round 48:
Vercel's CDN keyed a copy on the address the browser asked for, not the
proxy's rewrite, so a stranger's copy was served to signed in visitors.
`Vary: Cookie` is refused by Vercel's CDN ("Vary key denied"). An imported
theme page draws the visitor's cart and account on the server, so a CDN copy
could hand one buyer's cart to another. It stays in the stranger hold (60 s,
data cache, purged on Publish), with the stored copy for outages. The way to
CDN-cache it is to draw the cart and account in the browser after load
(the theme's `cart.js` already exists), which is a theme engine change.

## 4. What is independent now, and what is not

| Failure | Websites | OnePages | Community public page | Dashboard, checkout, carts |
| --- | --- | --- | --- | --- |
| Postgres down or overloaded | served: held answers and ISR, else the stored copy | stored copy | stored copy (stranger's page) | down (allowed) |
| Postgres and Storage both down | servers that read a copy keep it in memory; a server that has none answers 503 | same | same | down |
| A spike on one site | proxy answers held per server, one read per host in flight, ISR or the stranger hold: no database read per visitor | data cache held reads | per request (database) | n/a |
| Vercel Functions down or overloaded | **down**: the proxy is a function and runs before the CDN | down | down | down |
| Vercel entirely down | **down** | down | down | down |

What Storage does and does not survive. Supabase Storage keeps objects in
S3, but its API reads object rows from the same Postgres. A database that
is overloaded but up still serves Storage reads (a single indexed row);
Postgres fully down takes Storage reads down too. That is why each server
keeps what it read in memory and serves it while the store does not answer,
and why section 6 puts a copy outside Supabase.

## 5. Measured (local production build, `scripts/serve-edge-stub-r49.mjs`)

Method: `pnpm build` pointed at the stub, `node scripts/serve-edge-stub-r49.mjs`
(lena's Storelib theme site on `www.lenashop.test`, satori's OnePage, the
Loop Club community), requests with the public `Host` header. Publish
through the real route (`POST /api/website-builder/themes/<id>/publish`),
then the database killed (`POST :54322/kill-db`: every PostgREST and Auth
connection dropped; Storage left up) and `next start` restarted, so the
server holds nothing in memory. "Before" is the same build with no copies
kept (the store empty), which is what the code did before this round.

**Database down, cold server, one request each:**

| Page | Before | After |
| --- | --- | --- |
| `www.lenashop.test/` (connected domain) | 503 "One moment", 0.83 s | 200 from its copy, 0.76 s (first request), then 0.01 s |
| `www.lenashop.test/products` | 503, 0.73 s | 200 copy, 0.016 s |
| `www.lenashop.test/products/loop-pack-1` | 503 | 200 copy, 0.020 s |
| `lena.storelib.com/` (subdomain of a site at its domain) | 503, 0.88 s | 302 to `www.lenashop.test/` from its host record, `no-store` |
| `storelib.me/satori` (OnePage) | 200 (Next's data cache still held its reads, kept on disk across the restart) | 200 copy, 0.008 s |
| `storelib.com/community/loop-club` | **404**, 1.8 s (the community read failed and was taken for "no such community") | 200 copy, 0.014 s; `/about` too |
| `www.lenashop.test/cart` | 503 | 503 (dynamic, by design) |
| `/app` dashboard | allowed to fail | 200 in 3.8 s, drawn without its data (unchanged) |

**Database down, cold server, a spike** (plain Node `http` requests with the `Host` header, 50 at once):

| Page | Before | After |
| --- | --- | --- |
| `www.lenashop.test/`, 2,000 requests | 2,000 × 503, p50 863 ms, p95 992 ms | 2,000 × 200 from the copy, p50 100 ms, p95 198 ms |
| `storelib.com/community/loop-club`, 1,000 | 1,000 × 404, p50 1,728 ms, p95 2,888 ms | 1,000 × 200, p50 79 ms, p95 199 ms |
| `storelib.me/satori`, 1,000 | (not measured cleanly: the first request took a copy from the held render) | 1,000 × 200, p50 90 ms, p95 137 ms |

**Database up: how often a spike reaches the database.**
`scripts/load/storefront.mjs --paths /w/lena,/w/lena/products,/w/lena/products/loop-pack-1 --concurrency 25`:
20 s, 2,779 requests, p50 177 ms, p95 255 ms, **0 database reads**; 75 s
(past the 60 s revalidate), 14,778 requests, p50 116 ms, p95 205 ms, **51
database reads**: one redraw per path (about 17 reads each) after the
minute, nothing per visitor. Through the proxy on the connected domain
(2,000 requests to `www.lenashop.test/`, 50 at once, a warm server): 21
reads, the proxy's held answers refreshed once and one redraw. A spike is
about one draw per path per minute; the CDN in front of this on Vercel
takes the rest.

**Unpublish.** Copies are asked again after the route answers. Locally an
unpublished site's domain shows the creator page, and the copies were
replaced by that page within two seconds (`<title>Lena | Storelib</title>`),
so nothing of the unpublished site was left to serve. A front page that
answers 404 (a take down) deletes every copy under the host (tests).

**Headers per page type on the local build (database up):** connected domain
`/`, `/products`, a product: `s-maxage=60, stale-while-revalidate=...` (ISR);
OnePage and community: `private, no-cache, no-store, max-age=0,
must-revalidate`; `/cart`, `/search`: the same, private; a copy: `private,
no-store`, `X-Storelib-Snapshot`.

Found while measuring, not changed: `lena.storelib.com/` answers its 302 to
the connected domain with `public, s-maxage=3600, stale-while-revalidate=7200`
(next.config's rule for the marketing `/` matches the path the browser
asked for), so after a creator removes their domain the subdomain can keep
redirecting from the CDN for up to three hours. The same trap the proxy
already fixes for a site's own `/`.

## 6. Beyond Vercel: owner steps and cost

Nothing here was changed. Every step is the owner's decision; prices are
list prices as last checked and must be checked again before buying.

**Option A, Cloudflare in front of the website hosts (recommended first).**

1. Move `storelib.com` DNS to Cloudflare (free plan is enough for DNS), or
   only the sites: delegate `*.storelib.com` and keep the apex on Vercel.
   Cloudflare Pro is about 20 USD a month per zone for the cache rules below.
2. Proxy (orange cloud) the wildcard `*.storelib.com` to Vercel, Full
   (strict) TLS. Keep `storelib.com`, `app.`, `api.` and `admin.` grey or
   bypassed: the dashboard and checkout must never be cached.
3. Cache rule for website hosts: cache HTML when the origin says
   `public` (Storelib theme pages), respect origin headers, and turn on
   "Serve stale content while revalidating" and **Always Online**. Bypass
   cache when the request carries `sl_theme_cart`, `sb-*` or any `sl_`
   cookie other than `sl_lang`, `sl_suggest`, `sl_asid` (the list in
   `lib/storelib-theme/compat/anonymous-cache.ts`), and for `/cart`,
   `/checkout`, `/account`, `/api`, `/search`, `/password`.
   Cloudflare's cache key can include a cookie, which Vercel's cannot, so
   imported theme pages for strangers become cacheable there too (a second
   step, after a week of checking headers).
4. Custom domains: Cloudflare for SaaS (custom hostnames: 100 included,
   then about 0.10 USD each a month), with `domains.storelib.com` (the CNAME
   creators are shown today, `lib/custom-domains/hostname.ts` CNAME_TARGET)
   pointed at Cloudflare's fallback origin. A creator whose `www` is a CNAME
   to `domains.storelib.com` changes nothing. A bare domain with an A record
   to Vercel's address, and the older `cname.vercel-dns.com` CNAMEs
   (`lib/custom-domains/targets.ts` LEGACY_CNAMES), point at Vercel directly
   and each needs the creator to change a record: plan that with the
   Domains screen's copy, and count them first (`custom_domains` rows by
   their verified record).
5. Outcome: pages Cloudflare holds keep serving while Vercel is down, for as
   long as they are held. Pages it does not hold do not.

**Option B, a static mirror of the stored copies, with origin failover.**

1. Copy the `public-snapshots` bucket to a second store outside Supabase
   and Vercel (Cloudflare R2: about 0.015 USD per GB a month, no egress fee;
   the copies are a few MB per site). A nightly job or a write-through in
   `lib/edge/snapshot-store.ts` (`SNAPSHOT_STORAGE_URL` already points the
   reader anywhere that speaks the same API; a second writer is a small
   change).
2. A Cloudflare Worker (free tier 100,000 requests a day; paid 5 USD a month)
   on the website hosts that fetches from Vercel and, on a 5xx or a timeout,
   answers the copy for `host + path` from R2.
3. Or Cloudflare Load Balancing (about 5 USD a month plus health checks)
   with Vercel as primary and the Worker/R2 mirror as fallback, health
   checked every 60 s against `/api/health`.
4. DNS failover for the apex is what Cloudflare's proxy already gives;
   health-checked DNS at another provider (Route 53 failover records, about
   0.50 USD per health check a month) is only needed if Cloudflare is not in
   front.

**What still cannot survive Vercel being down, whatever is bought:** the
dashboard, checkout, carts, sign in, uploads and every write. Those need
the app, and a second app region or provider is a much larger project.

## 7. Owner steps for this round

1. Run SQL part 356 (`supabase/sql/run-now/356_public_snapshots.sql`).
   Before it runs every copy write fails quietly and nothing changes.
2. After the deploy, the warm run takes copies for every published site; a
   Publish takes them at once. Check one: Supabase Storage,
   `public-snapshots/v1/i/site-<name>.json`.
3. Decide on section 6.
