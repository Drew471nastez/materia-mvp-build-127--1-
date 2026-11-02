# Load testing the storefront

`scripts/load/storefront.mjs` sends GET requests to public pages for a few
seconds at a fixed number in flight, and reports how long they took, how
many failed and how many Vercel's CDN answered from its cache. Node only,
no dependency: it uses Node's own `fetch`.

```bash
BASE_URL=https://storelib-git-my-branch-storelib.vercel.app \
  node scripts/load/storefront.mjs --seconds 30 --concurrency 10
```

| Option | Environment | Default | |
| --- | --- | --- | --- |
| `--base` | `BASE_URL` | none | Required. A preview deployment. |
| `--seconds` | `LOAD_SECONDS` | 30 | At most 600. |
| `--concurrency` | `LOAD_CONCURRENCY` | 10 | Requests in flight at once, capped at 50. |
| `--paths` | `LOAD_PATHS` | `/,/pricing,/explore,/features,/robots.txt,/sitemap.xml` | Comma separated. |
| `--json` | | | Also print the result as JSON. |
| `--i-mean-production` | | | Required to aim at `storelib.com` or a subdomain of it. |

## What it will not do

- **Write anything.** GET only, no cookies, no body, redirects not followed.
  No page it asks for changes a row.
- **Run against production by accident.** `storelib.com` and every
  `*.storelib.com` are refused unless `--i-mean-production` is passed.
- **Run away.** Concurrency is capped at 50 and a run at 10 minutes.

It still costs something. Every request that misses the CDN is function time,
and a preview usually reads the same Supabase as production (check Vercel,
Settings, Environment Variables, the Preview column of
`NEXT_PUBLIC_SUPABASE_URL`). Keep runs against a preview to a minute at 10
or fewer in flight unless there is a reason.

## Reading the result

```
4334 requests in 20.0 s (216.5 per second)
all    p50 45 ms  p95 86 ms  p99 113 ms  errors 0.0%  cache hits n/a
  /          1084  p50 57 ms  p95 95 ms  p99 133 ms  errors 0.0%  cache hits n/a
```

- **p50, p95, p99**: time to the last byte of the body, from where the
  script runs. Run it from a machine near the deployment's region, or the
  numbers are mostly the distance.
- **errors**: a network failure, a timeout (15 s), or a status of 500 or
  more. A 404 is an answer and is counted on its own.
- **cache hits**: of the answers carrying `x-vercel-cache`, the share that
  were `HIT`, `STALE` or `PRERENDER`. `n/a` means no answer carried it,
  which is every answer from a server that is not Vercel.

The first seconds of a run are cold: every path misses the CDN once. Run
for at least 20 seconds so they are a small part of the result.

## Targets

For a preview deployment, run from a GitHub runner or a machine in the
same region, 10 in flight, 30 seconds, the default paths:

| Pages | p95 | p99 | Errors | Cache hits |
| --- | --- | --- | --- | --- |
| `/`, `/pricing`, `/features` (held by the CDN) | under 300 ms | under 800 ms | 0 | 90% or more |
| `/explore`, `/p/<slug>`, `/w/<username>` (a minute on the CDN) | under 800 ms | under 2 s | 0 | 70% or more |
| `/robots.txt`, `/sitemap.xml` | under 300 ms | under 1 s | 0 | 90% or more |

A page held by the CDN that misses most of the time is the finding: look at
its `Cache-Control` (`node scripts/smoke-deploy.mjs` prints it) before
looking at the code.

These targets have not been checked against a real preview yet: replace
them with the first measured run plus a margin, and record it here.

### Measured against a local production build

`pnpm build` with placeholder keys, `next start` on the same 4 CPU machine,
no CDN and no database (so `/explore` waits on an address that does not
answer, and `/sitemap.xml` answers 503). A floor for the server's own speed,
not a target for a deployment:

