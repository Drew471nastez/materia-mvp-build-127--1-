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

## Where the cache ratio for real traffic comes from

The script measures the cache for its own requests. For real visitors,
Vercel adds `x-vercel-cache` after the function has answered, so the app
never sees it and cannot report it cheaply. It is in Vercel, the project,
**Observability**, **Edge Requests** (the cache column, by path).
