# Performance

Baselines measured from code and production logs, the targets we hold to, and
the changes planned. Findings referenced by ID are in [AUDIT.md](AUDIT.md).

## 1. Baselines

### Database round trips per dashboard load (from code, DB audit)

| Page | PostgREST requests | Serial waves | Notes |
| --- | ---: | ---: | --- |
| `/app` Home | about 40 | about 5 on the critical path (auth → creator → store_settings → currency probe → `analytics_all_time`) | Layout 11-13 requests in 3 waves; page 26-28, of which about 6 duplicate the layout's reads through a different client. Then the browser calls `/api/analytics/reports` (2 RPCs). |
| `/app/products` | 12-14 | 3-4 | Page itself adds one `products select('*')`; the cost is payload (DB-7). |
| `/app/payouts` | many, plus about 14 Stripe calls on open and 8 per 2 minute tick | | PAY-4, DB-5 |
| `/app/orders/sales` | list plus up to 60 Stripe PI reads in `after()` per visit | | DB-8 |

### Function time limits (`maxDuration`, 68 routes declare one)

| Limit | Routes | Examples |
| --- | ---: | --- |
| 300s | 16 | crons process-scheduled-emails, notifications, rollup-daily, storage-cleanup, strip-image-metadata, translation-jobs, translations; builder agent, sections code, backup restore; AI sites agent; upload bundle and server-upload; email send; store translation jobs and rules |
| 120s | 2 | AI sites publish, store translation draft |
| 60s | about 39 | crons community, memberships, notify, physical, seo-index, warm-sites; GitHub webhook; payments; uploads; most builder routes |
| 30s | 8 | community files, `v1/analytics`, website-builder files, internal invalidate |
| 15s / 10s | 3 | link previews, unfurl, gifs |
| none declared | rest | includes both Stripe webhooks, `/api/analytics/reports`, theme publish, crons fx-rates, release-holds, purge-chat-attachments (DB-11, SITE-5) |

Full list: DB audit appendix, summarised in [AUDIT.md](AUDIT.md) DB-11.

### Request deadlines

| Layer | Limit | Source |
| --- | --- | --- |
| Supabase auth | 10s | `lib/net/deadline.ts` |
| Supabase read | 20s, up to 2 retries inside it | same |
| Supabase write | 30s, never retried | same |
| Supabase RPC | 60s | same |
| Supabase storage | 30s read, 120s write (server) | same |
| Proxy reads | 5s | proxy.ts:46-53 |
| Public site read (`siteRead`) | 4s first attempt, 7s whole read; the second attempt gets the 3s left, which is the "no answer in 3000ms" in production logs | `lib/website-builder/site-read.ts` |
| Stripe | 20s per attempt, 2 retries, breaker | `lib/stripe/resilience.ts` |
| Mailgun | 15s per attempt | `lib/mailgun.ts` |
| GitHub | 25s per attempt, 4 attempts | `lib/github-sync/github.ts` |
| Dashboard extras | 2-2.5s caps on Home banner sales, commerce actions, businesses; Payouts Stripe 2.5s | `app/app/page.tsx`, `app/app/payouts/page.tsx` |

### Production signals (7 days to 2026-10-31)

- About 1,360 published-site requests got no page because a read took longer
  than the 7s site budget or failed; 407 were saved by a last-good copy.
- 41 functions hit 300s or 60s limits; in the last 48 hours only crons.
- 48 Supabase auth calls took longer than 10s, several on public routes.
- 56 theme-file reads hit the Postgres statement timeout.

### Frontend budgets (from [release-safety.md](../operations/release-safety.md), measured 2026-10-15)

| Route | First load (gzip) | Budget |
| --- | ---: | ---: |
| `/` | 511 KB | 563 KB |
| `/pricing` | 504 KB | 555 KB |
| `/explore` | 527 KB | 581 KB |
| `/p/[slug]` | 702 KB | 773 KB |
| `/app` | 633 KB | 697 KB |
| `/website-builder/editor/[installId]` | 1,329 KB | 1,462 KB |
| `/w/[username]` | 641 KB | 706 KB |
| `/checkout/site` | 493 KB | 543 KB |
| Server output | 218 MB | 240 MB |

CI fails a build over budget; build memory must stay under 7,600 MB.

### Load test floor

Local production build without CDN or database: 216 requests a second at 10
in flight for static pages (p95 86 ms). With a page waiting on an unreachable
database in the mix, throughput fell to 33 a second. Targets against a real
preview are not yet measured ([load-testing.md](../operations/load-testing.md)).

## 2. Targets

| What | Target | Today |
| --- | --- | --- |
| Home PostgREST requests | 30 or fewer, critical path 3 waves | about 40, 5 waves |
| Home server render with a hung analytics RPC | under 3.5s | waits for the RPC deadline (60s) or longer for mixed-currency stores |
| Products RSC payload | named columns only | `select('*')` |
| Payouts Stripe calls | at most 4 on open (or 0 with fresh SSR data), at most 4 per tick | about 14 and 8 |
| Orders Stripe calls | 0 on most visits (sweep at most every 6-24h per creator) | up to 60 per visit |
| Published site "no page" responses | under 10 a day outside a declared database incident | about 190 a day |
| Functions hitting their limit | 0 a day | several a day (crons) |
| Auth calls on public routes | 0 | present |
| Load test (preview, 10 in flight) | as in [load-testing.md](../operations/load-testing.md): CDN pages p95 under 300 ms, `/w/<user>` p95 under 800 ms | not measured |
| Bundle and build | as the budgets above | within budget |

## 3. Planned changes

| ID | Change | Expected effect |
| --- | --- | --- |
| DB-6 | layout stops fetching `draft_blocks` and every product id | less egress and parse time on every /app navigation |
| (DB audit note) | Home reuses the request-scoped creator, profile, products, domains and site reads from the layout | removes about 6 duplicate reads per Home load |
| DB-3 | cap sales totals at 3s, no FX download in renders, memoize the currency probe | Home never blocks on a slow totals path |
| DB-2 | no raw-event fallback on transient errors; 15s budget; `maxDuration = 60` | no load amplification during database slowness |
| DB-7 | named columns and paging on Products | smaller payload; no silent cut at 1,000 |
| DB-4, DB-5 | creator-scoped keyset reads on Customers, Payouts, tax summary | correct totals; no URL-length failures |
| DB-8 | throttle the Orders refund sweep | far fewer Stripe calls |
| DB-9 | trigram indexes on buyer email | index scans instead of per-creator scans on lookups |
| DB-10 | chat Realtime INSERT only | fewer RLS function calls per message |
| PAY-4 | one fetch per tick plus a per-account cache | about 70% fewer Stripe calls on Payouts |
| PAY-12 | short Stripe reads and emails in `after()` in the payment webhook | webhook answers in under 2s |
| EVD-1 / SITE-12 | persistent last-good site snapshot | cold instances can serve a page during database slowness |
| EVD-3 | no auth call on public routes | saves up to 10s per affected request during Auth slowness |
| SHR-3, SHR-4, DB-11, EVD-4 | run-wide cron deadlines | crons finish inside their limit |
| Batch 6 | load test on staging | real numbers for the targets above |
