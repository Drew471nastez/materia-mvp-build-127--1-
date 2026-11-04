# Implementation plan

How the findings in [AUDIT.md](AUDIT.md) are being fixed, in what order, how
each change is undone, and how it is proven. Progress is recorded in
[IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).

## Ground rules (binding for every batch)

- Never break existing behaviour: published sites, OnePages, orders,
  subscriptions, community data and permissions, auth behaviour, SEO URLs.
- Small commits, one concern each. Every fix has a regression test in
  `tests/*.test.ts` that fails before and passes after (or the report says the
  "fails before" part could not be shown).
- No weakening of auth, RLS or tenant isolation. Never bypass RLS for speed.
- Database changes only additive and idempotent, prepared as SQL parts for the
  owner to run (`supabase/sql/run-now/NN_*.sql` plus the migration copy,
  catalog and README row). The highest existing part on the base branch is
  344; fix agents report the number they used.
- Gates before a push: `npm run test:push`, `node scripts/ci/typecheck-ratchet.mjs`
  no worse, `pnpm lint` on touched files; production build only when
  build-sensitive config changed.
- No production writes, no live Stripe, no real emails.
- Fix branches: `claude/rel-security`, `claude/rel-commerce`,
  `claude/rel-sites`, `claude/rel-shared`, `claude/rel-db`. Vercel never
  deploys `claude/*` branches. Nothing reaches production until the owner
  approves the merge (see [MANUAL_ACTIONS.md](MANUAL_ACTIONS.md), action 1).

## Default rollback for every code item

Each fix is its own commit, so `git revert <sha>` on `main` followed by a
normal deploy undoes it. If a deploy itself is bad, Vercel Instant Rollback
([rollback.md](../operations/rollback.md), section 1) restores the previous
deployment in seconds. SQL parts are additive: a code rollback never needs a
database rollback. Where an item needs something more specific, it is in the
Rollback column.

## Batch 1: security critical (`claude/rel-security`)

| ID | Change | Rollback | Verification |
| --- | --- | --- | --- |
| SEC-1 | verify-email and confirm-email require a session, send and check only `user.email`; additive trigger `profiles_keep_email_verified` as an SQL part | revert commit; trigger can be disabled with `ALTER TABLE profiles DISABLE TRIGGER …` without dropping | route tests (401 without session, mismatch 400); SQL test that `authenticated` cannot change `email_verified` |
| SEC-2 | rate-limit admin login, log failed attempts; owner sets the three env vars | revert commit; env vars can stay | 6th bad login in 5 min is 429; `tests/admin-auth.test.ts` passes |
| SEC-3 | fetch shim: 500/429 on `POST /auth/v1/token` becomes 503 so the SDK keeps the session | revert commit | mocked 500 and 429 keep cookies; 400 `refresh_token_not_found` still signs out |
| SEC-5, SEC-6 | `rateLimit` plus attempt counters on verify-email, confirm-email, confirm-device | revert commit | 6th / 11th call gets 429; right code after lockout refused |
| SEC-4 | GET sync-session refuses cross-site and same-site; later retire GET after log check | revert commit | GET with `same-site` sets no cookies |
| SEC-8 | `/auth/continue` passes `fallbackClaims` | revert commit | timed-out `getUser` with claims lands on destination |
| SEC-7 | `safeReturnTarget` allows only apex and platform hosts | revert commit | creator subdomain rejected; apex and `help.` accepted |

## Batch 2: payments correctness (`claude/rel-commerce`)

| ID | Change | Rollback | Verification |
| --- | --- | --- | --- |
| PAY-1 | re-read PI on non-card errors; never say "Nothing was charged" unless unpaid; client treats 5xx as lost answer | revert commit (response shapes unchanged) | fake Stripe: connection error plus `succeeded` gives 200; both failing gives 503 |
| PAY-2 | payout handlers rethrow ledger and lookup errors so Stripe retries | revert commit; replays are deduplicated by the `payout:<id>:<outcome>` key either way | fake DB failing once: 500 then single post |
| PAY-3 | throw on entitlement insert errors (except 23505) | revert commit | step recorded `failed`; sweep inserts it |
| PAY-6 | throw on webhook lookup and write errors; resolve invoice creator via `resolveCreatorForSubscription` | revert commit | select error gives 500; missing row still writes invoice |
| PAY-4, PAY-5 | one fetch per tick, per-account single-flight cache, additive `unavailable` flags | revert commit | call counts; prior rows kept on `unavailable` |
| PAY-7 | probe platform before auto-release; env kill switch `STRIPE_AUTO_RELEASE=off` | set the env var to `off` (no deploy of code needed beyond a redeploy) or revert | no release when platform probe fails |
| PAY-8 to PAY-12 | lower priority; PAY-8, PAY-11, PAY-12 done in wave 2 (`claude/rel2-commerce2`); PAY-9 designed below, not built | revert commit | per AUDIT.md |

