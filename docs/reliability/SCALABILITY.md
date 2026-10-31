# Scalability

Where the current setup runs out, what breaks first as traffic grows, and
what to do about it while staying on Next.js, Vercel, Supabase and Stripe. No
Kubernetes, no microservices: the bottleneck is the database, not the app
tier.

## 1. Current limits and bottlenecks

| Limit | Where | Why it matters |
| --- | --- | --- |
| One Vercel region (`iad1`) | `vercel.json` | every dynamic request runs in Virginia, next to the database. Good for database latency, slower for far visitors on uncached pages. A region outage takes the app down; the CDN keeps cached pages answering. |
| One Supabase project | all data | sites, checkout, dashboard, crons, webhooks and analytics ingestion share one Postgres, one connection pool and one PostgREST. A heavy dashboard query competes with a buyer's checkout. |
| Connection pool | Supabase pooler | "Timed out acquiring connection from connection pool" appeared 7 times on 10-27. Each Vercel instance opens its own HTTP connections to PostgREST; pool size is set by the Supabase compute tier (check the plan). |
| PostgREST statement timeouts | API roles | 8s for `authenticated` per the code comment in `deadline.ts` (project value UNPROVEN). Large single-statement work (theme publish, SITE-5) hits it; 56 theme-file reads did. |
| PostgREST max rows (1,000) | default | several dashboard reads silently truncate at 1,000 (DB-4, DB-5, DB-7). |
| In-memory state per instance | last-good site copies, proxy held answers, Stripe breaker, analytics answer cache, JWKS | scale-out creates empty instances exactly when traffic and database pressure rise. A breaker on one instance does not protect the others. EVD-1. |
| Crons on fixed schedules | 16 jobs, several every 5 minutes | each run is one function with a 60s or 300s limit; work that grows with the number of stores (translation, warm-sites, seo-index, notify) eventually does not fit in one run. Several already hit their limit. |
| Realtime with RLS | community chat | cost per message grows with subscribers (DB-10). |
| Analytics ingestion | one row per page view into `analytics_events` with about 21 indexes | write amplification grows with traffic (DB-12). |

## 2. What breaks at 10x and 100x

Estimates from the code paths, not measured; a staging load test is in Batch 6.

| Area | At 10x | At 100x |
| --- | --- | --- |
| Published sites and OnePages | more cold instances during spikes; without a persistent last-good copy, every database blip shows more "one moment" pages | uncached dynamic reads dominate database load; CDN hit ratio becomes the main lever |
| Dashboard | the ~40 requests per Home load and 1,000-row truncation become visible to big stores; unbounded analytics fallback (DB-2) can stall the database | dashboard reads need their own budget or a read replica |
| Checkout and webhooks | fine if DB-1 and PAY-12 are fixed; Stripe rate limits on the platform account start to matter if Payouts and Orders keep fanning out (PAY-4, DB-8) | webhook bursts need fast answers and deferred follow-ups (already journaled) |
| Crons | translation, warm-sites, seo-index and notify runs do not finish inside one invocation; leases prevent overlap but work falls behind | crons must process in claimed batches and chain, or move to a queue |
| Analytics | rollups lag; raw-event reads for "today" get slower | ingestion should batch, and indexes must be pruned |
| Community chat | Realtime lag in large spaces | Broadcast instead of Postgres Changes |
| Storage | fine (object storage) | egress cost rather than capacity |

## 3. Recommendations (in order)

1. **Make the database do less per request.** Fix the dashboard findings
   (DB-2, DB-3, DB-6, DB-7, DB-8), remove auth calls on public routes (EVD-3),
   add the trigram indexes (DB-9), drop duplicate indexes after checking
   (DB-12). Cheapest and largest effect.
2. **Lean on the CDN.** Public pages that can be cached should be: theme
   sites already use ISR; OnePages use a 60s data cache. Measure the real hit
   ratio in Vercel Observability, Edge Requests, and fix the pages that miss.
3. **Persist last-good copies** in the Next data cache rather than instance
   memory (EVD-1), so scale-out instances can serve during a blip.
4. **Bound everything.** Every external call has a deadline (DB-1 closes the
   last gaps); every cron has a run-wide deadline (SHR-3, SHR-4, EVD-4); every
   route that can run long declares `maxDuration` (DB-11).
5. **Size the Supabase compute to the evidence.** Read CPU, connections and
   slow queries for the 10-27 and 10-28 incidents (manual action) before
   paying for more; then decide. Consider Supavisor transaction mode or a
   read replica for dashboard reads only when the numbers say so.
6. **Keep one region** until there is evidence of far-away latency problems on
   dynamic pages. Moving the app away from the database region makes every
   query slower.
7. **Shared rate-limit and breaker state** only if per-instance behaviour
   proves insufficient: Postgres is already used for rate limits; a breaker
   can stay per instance.

## 4. When a durable queue becomes justified

Today background work is: Vercel crons, `after()` inside requests, and
Postgres outboxes with leases (`order_followups`, notify jobs,
`community_jobs`, translation jobs, marketing jobs). That is a queue built on
Postgres, and it is enough while:

- each cron run finishes its backlog inside its limit most of the time;
- a lost `after()` task is repaired by a sweep (follow-ups are, emails via the
  outbox are);
- retry timing in minutes is acceptable.

A managed durable queue (for example Vercel Queues or a hosted queue from the
Vercel Marketplace; check current options and pricing) becomes justified when
any of these hold for more than a week:

- a cron's backlog grows across runs (`cron_runs` shows runs ending at their
  limit with work left), as translation and warm-sites start to show;
- work needs retry in seconds, not at the next cron tick (for example
  webhook follow-ups after an outage, at volume);
- fan-out work (one event to thousands of emails or pushes) no longer fits in
  one invocation even in batches;
- outbox polling itself becomes a noticeable share of database load.

Until then: keep outboxes in Postgres, claim with `FOR UPDATE SKIP LOCKED`
and leases, give every cron a run-wide deadline, and record backlog size in
`cron_runs` so the decision can be made from numbers.