| Run | Requests | p50 | p95 | p99 | Errors |
| --- | --- | --- | --- | --- | --- |
| `/`, `/pricing`, `/features`, `/robots.txt`, 10 in flight, 20 s | 4,334 (216 a second) | 45 ms | 86 ms | 113 ms | 0% |
| The default paths, 10 in flight, 20 s | 687 (33 a second) | 71 ms | 1,938 ms | 2,137 ms | 16.6% (every one `/sitemap.xml`'s 503) |
| The default paths, asked for 75, capped at 50, 20 s | 762 (32 a second) | 329 ms | 4,623 ms | 5,921 ms | 16.7% (the same) |

The second and third rows are what a page waiting on the database does to
everything else: throughput fell from 216 to 33 a second at 10 in flight,
and adding more in flight only made each request slower.

## A local production build with a database that answers: `scripts/load/local-bench.mjs`

There is no staging. `local-bench.mjs` measures the server's own cost per
page: a production build on one machine reading the Supabase stub
(`scripts/supabase-stub-server.mjs`) with the rows in
`scripts/load/local-fixture.mjs` (a creator, three products, a OnePage, a
community, a blog post), so the pages render real markup, not their error
screens. It always aims at `127.0.0.1`; for a preview use
`scenarios.mjs --pages /,/pricing,/blog,/sitemap.xml --product-path /<handle>/<slug> --creator <handle> --site <name>`
(local servers may go to 200 in flight there, anything else stays capped at 50).

```bash
# 1. the stub, while building (static pages read it at build time)
node scripts/load/local-bench.mjs --stub &
STRIPE_SECRET_KEY=sk_test_placeholder RESEND_API_KEY=re_placeholder \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54391 NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
SUPABASE_SERVICE_ROLE_KEY=placeholder NODE_OPTIONS=--max-old-space-size=6144 pnpm build
kill %1
# 2. the matrix (starts the stub and next start itself)
node scripts/load/local-bench.mjs --seconds 20 --levels 10,50,100 --json bench.json
# 3. where the CPU goes: one .cpuprofile per server process
node scripts/load/local-bench.mjs --pages creator,product --levels 10 --cpu-prof /tmp/prof
```

### Measured 2026-11-02 (round 48)

4 vCPU shared with other builds (load average 7 during the run), Node 22,
Next 16.1.7, no CDN, the database answering in about 1 ms. Every answer was a
200 with the fixture's content in it.

| Page | In flight | Requests | Per second | p50 | p95 | p99 | Errors | Peak RSS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 10 | 3,100 | 154.7 | 62 ms | 97 ms | 118 ms | 0% | 474 MB |
| `/` | 50 | 4,166 | 206.8 | 239 ms | 316 ms | 376 ms | 0% | 510 MB |
| `/` | 100 | 4,021 | 199.7 | 484 ms | 697 ms | 844 ms | 0% | 533 MB |
| `/pricing` | 10 | 3,313 | 165.3 | 56 ms | 97 ms | 135 ms | 0% | 538 MB |
| `/pricing` | 50 | 3,758 | 185.6 | 265 ms | 372 ms | 446 ms | 0% | 538 MB |
| `/pricing` | 100 | 3,850 | 190.3 | 524 ms | 651 ms | 742 ms | 0% | 542 MB |
| `/satori` | 10 | 367 | 18.3 | 536 ms | 738 ms | 893 ms | 0% | 636 MB |
| `/satori` | 50 | 427 | 19.9 | 2,516 ms | 3,244 ms | 4,057 ms | 0% | 831 MB |
| `/satori` | 100 | 400 | 19.9 | 4,921 ms | 8,705 ms | 9,564 ms | 0% | 968 MB |
| `/satori/loop-pack-1` | 10 | 337 | 16.8 | 577 ms | 817 ms | 1,178 ms | 0% | 986 MB |
| `/satori/loop-pack-1` | 50 | 350 | 17.3 | 2,745 ms | 4,358 ms | 4,875 ms | 0% | 986 MB |
| `/satori/loop-pack-1` | 100 | 367 | 15.4 | 6,439 ms | 10,470 ms | 11,378 ms | 0% | 1,053 MB |
| `/w/satori` | 10 | 4,277 | 213.3 | 43 ms | 73 ms | 92 ms | 0% | 1,055 MB |
| `/w/satori` | 50 | 4,361 | 217.2 | 216 ms | 350 ms | 679 ms | 0% | 1,055 MB |
| `/w/satori` | 100 | 3,440 | 168.1 | 559 ms | 816 ms | 1,365 ms | 0% | 1,055 MB |
| `/blog` | 10 | 3,734 | 186.6 | 50 ms | 87 ms | 104 ms | 0% | 1,055 MB |
| `/blog` | 50 | 3,994 | 198.4 | 245 ms | 349 ms | 410 ms | 0% | 1,055 MB |
| `/blog` | 100 | 4,249 | 208.4 | 471 ms | 635 ms | 781 ms | 0% | 1,056 MB |
| `/sitemap.xml` | 10 | 2,287 | 114.1 | 82 ms | 140 ms | 192 ms | 0% | 1,058 MB |
| `/sitemap.xml` | 50 | 2,654 | 131.7 | 334 ms | 572 ms | 1,088 ms | 0% | 1,058 MB |
| `/sitemap.xml` | 100 | 3,526 | 173.7 | 545 ms | 776 ms | 1,289 ms | 0% | 1,555 MB |

How to read it:

- **The creator page and the product page are the cost.** Both answer
  `private, no-store`, so every visit is a server render: about 55 to 60 ms
  of CPU each (16 to 17 a second at one in flight), and throughput stays at
  16 to 20 a second whatever the concurrency; more in flight only queues.
  Everything else is held (ISR or `s-maxage`) and serves 150 to 220 a second.
  On Vercel each function instance takes one render at a time per CPU and
  scales out, so this is cost per visit rather than a ceiling, but it is the
  number to watch.
- **`/sitemap.xml` runs four `count` reads per request** (products,
  creators, websites, communities). On Vercel it is `s-maxage=3600` with a
  day of stale, so the CDN almost never asks; locally it is the slowest
  cached page.
- **Memory does not leak.** RSS climbs to about 1.5 GB over a long run,
  but with `--max-old-space-size=384` the same five 20 second runs of 100 in
  flight stay at 478 to 506 MB with the same throughput: V8 grows the heap
  because nothing asks it not to.

Where the CPU went (`--cpu-prof`, creator, product and sitemap at 10 in
flight, 71 s of samples): Next's own render and request handling 23%,
Node core 35% (undici `fetch` 7%, async hooks and AsyncLocalStorage 6%,
gzip 3% which Vercel does at the edge instead, one time module loading 4%),
garbage collection 7.5%, the app's own code 7.3% spread so thin that no
single function is above 0.25% self time. The largest app frames are the
fetch wrappers (`lib/net/deadline.ts`, `lib/storage/media-url.ts`
`mediaFetch`), whose time is the fetch underneath, and Next's per request
fetch de-duplication. No repeated JSON parsing, no regular expression built
per request and no synchronous heavy work showed up, so nothing was changed
for speed in round 48. The lever is fewer database round trips per creator
and product render (11 for `/<handle>`), or letting the CDN hold those pages
for visitors without a session.

## Where the cache ratio for real traffic comes from

The script measures the cache for its own requests. For real visitors,
Vercel adds `x-vercel-cache` after the function has answered, so the app
never sees it and cannot report it cheaply. It is in Vercel, the project,
**Observability**, **Edge Requests** (the cache column, by path).

## The key paths: `scripts/load/scenarios.mjs`

`storefront.mjs` above is read only. `scenarios.mjs` drives what visitors and
buyers actually do, including two writes, so it is for a **staging**
deployment only: a Vercel preview that reads a staging Supabase project and
Stripe test keys (set up below). Plain Node `fetch`, no dependency.

| Scenario | Request | Needs | Writes |
| --- | --- | --- | --- |
| `onepage` | `GET /l/<slug>` (or `--onepage-path`) | `--onepage` | no |
| `creator` | `GET /<handle>` | `--creator` | no |
| `site` | `GET /w/<name>`; an imported theme: `--site-path /api/site-theme/site/<name>/` | `--site` or `--site-path` | no |
| `assets` | each of `--assets`, plus `/robots.txt`, `/favicon.ico` | any scenario | no |
| `collect` | `POST /api/track-view` (the analytics beacon) | `--creator-id <uuid>` | a page view row |
| `checkout` | `POST /api/checkout/stripe-session` (makes a PaymentIntent) | `--product <uuid>` **and** `--checkout` | a Stripe test PaymentIntent, a checkout start |

```bash
LOAD_ALLOW_HOSTS=storelib-staging.example.dev \
node scripts/load/scenarios.mjs --base https://storelib-git-staging-team.vercel.app \
  --onepage demo --creator demo --site demo \
  --assets /api/site-theme/assets/<install>/<version>/theme.css \
  --creator-id <demo creator uuid> --product <demo product uuid> --checkout \
  --concurrency 10 --rate 20 --seconds 60
```

| Option | Environment | Default | |
| --- | --- | --- | --- |
| `--base` | `BASE_URL` | none | Required. |
| `--seconds` | `LOAD_SECONDS` | 30 | At most 600. |
| `--concurrency` | `LOAD_CONCURRENCY` | 10 | In flight at once, at most 50. |
| `--rate` | `LOAD_RATE` | no cap | Requests started per second across all workers, at most 500. |
| `--scenarios` | `LOAD_SCENARIOS` | every configured one | Comma list to keep. |
| `--onepage`, `--onepage-path`, `--creator`, `--site`, `--site-path`, `--assets`, `--creator-id`, `--product` | `LOAD_ONEPAGE`, `LOAD_ONEPAGE_PATH`, `LOAD_CREATOR`, `LOAD_SITE`, `LOAD_SITE_PATH`, `LOAD_ASSETS`, `LOAD_CREATOR_ID`, `LOAD_PRODUCT` | | What to load. |
| `--checkout` | | off | Without it, `--product` does nothing. |
| | `LOAD_STRIPE_PUBLISHABLE_KEY` | | The target's `pk_test_` key, when the script cannot find it in the target's pages. |
| | `LOAD_ALLOW_HOSTS` | | Comma list of exact host names that are staging. |
| `--json` | | | Also print the result as JSON. |
| `--i-know-this-is-production` | | | See below. Never do this for `collect` or `checkout`. |

### What it will not do

- **Aim at production by accident.** It is an allow list: `localhost`,
  loopback and private addresses, Vercel branch previews
  (`*-git-*.vercel.app`) and `LOAD_ALLOW_HOSTS`. Everything else, and always
  `storelib.com`, `storelib.me` and their subdomains, is refused unless
  `--i-know-this-is-production` is passed. A creator's custom domain or a
  production deployment's own `*.vercel.app` address is production too,
  which is why it is not a deny list.
- **Touch live Stripe.** Before a checkout run it reads the creator page (or
  `/`) and up to 40 of its scripts for the publishable key. `pk_live_`
  anywhere refuses the run, whatever flags are passed. No key found refuses
  it too, unless `LOAD_STRIPE_PUBLISHABLE_KEY` is the target's `pk_test_`
  key. Buyers are `load+<n>@example.com`; no card is entered, so no payment
  is made: a PaymentIntent is created and left unconfirmed.
- **Send cookies.** Every request is a stranger's.

`/api/checkout/stripe-session` is rate limited per address and per email
(`lib/api/rate-limit.ts`), so a long checkout run from one machine ends in
429s. They are counted on their own (`429`), not as errors. Measure checkout
in short runs, or with `LOAD_SCENARIOS=checkout --rate 2`.

### Reading the result

```
500 requests in 5.1 s (99.0 per second)
all        p50 27 ms  p95 44 ms  p99 46 ms  errors 0.0%  4xx 20  429 4
  onepage       84  p50 28 ms  p95 44 ms  p99 46 ms  errors 0.0%  4xx 0  429 0
  checkout      83  p50 27 ms  p95 44 ms  p99 46 ms  errors 0.0%  4xx 0  429 4
```

errors are network failures, 15 s timeouts and statuses of 500 or more; `4xx`
(other than 429) and `429` are answers, counted apart. The run above is the
script against a local stub server (it proves the script, not the app). The
same targets as above apply to the pages; for `collect` the answer should be
a 204 in under 300 ms at p95, and for `checkout` under 2 s at p95 (it calls
Stripe).

### Set up a staging copy (one time, the owner)

A preview deployment reads production's Supabase unless told otherwise, so
`collect` and `checkout` must not run against an ordinary preview.

1. **Supabase**: create a second project (`storelib-staging`, the free plan is
   enough for a load test at these rates). Apply the schema: run the files in
   `supabase/sql/run-now/` in order in its SQL editor (the same parts as
   production, `docs/operations/admin-sql-updates.md`). Create one demo
   creator with a OnePage, a published website and one paid product by
   signing up on the staging preview. Never copy production data into it.
2. **Stripe**: use the test mode keys of the same Stripe account (`sk_test_`,
   `pk_test_`), and a test mode Connect account for the demo creator.
3. **Vercel**: Settings, Environment Variables. Add the staging values for
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` scoped to
   **Preview** and the branch `staging` only (the "Preview (staging)"
   branch filter), so other previews keep their settings. Leave Mailgun
   unset there (no real email) and `ALERT_EMAIL` unset.
4. Push the commit to test to a branch named `staging`. Its branch address,
   `storelib-git-staging-<team>.vercel.app`, is allowed by the script
   without a flag. If previews are behind Vercel Authentication, use a
   Protection Bypass for Automation secret (release-safety.md) or turn
   protection off for that branch while testing.
5. Run from a machine near the deployment's region (`iad1`), one minute at
   10 in flight first, and record the numbers here.