## Batch 3: sites availability (`claude/rel-sites`)

| ID | Change | Rollback | Verification |
| --- | --- | --- | --- |
| SITE-2 | AI-site route reads through `siteRead`, 503 on error, in-memory last-good prefix, no 301 on error | revert commit | `57014` gives 503 not 404/301; last-good gives 200 |
| SITE-1 | AI-site publish compensates a failed switch; later an RPC (additive SQL) | revert commit | failed second update keeps previous deployment live |
| SITE-3 | `readPublicRowStrict`; storefront gate redirects only after a successful read; 307 for onboarding | revert commit | erroring read throws, no `permanentRedirect` |
| SITE-4 | OnePage lookups bounded; last-good or throw, never `notFound()` on error | revert commit | rejected lookup never gives missing |
| SITE-6 | slug check fails closed | revert commit | count error aborts publish |
| SITE-5 (b, c) | retry `publish_theme_install` once on transient errors; `maxDuration = 120` | revert commit | first `57014` then OK gives 200 |
| SITE-7 | AI runs fail closed on limit read errors | revert commit | 503 with no provider call |
| SITE-8 | proxy subdomain branch answers 503 when nothing is held | revert commit | failing read with empty maps gives 503 |
| SITE-10 | `exactIlike` in creator lookups | revert commit | escaped pattern sent |
| EVD-1 / SITE-12, EVD-2 | persistent last-good in the Next data cache; HTML or truncated bodies treated as transient | revert commit | primed cache plus failing DB on fresh instance gives 200 |

## Batch 4: shared systems and crons (`claude/rel-shared`)

| ID | Change | Rollback | Verification |
| --- | --- | --- | --- |
| SHR-1 | `communityFilesExist` enforces size and verdict (or runs complete inline); owner sets bucket size limit | revert commit; bucket limit can be raised in the Supabase dashboard | oversized or refused object without complete is refused and removed |
| SHR-2 | payout push to `user_id`, inside `after()`; `maxDuration` | revert commit | sender called with `user_id` |
| SHR-3, SHR-4 | run-wide cron deadlines in community and physical | revert commit | fake slow steps stay under 55s |
| SHR-5 | `createAdminClient()` in scheduled-emails cron and Mailgun webhook (coordinate with DB-1) | revert commit | grep test |
| SHR-6 | rollup-daily answers non-2xx when an RPC failed | revert commit | `reportError` called on RPC error |
| SHR-7 | Web Push `timeout: 8000` | revert commit | never-answering stub fails in about 8s |
| SHR-8 to SHR-10 | lower priority | revert commit | per AUDIT.md |
| EVD-4 | run-wide deadlines for seo-index, warm-sites, notify (not yet assigned) | revert commit | fake clock tests |

## Batch 5: database and dashboard (`claude/rel-db`)

| ID | Change | Rollback | Verification |
| --- | --- | --- | --- |
| DB-1 | replace raw clients with `createAdminClient()` / `mediaFetch`; grep guard | revert commit | never-resolving fetch rejects with `DeadlineExceeded` |
| DB-2 | analytics falls back to raw rows only when the function is missing; 15s budget; `maxDuration = 60` | revert commit | `57014` never reads `analytics_events` |
| DB-6 | layout drops `draft_blocks`, `.limit(1)` on products, real published flag | revert commit | select string and limit asserted |
| DB-3 | cap `creatorSalesTotals` at 3s; no FX download from renders | revert commit | Home resolves under 3.5s with a hanging RPC |
| DB-7 | named columns and paging on Products | revert commit | 1,003 rows render |
| DB-11 | cron budgets, `maxDuration = 60` on Stripe webhooks | revert commit | fake clock tests |
| DB-8 | throttle the Orders refund sweep | revert commit | second render makes no PI calls |
| DB-4, DB-5 | creator-scoped keyset reads on Customers, Payouts, tax summary | revert commit | 1,500 rows over two pages sum correctly |
| DB-9 | trigram indexes IDX-1, IDX-2 as standalone `CONCURRENTLY` statements, owner runs them | `DROP INDEX CONCURRENTLY <name>` (owner decision) | `EXPLAIN` in staging |
| DB-10 | chat Realtime INSERT only | revert commit | channel registered with INSERT |

