# Costs

What the findings and the planned changes cost, which paid options exist and
their free alternatives, and where money is being spent for nothing today.
No prices are quoted here: plans and prices change, so check each provider's
current pricing page before deciding.

## 1. Cost of the planned fixes

Every item in Batches 1 to 5 of [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
is a code change or an additive SQL part. None adds a service, a plan upgrade
or a new paid dependency. Net effect on running cost is expected to be
**zero or lower** (fewer function-seconds, fewer Stripe and Auth calls, less
database egress).

| Change | Running cost effect |
| --- | --- |
| Deadlines on raw clients (DB-1) | lower: no 300s hung invocations |
| Analytics fallback bounded (DB-2) | lower: no minute-long raw scans |
| Payouts single fetch and cache (PAY-4) | lower: about 70% fewer Stripe calls and invocations on that page |
| Orders refund sweep throttle (DB-8) | lower: up to 60 Stripe calls saved per Orders visit |
| Layout and Products columns (DB-6, DB-7) | lower egress per dashboard navigation |
| Trigram indexes (DB-9) | small extra storage and write cost on `orders` and `commerce_checkouts`; lower CPU on lookups |
| Rate limits (SEC-2, SEC-5, SEC-6) | a few rows in `rate_limit_hits`; protects Mailgun spend |
| Persistent last-good site copy (EVD-1) | small Next data cache use; fewer "no page" visits |
| Storage bucket size limit (SHR-1) | caps worst-case storage and egress from abuse |
| Cron run-wide deadlines | lower: runs end before the platform kills them |

## 2. Optional paid items and their alternatives

| Item | What it buys | Free or cheaper alternative | Recommendation |
| --- | --- | --- | --- |
| Supabase compute upgrade | more CPU, memory and pool connections; fewer statement timeouts and pool exhaustion | first do the query fixes (DB-2, DB-3, DB-6, DB-8, DB-9, EVD-1, EVD-3) and read the Supabase reports for 10-27 and 10-28 | decide after the review in [MANUAL_ACTIONS.md](MANUAL_ACTIONS.md); check current Supabase pricing |
| Supabase Point in Time Recovery add-on | restore to any second in 7 days instead of last night | the nightly off-site dump (already built, see [backups.md](../operations/backups.md)) | worth it for a payments platform; check current pricing |
| Vercel log drain or observability integration | searchable long-term logs, dashboards, alerting on log patterns | `error_events` + email and webhook alerts (already built), Vercel's own log retention, `/admin/performance` | optional; add when structured logs (Batch 6) exist; check current Vercel and vendor pricing |
| External uptime monitor | checks from outside GitHub and outside the US, status page | `.github/workflows/uptime.yml` every 15 minutes (already built, free) | optional; free tiers of common monitors may be enough; check current pricing |
| Managed durable queue | retries in seconds, fan-out beyond one invocation | Postgres outboxes with leases (current) | not yet; see [SCALABILITY.md](SCALABILITY.md) section 4 |
| Staging Supabase project | safe load tests and query plans | none that is safe; previews read production data today | recommended; a second project has its own plan cost, check current pricing |
| Gemini paid tier | EEA-compliant translation | Cloudflare Workers AI free tier first (`TRANSLATE_PROVIDERS=cloudflare,gemini`) | owner decision on EU terms |

## 3. Wasted spend found

| Waste | Evidence | Fix |
| --- | --- | --- |
| `auth/v1/user` calls on public routes (robots.txt, site-theme assets and covers, analytics own token, builder polling) | 48 calls over 10s in 7 days; dozens of auth lines per day on paths that need no user | EVD-3 |
| 14 Stripe calls per Payouts open, 8 per 2 minute tick while the tab is open | `payouts-client.tsx`, `/api/stripe/payouts` | PAY-4 |
| Up to 60 Stripe PaymentIntent reads per Orders visit, the same intents re-checked every visit | `app/(storelib)/app/orders/sales/page.tsx:43-127` | DB-8 |
| Raw analytics scans: up to 200,000 rows per span when the RPC fails | `lib/analytics/report-read.ts` | DB-2 |
| Analytics rollup failures unnoticed, so reports read raw events (19s against 0.7s per the code comment) | `rollup-daily` answers 200 on failure | SHR-6 |
| `draft_blocks` and every product id fetched and discarded on every /app navigation | `app/(storelib)/app/layout.tsx:157-188` | DB-6 |
| Full product rows (`select('*')`) serialised to the browser | `app/(storelib)/app/products/page.tsx` | DB-7 |
| About 6 duplicate reads per Home load | DB audit round-trip count | Home reuses layout reads |
| Hung invocations held to 300s during database incidents | 41 timeouts in 7 days | DB-1, already reduced by `21c0882e5` |
| Crons killed at their limit, then re-run from the start | seo-index, physical, warm-sites, community, notify in 48h | SHR-3, SHR-4, EVD-4 |
| Duplicate indexes on `analytics_events` and `orders` | DB-12 | owner decision after the read-only check |
| Hugging Face translation token with exhausted credits, still tried | 19 errors in 7 days | remove `HF_TOKEN` (manual action) |
| Possible open mail relay via verify-email | SEC-5 | SEC-1, SEC-5 |

## 4. Financial risk reduced by the fixes (not running cost)

- Double charges and dispute fees (PAY-1).
- Guest order takeover, refunds and chargebacks (SEC-1).
- Platform takeover through the admin fallback (SEC-2).
- Creator funds stuck after a failed payout (PAY-2).
- Lost sales while sites, Creator Pages and OnePages show 404 or 503 during
  database slowness (SITE-2, SITE-3, SITE-4, EVD-1).
- Unbounded AI token spend during incidents (SITE-7).
- Stores disconnected from payouts by a platform-side Stripe permission
  problem (PAY-7).