## Batch 6: later (needs owner decisions, access or staging)

| Item | Why | Depends on |
| --- | --- | --- |
| Correlation IDs | tie a request across proxy, route, Supabase and Stripe logs; today a log line cannot be followed end to end | small change in `proxy.ts` (set `x-request-id`) and `lib/observability/report.ts` |
| Structured logs | JSON log lines with route, status, elapsed ms, request id, so Vercel log search and a drain can group them | log drain decision ([COSTS.md](COSTS.md)) |
| Durable queue evaluation | today background work is crons plus `after()` plus Postgres outboxes; see [SCALABILITY.md](SCALABILITY.md) for when a queue is justified | measured backlog numbers |
| CSP enforce (SEC-12) | CSP is report-only; enforce after `/api/csp-report` is clean for a period | review of report data |
| `Permissions-Policy` on apex app routes (SEC-12) | defence in depth | none |
| Load test on staging | `scripts/load/storefront.mjs` targets are unmeasured against a real deployment; a preview reads production Supabase | staging Supabase project ([MANUAL_ACTIONS.md](MANUAL_ACTIONS.md)) |
| Full IDOR sweep | only about 12 of 300+ service-role routes were sampled | time budget |
| EVD-5 `/500` page | missing static file | reproduce in a production build |
| SITE-9 draft asset token, SITE-1 RPC, SITE-5(a) | larger changes | additive SQL approval |
| Supabase compute review | DB incidents drive most production errors | Supabase dashboard read access |

## PAY-9: a stable product checkout idempotency key (designed, not built)

**Re-evaluated in wave 2 and left on purpose.** A safe design exists, but it needs a new table (an SQL part for owner approval) and a change to every page that starts a product checkout, on the most used money path. What it would buy is small today: since PAY-1 the pages keep the PaymentIntent they made and confirm it again on Pay again (`lib/checkout/pay-retry.ts`), so a second press does not make a second charge. What is left is an unconfirmed second PaymentIntent when the answer to the create request itself is lost, which costs nothing and charges nobody.

**Why the key cannot simply be made stable now.** `app/api/checkout/stripe-session/route.ts` builds the metadata with a fresh `access_token`, `session_fingerprint` and `receipt_token` (nanoid, `generateReceiptToken()`) and `agreed_at: new Date()` on every request, and keys the create with `stripeIdempotencyKey("product-intent", [creator, product], params)`. Stripe refuses a reused key whose parameters differ, so a stable key needs the same parameters: the same tokens and the same `agreed_at`. Deriving the tokens from an id the browser sends was rejected: the receipt token opens the download, and anyone who learned that id could rebuild it.

**The design.**

1. Additive table `checkout_attempts` (SQL part, next free number at the time): `id uuid primary key default gen_random_uuid()`, `attempt_key text unique not null`, `creator_id`, `product_id`, `buyer_email`, `access_token`, `session_fingerprint`, `receipt_token`, `agreed_at timestamptz`, `params_hash text`, `payment_intent_id text`, `created_at`, `expires_at` (created_at + 24h, the time Stripe keeps a key). RLS on, no policies: only the service role reads it. A daily cron line deletes expired rows.
2. The page makes one `attemptId` (crypto.randomUUID) per checkout form and keeps it while the form is the same order (the same `intentKey` that PAY-1 uses); a change to the order makes a new one. It is sent with the stripe-session request from `app/checkout/checkout-client.tsx` (card and wallet sheet) and `components/checkout/instant-checkout.tsx`.
3. The route computes `attempt_key = sha256(attemptId | creator | product | lower(email))`, then `insert ... on conflict (attempt_key) do nothing returning *`, else reads the row. A fresh row gets new tokens and `agreed_at`; an existing row gives back the ones stored on it. The tokens never come from the browser's id.
4. The PaymentIntent is created with `stripeIdentityKey("product-intent", [row.id], params)`. The same order pressed twice, or a request retried, sends the same parameters under the same key, and Stripe returns the first PaymentIntent. If the buyer changed the tip, the variant or the code, `params_hash` differs and the route makes a new row (a new key), so nothing real is blocked. The PaymentIntent id is written on the row.
5. Before the table exists (or when the insert fails) the route works exactly as now: fresh tokens and the 60 second key. No behaviour depends on the table being there.
6. Holds are unchanged: the coupon and sales-limit holds are keyed per buyer address and are already refreshed by a second press.

**Tests it needs.** Journey: two stripe-session requests with the same `attemptId` and body return the same `paymentIntentId` from a fake Stripe that honours keys; a changed tip returns a different one; the same `attemptId` from another email returns a different one and different tokens; without the table the route answers as today. Unit: the receipt token on the PaymentIntent is the stored one, never a function of `attemptId`.

**Rollback.** Revert the commit; the table can stay (nothing reads it), or be dropped by the owner.

## The owner's cascading-failure requirements

| # | Requirement | Status now | Evidence | Covered by |
| --- | --- | --- | --- | --- |
| 1 | A temporary Stripe failure must not cancel access | **Mostly met.** Billing reads never show Free when Stripe could not answer; the plan sync writes Free only when Stripe answered for every customer; `past_due` keeps features; breaker makes refusals look like a 503 that callers already treat as "could not ask". | `subscription-state.ts:380-470`, `subscription-sync.ts:136-232`, `2e88c64ea`, `f3e1f58bb` | PAY-7 (PermissionError disconnects Connect), PAY-8 (memberships cron cancels a trial), PAY-10 |
| 2 | A temporary auth failure must not destroy sessions | **Partly met.** App code is three-state and uses the claims fallback; the proxy redirects only on anonymous; native gate keeps sessions. The SDK still deletes cookies on a 500/429 refresh. | `lib/auth/current-user.ts`, `918388a5d` | SEC-3, SEC-8 |
| 3 | An analytics failure must not block the dashboard | **Partly met.** Figures load by client XHR after render; collection always answers 204. But a failed analytics RPC triggers an unbounded raw-event read, and Home awaits uncapped sales totals. | `collect-route.ts`, `report-read.ts:130-268`, `app/app/page.tsx:161` | DB-2, DB-3, SHR-6 |
| 4 | An AI failure must not stop payments | **Met.** Publishing and checkout call no AI provider; a missing provider answers 503 only on AI endpoints; translation failures show the original text. | sites audit (grep of publish route and checkout text) | none needed; SITE-7 bounds AI spend |
| 5 | DB slow: sites serve the last good copy | **Not met for all.** Theme sites serve a last-good copy only when the instance holds one (about 1,360 no-page responses against 407 saved in 7 days). AI sites, Creator Pages and OnePages have no last-good copy and turn errors into 404s or permanent redirects. | PROD_EVIDENCE; `site-read.ts`; SITE-2/3/4 evidence | EVD-1, SITE-2, SITE-3, SITE-4, SITE-8, SITE-12, EVD-2 |
| 6 | Email provider down: no lost or duplicate emails | **Mostly met.** Mailgun calls are bounded with retries; notifications go through an outbox with a lease and dedupe keys; order emails are follow-up journal steps swept every 10 minutes. Gaps: legacy queue rows stuck in `sending`, raw client without deadline in the email cron, Web Push without timeout. Whether outbox jobs retry on a Mailgun 5xx with backoff was not traced end to end (UNPROVEN). | `lib/mailgun.ts`, `lib/notify/*`, `lib/checkout/followups.ts` | SHR-5, SHR-9, SHR-7, DB-1 |
| 7 | GitHub down: builder still edits and publishes | **Met.** GitHub mirror runs in `after()` and cannot fail a publish; GitHub client has a breaker. | `publish/route.ts:231-292`, `lib/github-sync/github.ts:150-185` | SITE-11 (inbound push lost if apply fails) |
| 8 | Cron overrun: no overlap or double work | **Mostly met.** `recordCronRun` lease skips a run while an earlier one is younger than maxDuration plus 30s; per-job leases on translation and notify. Gaps: lease fails open when the DB is unreachable; translation-jobs POST bypasses the lease; several crons overrun their limit. | `lib/observability/report.ts:155-210` | SHR-3, SHR-4, SHR-8, DB-11, EVD-4 |
| 9 | Webhook DB error: provider retries | **Not met in all paths.** Stripe event claim and fulfilment answer 500/503 so Stripe retries; but payout ledger errors, invoice and account lookups, and entitlement inserts are swallowed and answered 200; webhook DB clients have no deadline; a failed GitHub apply blocks redelivery. | COMMERCE audit; `connect-payout-webhook.ts:66-121` | PAY-2, PAY-6, PAY-3, DB-1, SITE-11, SHR-5 |
| 10 | Supabase Storage slow: pages render | **Partly met.** Storage reads through shared clients have a 30s deadline; images are public CDN URLs so pages render without them; covers failing does not block. AI sites download from Storage with no timeout; theme files sometimes receive gateway HTML. | `deadline.ts`; SITE-2 evidence; PROD_EVIDENCE | SITE-2, EVD-2 |
