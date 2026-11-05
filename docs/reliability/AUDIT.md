# Reliability, performance and security audit

Code at `10e69cf32` (branch `claude/reliability-engineering`). Five read-only
area audits (auth and security, commerce and billing, sites and builder,
communities and shared systems, database and dashboard) plus seven days of
production error data from Vercel. Nothing here was run against production
with writes. Things the code suggests but that could not be proven without
production data are marked **UNPROVEN**.

Map of the system: [ARCHITECTURE.md](ARCHITECTURE.md). Fix order:
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## 1. Baseline: what production showed (7 days to 2026-10-31 ~08:40 UTC)

Source: Vercel runtime errors, top 50 groups, for the production project. No
customer data was copied.

### Published sites (biggest visitor-facing problem)

| Error group | Count | Meaning |
| --- | ---: | --- |
| "site unavailable: profile: no answer in ~3000ms" | 716 (363 users), 10-24 to 10-31, still happening | visitor got no page |
| "site unavailable: creator: no answer in 3000ms" | 262, all on 10-27 06:30-09:44 | database incident |
| "site unavailable: published install: no answer" | 197 | no page |
| "site unavailable: pages: no answer" | 60 | no page |
| "profile: the read failed" / "creator, published install: the read failed" | 102 / 29 | no page |
| "served the last good copy" (fallback worked) | 199 + 49 + 44 + 25 + 36 + 54 | visitor got a page |
| SiteReadError during ISR revalidation | 244 | cache kept old copy |
| "theme files: canceling statement due to statement timeout" | 56 | Postgres statement timeout |
| publish "release was not written: statement timeout" | 8 | publish housekeeping |
| "Timed out acquiring connection from connection pool" | 7 (10-27) | pool exhaustion |
| PGRST002 schema cache | 24 + 8 + 19 (10-27) | PostgREST reloading |
| "theme files: <!DOCTYPE html>" | 97 + 61 + 23 + 20 | Supabase gateway HTML error page parsed as data |
| "Unterminated string in JSON at position 355193" | 7 | truncated response body |
| "[offers] DeadlineExceeded store_offers > 20s" | 10 | slow read |
| "Failed to load static file for page: /500 ENOENT" | 30 since 09-12 | the error page itself is missing |

Roughly 1,360 site requests got no page while about 400 were saved by a
last-good copy. The fallback exists but only covers some instances and paths.

### Timeouts (owner lead: 300s)

41 "Task timed out after 300 / 60 seconds" over 7 days across more than 20
routes, including `/api/cron/warm-sites`, `/auth/sync-session`,
`/api/github/webhook`, `/api/billing/subscription`, `/api/analytics/commerce`,
`/api/analytics/reports`, `/api/store/currency`, `/app/products/new.rsc`,
`/api/cron/notify`, `/api/app/orders/list`, `/api/cron/physical`,
`/api/cron/seo-index`, `/api/payments/[action]`. In the last 48 hours only
crons hit their limit: seo-index 3, physical 2, warm-sites 2, community 1,
notify 1. User-facing 300s hangs happened during database incidents.

### Auth (owner lead: Supabase auth timeouts)

48 "DeadlineExceeded: auth/v1/user took longer than 10s". Routes include
public ones that need no user: `/w/[username]/robots.txt`,
`/api/site-theme/assets/...`, `/api/site-theme/cover/[pass]`, middleware,
`/api/analytics/own/token`, builder sections and agent-activity.

### Stripe and billing

No Stripe error or warning lines in the last 48 hours. "TypeError: fetch
failed" on `/app/(.)settings.rsc` and `/api/billing/subscription`: 20 since
2026-07-08, one user, last 10-28. `/api/billing/subscription` appears in the
300s group during the database incident.

### AI and integrations

Translation: Hugging Face credits exhausted (19), Gemini 2.0 model removed (11,
fixed 10-24), model list logged at error level (27, informational). Cover
screenshots: navigation timeout 18s (8), upload failed because the database
timed out (7). Editor canvas "page never said it had drawn" (13). Avatar
"database kept a different photo" (8, one user).

## 2. Already in place (credit, not re-reported)

A parallel session landed billing and auth resilience on 2026-10-28 to 10-30:
`2e88c64ea` (billing reads fail closed, one plan writer), `918388a5d` (auth
that does not answer is never a sign-out; one auth answer per /app render),
`f3e1f58bb` (Stripe bounded and breaker-guarded, one object per press),
`21c0882e5` (deadlines on every Supabase request, billing fails closed),
`299772b2e` (payout and schedule idempotency keys by identity, trusted return
URLs, per-request billing reads).

| Area | Mechanism | Where |
| --- | --- | --- |
| Supabase | Deadline on every request through the shared clients (auth 10s, read 20s, write 30s, rpc 60s, storage 30/120s); read retries on 429/502/503/504 and network errors; writes never retried | `lib/net/deadline.ts`, `lib/storage/media-url.ts` |
| Supabase | PGRST002 schema-cache retry for reads | `lib/storage/media-url.ts:204-239` |
| Auth | Three states (anonymous / authenticated / indeterminate); a timeout or 5xx is never a sign-out in app code; proxy redirects only on anonymous | `lib/auth/current-user.ts`, `lib/auth/auth-error.ts`, proxy.ts:2560,2576 |
| Auth | JWKS claims fallback when Auth is down | `lib/auth/request-scope.ts:37`, `lib/auth/route-user.ts:46` |
| Auth | Builder turns an auth blip into 503, not 401 | `lib/website-builder/session-keep.ts`, `owned-install.ts:43-46` |
| Auth | Native gate keeps a stored session on a slow read (2 recoveries, no loop) | `components/native-auth-gate.tsx` |
| Auth | All in-app sync-session callers use same-origin POST with Origin and Sec-Fetch-Site checks | `lib/auth/session-sync.ts`, `app/(storelib)/auth/sync-session/route.ts:60-66` |
| Stripe | 20s per attempt, 2 retries with jitter, circuit breaker (5 failures, 10s to 60s cooldown) | `lib/stripe/resilience.ts`, `lib/stripe.ts` |
| Billing | A read never writes and never shows Free when Stripe could not answer; stale-if-error cache with single flight | `lib/billing/subscription-state.ts`, `subscription-reader.ts` |
| Billing | Free written only when Stripe answered for every customer; errors make the webhook answer 500 | `lib/billing/subscription-sync.ts` |
| Billing | Payment failure keeps plan features (`past_due`); second plan checkout blocked | webhook route.ts:1180-1199, `alreadyPayingVerdict` |
| Billing | Billing page no longer re-fetches on mount; invoices fall back to DB | `billing-page-client.tsx:161-162` |
| Payments | Idempotency keys on every money-creating call (plan checkout, schedules, cashout, refunds, memberships, Connect, physical, community) | `lib/stripe/resilience.ts` key helpers and callers |
| Payments | Webhook event claimed before handling, recorded after; failed event re-run on next delivery; dead run overtaken after 10 min | `lib/payments/ledger.ts:149-190` |
| Payments | Orders de-duplicated by PI or receipt token; follow-up journal swept every 10 min; Stripe outage during fulfilment answers 503 | `lib/checkout/fulfil-payment.ts`, `followups.ts` |
| Payments | Ledger posts locked and keyed in Postgres | `ledger_post`, `ledger_release_due` |
| Sites | Public theme-site reads bounded (`siteRead`), throw on error, 503 with `Retry-After: 5`, last-good copy served when held | `lib/website-builder/site-read.ts`, `compat-site.ts:308-326`, `published-site.ts:679-698` |
| Sites | Proxy reads capped at 5s; custom domains keep a held answer or show a 503 page | proxy.ts:46-53, 995-1003 |
| Sites | Theme publish atomic (one RPC, advisory lock); housekeeping in `after()` cannot fail it | SQL part 130, `publish/route.ts:140, 231-292` |
| Sites | AI agent loops end before `maxDuration` | `lib/website-builder/agent/limits.ts`, `lib/sites/agent/run.ts` |
| Sites | GitHub 25s x 4 with breaker; IndexNow 8s; covers have a deadline; warm-sites 45s budget | `lib/github-sync/github.ts` etc. |
| Sites | Per-tenant AI and publish limits in Postgres | `lib/sites/rate-limit.ts` |
| Sites | Payments and publishing never call an AI provider | grep of publish route and checkout text |
| Crons | `CRON_SECRET` bearer, fails closed, constant-time; lease in `cron_runs` | `lib/api/require-secret.ts`, `lib/observability/report.ts:155-210` |
| Email | Mailgun 15s per attempt, bounded 429 retries; inbound webhook signed, 5 min window, deduped | `lib/mailgun.ts`, `app/api/webhooks/mailgun/route.ts` |
| Email | Community emails and DMs deduped by key; scheduled posts published once | `lib/communities/server/email.ts:275-292` etc. |
| Dashboard | Per-request memo of user, creator, profile; Home caps extras (2-2.5s); Payouts caps Stripe at 2.5s; Orders refund sweep in `after()` | `lib/auth/request-scope.ts`, `app/(storelib)/app/page.tsx` |
| Analytics | Collection always 204, rate limit in memory first, forwarding in `after()`; reports cached 15s | `lib/analytics/collect-route.ts`, `app/api/analytics/reports/route.ts` |
| Security | Webhook signatures on Stripe (separate platform and Connect secrets), Mailgun, GitHub, Supabase auth hook, marketing | see [SECURITY.md](SECURITY.md) |
| Security | No service-role key or admin module in client code (`server-only`) | `lib/supabase/admin.ts`, `lib/admin/gate.ts` |
| Security | Published sites cannot call `/api` (Sec-Fetch-Site and Origin guard) | proxy.ts:1951-1976 |
| Ops | CI (tests, lint, type ratchet, build with memory and bundle budgets); post-deploy smoke; uptime check every 15 min; nightly backup and weekly restore drill | [release-safety.md](../operations/release-safety.md), [backups.md](../operations/backups.md) |

## 3. The owner's leads, answered

| Lead | Verdict | Evidence | Remaining work |
| --- | --- | --- | --- |
| 300s timeouts | **Mostly fixed; crons still hit limits.** The user-facing 300s hangs were functions waiting on undici's 300s header timeout during database incidents. `21c0882e5` put a deadline on every request through the shared clients. Last 48h: only crons. | 41 timeouts in 7d; last 48h crons only | DB-1 (ten raw clients still have no deadline, including both Stripe webhooks), DB-11 (routes with no `maxDuration`, cron budgets that add up past the limit), SHR-3, SHR-4 (cron clocks), EVD-4 (seo-index, warm-sites, notify) |
| Supabase auth timeouts | **No longer cause sign-outs in app code, but two gaps and wasted calls.** | 48 `auth/v1/user` > 10s, many on public routes | SEC-3 (SDK deletes the session on a 500/429 refresh), SEC-8 (`/auth/continue` lacks the fallback), EVD-3 (auth called on public routes) |
| Builder 503s | **By design, not a bug.** An auth blip or a database read error answers 503 "try again" instead of signing the creator out. The editor retries reads on 5xx. | no 503 error group; builder routes in the auth group; `session-keep.ts` | Fewer auth calls (EVD-3) and a server-side PGRST002 retry on builder file routes would reduce them |
| Stripe failures | **Handled.** Bounded calls and a breaker are in place; no Stripe errors in 48h. | `f3e1f58bb`, `lib/stripe/resilience.ts` | PAY-1 (ambiguous confirm says "Nothing was charged"), PAY-7 (PermissionError disconnects Connect) |
| Repeated billing requests | **Fixed for the billing page; still present on Payouts and Orders.** | `299772b2e` per-request billing reads | PAY-4 (~14 Stripe calls per Payouts open, 8 per tick), DB-8 (Orders checks up to 60 PIs per visit) |
| Billing fallback | **Fixed.** Reads never show Free when Stripe could not answer; sync writes Free only on a complete answer. | `2e88c64ea`, `21c0882e5` | PAY-10 (sync reads only 20 subscriptions), PAY-8 (memberships cron can cancel a trial) |
| Session token in URL | **Callers moved to POST; the GET endpoint and two legacy token URLs remain.** | `app/(storelib)/auth/sync-session/route.ts:32-50` | SEC-4 (GET sync-session), SEC-9 (custom-scheme recovery tokens, `/auth/app-callback`), SEC-11 (email and code in verify URL) |

## 4. Findings, ranked

IDs: **SEC** auth and security, **PAY** commerce and billing, **SITE** sites
and builder, **SHR** communities and shared systems, **DB** database and
dashboard, **EVD** seen in production evidence but not covered by an area
audit. Branch for each prefix: SEC `claude/rel-security`, PAY
`claude/rel-commerce`, SITE `claude/rel-sites`, SHR `claude/rel-shared`, DB
`claude/rel-db`. EVD items are not assigned yet.

Summary:

| Severity | IDs |
| --- | --- |
| CRITICAL | SEC-1, SEC-2 |
| HIGH | SEC-3, PAY-1, PAY-2, SITE-1, SITE-2, SITE-3, SITE-4, SHR-1, DB-1, DB-2, EVD-1 |
| MEDIUM | SEC-4, SEC-5, SEC-6, SEC-7, PAY-3, PAY-4, PAY-5, PAY-6, PAY-7, SITE-5, SITE-6, SITE-7, SITE-8, SITE-9, SHR-2, SHR-3, SHR-4, SHR-5, SHR-6, DB-3, DB-4, DB-5, DB-6, DB-7, DB-8, DB-9, DB-10, EVD-2, EVD-3, EVD-4 |
| LOW | SEC-8, SEC-9, SEC-10, SEC-11, SEC-12, PAY-8, PAY-9, PAY-10, PAY-11, PAY-12, SITE-10, SITE-11, SITE-12, SHR-7, SHR-8, SHR-9, SHR-10, DB-11, DB-12, DB-13, DB-14, EVD-5 |

Fields per finding: System; Problem/Risk; Evidence; Root cause; Severity;
User impact; Financial impact; Solution; Complexity (S/M/L); Verification.

---

### CRITICAL

#### SEC-1. Anyone can mark an email as verified without owning it, then take the guest orders bought with that email
- **System:** email verification (`/api/auth/verify-email`, `/api/auth/confirm-email`), `/auth/continue`, guest-order attach.
- **Problem/Risk:** verify-email is unauthenticated, takes `userId` and `email` from the body and mails a code to whatever address was posted. confirm-email is unauthenticated and sets `profiles.email_verified=true` and auth `email_confirm` for that `userId`. An attacker signs up with a victim's address (confirmation is off), gets a code at their own mailbox, confirms, visits `/auth/continue`, and `attachGuestOrdersByEmail` moves every guest order bought with the victim's address into the attacker's library. A second path: `profiles` has an owner UPDATE policy and no trigger protects `email_verified`, so a user can probably set it directly through PostgREST (UNPROVEN against the live DB).
- **Evidence:** `app/api/auth/verify-email/route.ts:13-24, 77-82, 103-108`; `app/api/auth/confirm-email/route.ts` (~:15-20, ~:37-50); `app/(storelib)/auth/continue/route.ts:83-104`; `lib/orders/attach-guest-orders.ts:108-123`; `supabase/sql/RUN_CREATOR_BADGES.sql:28-31`; no `email_verified` in any `*.sql`.
- **Root cause:** the code is bound to a caller-supplied `userId`, not to the session or the account's email; `email_verified` is user-writable.
- **Severity:** CRITICAL.
- **User impact:** buyers lose purchases; guest purchase history exposed; also an open mail relay (SEC-5).
- **Financial impact:** lost goods, refunds, chargebacks, Mailgun reputation.
- **Solution:** both routes require a session and ignore body `userId`; send only to `user.email`; confirm requires the code's email to equal `user.email`; add a `profiles_keep_email_verified` trigger (modelled on `profiles_keep_badges`) that keeps the old value for `authenticated` and `anon`. Existing callers already have a session.
- **Complexity:** S (routes) + S (trigger, additive SQL part for owner approval).
- **Verification:** verify-email without a session is 401; with a different `email` sends to `user.email` or refuses; confirm with a mismatched code email is 400; SQL test that an `authenticated` update of `email_verified` leaves it unchanged.

#### SEC-2. The admin console falls back to a username and password written in the source
- **System:** `/api/admin/blog/auth` and the `blog_admin` cookie used by every `/api/admin/*` and `/admin`.
- **Problem/Risk:** when `BLOG_ADMIN_PASSWORD` / `BLOG_ADMIN_USER` are unset, the login accepts literals in the file. No rate limit. Signing key falls back to `SUPABASE_SERVICE_ROLE_KEY`. One shared identity, no MFA. This is a documented owner decision.
- **Evidence:** `app/api/admin/blog/auth/route.ts:20-44` (literals at :43-44); `lib/admin-session.ts` `signingKey()`; `lib/admin/gate.ts:24-26`; `tests/admin-auth.test.ts:60-77`.
- **Root cause:** explicit owner decision recorded in code.
- **Severity:** CRITICAL if the repository is readable outside the owner or the variables are unset in production (both UNPROVEN).
- **User impact:** full platform takeover: account deletion, moderation, payments admin.
- **Financial impact:** potentially total.
- **Solution:** (a) owner sets `BLOG_ADMIN_USER`, `BLOG_ADMIN_PASSWORD`, `BLOG_ADMIN_SECRET` in Vercel production (see [MANUAL_ACTIONS.md](MANUAL_ACTIONS.md)); (b) rate-limit the login (5 per 5 min, 20 per day per IP); (c) log failed logins (IP only) to `security_events`. Do not remove the fallback without the owner.
- **Complexity:** S.
- **Verification:** the 6th bad login in 5 minutes gets 429; `tests/admin-auth.test.ts` still passes.

---

### HIGH

#### SEC-3. A 500 or 429 from Supabase Auth during token refresh deletes the session cookies
- **System:** proxy session renewal, server client in route handlers, browser and Capacitor client.
- **Problem/Risk:** supabase-js removes the session on any refresh error that is not `AuthRetryableFetchError`. Only fetch failures and 502/503/504 count as retryable, so a 500 or 429 from `/auth/v1/token` wipes cookies (proxy `setAll`) and native storage. App-level three-state auth cannot see it.
- **Evidence:** proxy.ts:2481-2504; `lib/supabase/server.ts` `setAll`; `lib/supabase/client.ts` `capacitorStorage.removeItem`; `lib/net/deadline.ts` retries only GET/HEAD. Library behaviour from published gotrue-js at supabase-js 2.87.3 (UNPROVEN in this checkout, node_modules absent).
- **Root cause:** SDK refresh-error handling.
- **Severity:** HIGH.
- **User impact:** random sign-outs during Auth incidents; native users lose the stored session.
- **Financial impact:** abandoned checkouts during incidents.
- **Solution:** a small fetch shim next to `deadlineFetch`: a 500 or 429 from `POST /auth/v1/token` is rewritten to 503 so the SDK keeps the session. Covers proxy, server and browser because all use `mediaFetch` / `deadlineFetch`.
- **Complexity:** S.
- **Verification:** mocked 500 and 429 on refresh do not call `setAll` with empty cookies and give `AuthRetryableFetchError`; a 400 `refresh_token_not_found` still signs out.

#### PAY-1. "Nothing was charged" shown after a confirm that may have charged; a retry can double-charge
- **System:** `confirm-with-pm` card confirm, `memberships/confirm`.
- **Problem/Risk:** every non-card Stripe error (timeout after retries, reset, 5xx, `payment_intent_unexpected_state`) answers "The payment did not go through. Nothing was charged." Stripe may have charged. The buyer presses Pay again, a new PaymentIntent is made (keys never match, PAY-9) and confirmed.
- **Evidence:** `app/api/checkout/confirm-with-pm/route.ts:52-69`; `app/(storelib)/checkout/checkout-client.tsx:885-899`; `app/api/memberships/confirm/route.ts:91-95`; `app/api/checkout/stripe-session/route.ts:192-194`.
- **Root cause:** ambiguous errors treated as declines; PI state not re-read.
- **Severity:** HIGH.
- **User impact:** double charge or false message.
- **Financial impact:** duplicate charges, refunds, dispute fees on the platform.
- **Solution:** on a non-card error, re-read the PI (5s); `succeeded`/`processing`/`requires_capture` answer 200 with that status; `requires_action` returns the action; otherwise 503 `{status:"unknown"}` without the "Nothing was charged" text. Client treats 5xx like a lost answer and uses the existing confirm-payment probe.
- **Complexity:** S.
- **Verification:** fake Stripe whose confirm throws a connection error and retrieve returns `succeeded` gives 200; with retrieve failing gives 503 without the text; client test that 503 triggers the probe.

#### PAY-2. Payout ledger errors are swallowed, so a failed payout's money stays "in transit"
- **System:** platform and Connect payout webhook handlers.
- **Problem/Risk:** the ledger step for `payout.paid/failed/canceled` catches and logs; the handler answers 200 and the event is marked done, so Stripe never retries. On `payout.failed` the money never returns to available; creator cannot cash out again. Lookup errors read as "no creator".
- **Evidence:** `app/api/stripe/webhook/route.ts:1301-1309, 1350-1457, 1508`; `lib/stripe/connect-payout-webhook.ts:29-30, 66-121`; `connect/route.ts:43-51`.
- **Root cause:** ledger failure treated as cosmetic though cashout depends on it.
- **Severity:** HIGH.
- **User impact:** creator funds unusable in-app until fixed by hand.
- **Financial impact:** no loss at Stripe; support load and trust.
- **Solution:** throw on ledger and lookup errors (keep the deliberate currency-mismatch case non-fatal with a typed error) so the webhook answers 500 and Stripe retries; `postLedger` is keyed `payout:<id>:<outcome>` so replay posts once.
- **Complexity:** S.
- **Verification:** fake DB failing `ledger_post` once: first delivery 500 with `last_error`, second posts once; currency mismatch still 200.

#### SITE-1. An AI-site publish can take the live site offline
- **System:** `/api/sites/[siteId]/publish`.
- **Problem/Risk:** the live pointer switch is two unchecked PostgREST updates. If "new up" fails after "old down", nothing is live and every visitor gets "Site not found" until the next publish. The final `sites` update is unchecked.
- **Evidence:** `lib/sites/publish.ts:377-417`; serving `app/(sites)/site/[slug]/[[...path]]/route.ts:190, 212`.
- **Root cause:** non-atomic switch with no compensation.
- **Severity:** HIGH.
- **User impact:** creator's AI site offline after a failed publish, typically when the database is slow.
- **Financial impact:** lost traffic and sales for that creator.
- **Solution:** check the first update; on failure of the second, restore the previous live id and mark the new deployment failed. Later: one `switch_site_deployment` RPC (additive SQL).
- **Complexity:** S (compensation) / M (RPC).
- **Verification:** fake client failing the second update leaves the previous deployment live and the new one failed.

#### SITE-2. The AI-site public route turns database slowness into "Site not found" or a 301, with no timeout and no last-good copy
- **System:** `app/(sites)/site/[slug]/[[...path]]/route.ts`.
- **Problem/Risk:** `livePrefix` drops `error` and has no abort signal, so a timeout reads as "no live site" and serves 404. If the profile read then succeeds, the visitor gets a permanent 301 to the creator page. `storage.download` has no timeout.
- **Evidence:** route.ts:190, 197-210, 212, 288-330.
- **Root cause:** not moved onto `siteRead` like theme sites.
- **Severity:** HIGH.
- **User impact:** AI sites 404 during blips; crawlers see 404 and 301.
- **Financial impact:** SEO damage and lost visits.
- **Solution:** wrap reads in `siteRead`; on error answer 503 `no-store` `Retry-After: 5`; keep an in-memory last-good slug-to-prefix map (prefixes are immutable); call `creatorPathFor` only after a successful empty read.
- **Complexity:** S.
- **Verification:** mocked read error `57014` gives 503 not 404/301; seeded last-good gives 200.

#### SITE-3. A Creator Page database blip becomes a permanent redirect or a 404
- **System:** `storelib.com/<handle>`.
- **Problem/Risk:** `readPublicRow` returns null on any error; the storefront gate then issues a 308 to `/@handle`; a failed profile read renders `notFound()`. No timeouts.
- **Evidence:** `lib/security/public-rows.ts:28-33`; `lib/profile/storefront-gate.ts:7-11`; `lib/profile/member-url.ts:17-18`; `app/(storelib)/(marketing)/u/[username]/page.tsx:380, 414-428`.
- **Root cause:** error and "no row" folded together.
- **Severity:** HIGH.
- **User impact:** visitors and search engines told the store moved permanently or does not exist.
- **Financial impact:** lost sales during incidents; de-indexing risk.
- **Solution:** a strict sibling `readPublicRowStrict` that throws on non-missing errors with a 4s abort; gate redirects only after a successful read; use 307 for "onboarding not finished".
- **Complexity:** S-M.
- **Verification:** gate with an erroring read throws instead of `permanentRedirect`; page with a profile read error does not call `notFound`.

#### SITE-4. A OnePage lookup failure renders "not found"
- **System:** `storelib.me/<name>`, `/l/<slug>`.
- **Problem/Risk:** `resolveOnePage` catches every error and returns missing, so the page is a 404. Lookups have no abort. After a publish the cache tag is expired and the next read is synchronous.
- **Evidence:** `lib/onepage/published-page.ts:196-211`; `app/(storelib)/(marketing)/l/[slug]/page.tsx:103-127`; `lib/onepage/address-lookup.ts:52-78`; `lib/onepage/public-cache.ts:93-97`.
- **Root cause:** design choice from before `siteRead`.
- **Severity:** HIGH (highest-traffic pages).
- **User impact:** bio links show "not found" during slowness; crawlers record 404s.
- **Financial impact:** lost clicks and conversions for all creators during an incident.
- **Solution:** 4s abort via `readTwice`; on failure serve an in-memory last-good; otherwise throw (retryable 5xx), never `notFound()` on error.
- **Complexity:** S-M.
- **Verification:** rejected lookup gives a throw or last-good, never missing; page test: error is non-404.

#### SHR-1. A community file can be posted without the "complete" check
- **System:** community post and chat file uploads.
- **Problem/Risk:** the size limit (50 MB member / 500 MB staff), content inspection and malware scan only run in `complete`, which the browser chooses to call. Saving a post only checks the object exists. A member can upload any bytes to the signed URL, skip `complete`, and post the file id; other members download it. `digital-products` has no bucket size limit.
- **Evidence:** `lib/communities/server/post-files.ts:73-97, 100-141, 148-165`; `lib/communities/server/feed.ts:774`; `chat-media.ts:18`; `supabase/sql/complete_upload_system.sql:33,41`. Pictures may have the same gap via `lib/storage/confirm-upload.ts:24` (UNPROVEN).
- **Root cause:** trust boundary on a client-called step.
- **Severity:** HIGH.
- **User impact:** uninspected files (disguised executables or HTML) reach members.
- **Financial impact:** storage and egress up to the project-wide upload cap per file.
- **Solution:** `communityFilesExist` also checks size against the limit and requires the passing verdict (or runs the complete logic inline); existing posts untouched. Owner also sets a bucket size limit ([MANUAL_ACTIONS.md](MANUAL_ACTIONS.md)).
- **Complexity:** S-M.
- **Verification:** oversized or refused object without complete is refused and removed; prepare → complete → post still works.

#### DB-1. Ten server modules build raw Supabase clients without deadlines, including both Stripe webhooks
- **System:** Stripe and Connect webhooks, Mailgun webhook, scheduled-email cron, domain cleanup, wishlist, security emails, business login.
- **Problem/Risk:** `createClient(url, key)` without `global.fetch` uses Node's bare fetch, limited only by undici's 300s header timeout: the Oct 28 failure mode. Slow database means webhook invocations held up to 300s while Stripe retries in parallel.
- **Evidence:** `app/api/stripe/webhook/route.ts:39`; `app/api/stripe/webhook/connect/route.ts:15`; `lib/stripe/connect-webhook.ts:13`; `app/api/webhooks/mailgun/route.ts:22-25`; `app/api/cron/process-scheduled-emails/route.ts:75-78`; `app/api/domains/cleanup/route.ts:29`; `app/api/wishlist/{route.ts:43, merge/route.ts:25, check/route.ts:16}`; `app/api/security/{confirm-device/route.ts:19, verify-email/route.ts:23}`; `lib/businesses/server.ts:240`; `app/api/auth/unconfirmed-account/route.ts:45`. `instrumentation.ts` has no global fetch patch.
- **Root cause:** deadlines were added at the shared factories; these modules never used them.
- **Severity:** HIGH (money path).
- **User impact:** late orders, refunds and Connect updates in a brownout; exhausted function slots slow everything.
- **Financial impact:** function-seconds (300s per hung call times Stripe retries).
- **Solution:** use `createAdminClient()`; for anon auth-only clients add `global.fetch: mediaFetch`; add a lint or grep guard against raw `createClient` outside `lib/supabase/`, `proxy.ts`, `scripts/`. Overlaps SHR-5.
- **Complexity:** S.
- **Verification:** never-resolving fetch stub makes the webhook DB helper reject with `DeadlineExceeded` (fake timers); grep test.

#### DB-2. If the analytics RPC fails, reports fall back to reading raw events with no time budget
- **System:** `/api/analytics/reports` (Home figures, Analytics page).
- **Problem/Risk:** on any RPC error, including a timeout, `countFromRows` keyset-reads up to 200,000 raw events per span, 1,000 per sequential request, with no deadline and no `maxDuration`. It multiplies load exactly when the database is slow.
- **Evidence:** `lib/analytics/report-read.ts:60-61, 74-86, 130-141, 230-268`; no `maxDuration` on the route.
- **Root cause:** a compatibility fallback (function missing) also used for transient errors.
- **Severity:** HIGH (load amplifier).
- **User impact:** figures spin for minutes; other tenants slow down.
- **Financial impact:** function-seconds, Supabase CPU and egress.
- **Solution:** fall back to rows only on PGRST202/42883; otherwise answer "figures unavailable, try again"; 15s wall budget on `readAll` with `truncated: true`; `maxDuration = 60`.
- **Complexity:** S.
- **Verification:** RPC error `57014` never touches `analytics_events`; PGRST202 still counts rows.

#### EVD-1. Theme and compat sites still serve "site unavailable" when no last-good copy is held (production's largest visitor-facing error)
- **System:** `/w/[username]`, `/api/site-theme/site/[username]`, proxy held answers.
- **Problem/Risk:** the fallback works only on an instance that has served the site before. About 1,360 requests in 7 days got no page against about 400 saved by the fallback. "profile: no answer" is still happening on 10-31 outside the incident window. The sites audit rated the in-memory last-good as LOW (SITE-12, "known trade-off"); production counts make it the top site problem, so it is re-ranked here by the lead.
- **Evidence:** PROD_EVIDENCE (716 + 262 + 197 + 60 + 131 unavailable; 407 last-good served; 244 SiteReadError during ISR); `compat-site.ts:308`, `published-site.ts:679`.
- **Root cause:** last-good copies live only in per-instance memory; scale-out and cold instances start empty; the profile read itself is slow (UNPROVEN whether a missing index, pool pressure or row size).
- **Severity:** HIGH.
- **User impact:** visitors see a 503 "one moment" page.
- **Financial impact:** lost sales on creator websites.
- **Solution:** persist a last-good site snapshot in the Next data cache (`unstable_cache` with `revalidate:false`, refreshed on success) as SITE-12 proposes; find why the profile read is slow (query plan in staging, see DB access in [MANUAL_ACTIONS.md](MANUAL_ACTIONS.md)).
- **Complexity:** M.
- **Verification:** cache primed, database failing, fresh module instance returns 200; production count of "site unavailable" falls after deploy.

---

### MEDIUM

#### SEC-4. GET `/auth/sync-session?access_token=…&refresh_token=…` still exists
- **System:** native and browser session bridge.
- **Problem/Risk:** no Origin or Sec-Fetch-Site check on GET. Any page, including a published `<slug>.storelib.com` site, can sign a victim into the attacker's account (login CSRF); tokens land in request logs.
- **Evidence:** `app/(storelib)/auth/sync-session/route.ts:32-50` (POST guard at :60-66 not applied); `lib/auth/native-session.ts:40-46`; `lib/auth/continue-client.ts:59-68`; `lib/auth/session-sync.ts:64-68`.
- **Root cause:** GET kept "until they move"; they have moved.
- **Severity:** MEDIUM. **User impact:** purchases or uploads land in the wrong account; tokens in logs. **Financial impact:** low to moderate.
- **Solution:** GET refuses unless `Sec-Fetch-Site` is `same-origin` or `none` and it is a top-level navigation; after checking Vercel logs for GET volume, answer 303 to `/login` without `setSession`.
- **Complexity:** S. **Verification:** GET with `same-site`/`cross-site` sets no cookies and redirects; POST tests unchanged.

#### SEC-5. verify-email is an unauthenticated mail relay, rate-limited on a caller-controlled id
- **System:** `/api/auth/verify-email`.
- **Problem/Risk:** sends branded email to any address; limits keyed on body `userId`; no IP limit; `verificationLimitPaused()` can disable the DB limit.
- **Evidence:** `app/api/auth/verify-email/route.ts:13-58, 103-108`; `lib/security.ts:32-51`.
- **Root cause:** no session, no per-IP limit. **Severity:** MEDIUM. **User impact:** spam from storelib.com. **Financial impact:** Mailgun cost and domain reputation affecting receipts.
- **Solution:** SEC-1 step 1 plus `rateLimit` per IP and user (5 per 15 min, 20 per day).
- **Complexity:** S. **Verification:** 6th call from one IP in 15 minutes gets 429.

#### SEC-6. Six-digit codes can be guessed with no limit
- **System:** `/api/auth/confirm-email`, `/api/security/confirm-device`.
- **Problem/Risk:** no attempt counter, no rate limit; up to 8 live codes per user per 15 min; device lock by `order_id + code` unlimited.
- **Evidence:** confirm-email route (~:10-20, no rateLimit import); `app/api/security/confirm-device/route.ts` ~:30-70; pattern exists in `lib/account/codes` (`MAX_CODE_ATTEMPTS`).
- **Root cause:** routes predate attempt counting. **Severity:** MEDIUM. **User impact:** verification and device-lock bypass. **Financial impact:** shared downloads.
- **Solution:** reuse `MAX_CODE_ATTEMPTS` / `codeMatches`; `rateLimit` per user/order and per IP (about 10 per 15 min).
- **Complexity:** S. **Verification:** 11th wrong guess gets 429; right code after lockout refused until reissued.

#### SEC-7. After sign-in, `next` can send the user to any `*.storelib.com` host, including attacker-built sites
- **System:** `lib/auth/return-to.ts` `safeReturnTarget` and its callers.
- **Problem/Risk:** absolute targets on any subdomain are allowed; AI-built sites with model-written JavaScript live on subdomains; a phishing page after a real login.
- **Evidence:** `lib/auth/return-to.ts`; `lib/auth/continue.ts:72-89`; `app/(storelib)/account/continue/route.ts`.
- **Root cause:** trust boundary moved when sites moved to subdomains. **Severity:** MEDIUM. **User impact:** credential phishing. **Financial impact:** indirect (payout redirection after takeover).
- **Solution:** allow absolute targets only on apex, `www` and reserved platform subdomains; check no flow needs to return to a creator site.
- **Complexity:** S. **Verification:** `https://foo.storelib.com/x` rejected; apex, `help.` and `/x` accepted.

#### PAY-3. Entitlement insert failures are recorded as done
- **System:** order follow-ups (product, basket, physical).
- **Problem/Risk:** the `{error}` from `entitlements.insert` is ignored; the step is marked done; the sweep never retries.
- **Evidence:** `lib/checkout/fulfil-payment.ts:362, 582-592`; `lib/checkout/fulfil-cart-item.ts:247-257`; `lib/physical/checkout-server.ts:1164`.
- **Root cause:** supabase-js error-in-result not turned into a throw. **Severity:** MEDIUM. **User impact:** "paid but not in my library" (receipt link probably still works, UNPROVEN). **Financial impact:** refunds and disputes.
- **Solution:** throw on error except `23505`; follow-up records failed; sweep retries.
- **Complexity:** S. **Verification:** insert returning `08006` leaves the step `failed`; sweep inserts it.

#### PAY-4. Payouts page calls Stripe about 14 times per open and 8 per background tick
- **System:** `/app/payouts`, `/api/stripe/payouts`, `/api/stripe/payout-method`.
- **Problem/Risk:** server render plus two client components each fetch the same endpoint; each call makes 4 Stripe calls; ticks every 2 minutes and on focus; no server cache.
- **Evidence:** `app/(storelib)/app/payouts/page.tsx:197-210`; `payouts-client.tsx:2805-2817, 3110-3121, 3366-3372, 3448-3460, 3876`; `app/api/stripe/payouts/route.ts:49-63`.
- **Root cause:** two components read one endpoint; no shared result or per-account cache. **Severity:** MEDIUM. **User impact:** slower page; empty figures under rate limiting. **Financial impact:** invocations, Stripe volume, possible 429 pressure on checkout (UNPROVEN at current traffic).
- **Solution:** no `refreshKey` bump on background ticks; one fetch per tick lifted to the parent; skip first tick when SSR data is fresh; per-account single-flight cache 15-30s invalidated on `payout.*` and cashout.
- **Complexity:** S-M. **Verification:** call counts 1 (or 0) on mount and 1 per tick; two concurrent GETs make one set of Stripe calls.

#### PAY-5. When Stripe is slow, the payouts page shows "nothing" as fact
- **System:** `/api/stripe/payouts`, `/api/stripe/payout-method`, `PayoutsHistoryList`.
- **Problem/Risk:** a failure or delay over 6s becomes `payouts: []`, `balance: null`, `bankAccount: null`, replacing what was shown and inviting a bank change mid-outage.
- **Evidence:** `app/api/stripe/payouts/route.ts:39-63, 150-160`; `payouts-client.tsx:3110-3113`; `app/api/stripe/payout-method/route.ts:42-48`.
- **Root cause:** fallback indistinguishable from empty. **Severity:** MEDIUM. **User impact:** confusing empty history; mistaken bank changes. **Financial impact:** indirect.
- **Solution:** additive `unavailable` flags and `bankUnknown`; client keeps prior state and shows "Stripe is slow, showing last known".
- **Complexity:** S. **Verification:** rejected `payouts.list` gives `unavailable.payouts`; component keeps prior rows.

#### PAY-6. Webhook DB errors and out-of-order events are read as "nothing to do"
- **System:** main webhook invoice, payout and `account.updated` handlers.
- **Problem/Risk:** lookups ignore `error`; `invoices.upsert` result unchecked inside a try/catch that cannot see it; `invoice.paid` before `customer.subscription.created` is dropped.
- **Evidence:** `app/api/stripe/webhook/route.ts:1087-1137, 1152-1162, 1215-1219, 1301-1309`; `lib/stripe/connect-webhook.ts:117-118`; `lib/stripe/connect-payout-webhook.ts:29-30`.
- **Root cause:** result-error pattern; creator resolved only from the subscriptions row. **Severity:** MEDIUM. **User impact:** missing invoices, missed notices, stale payout readiness. **Financial impact:** low, support load.
- **Solution:** throw on error so Stripe retries (all writes keyed or upserts); resolve invoice creator via `resolveCreatorForSubscription`.
- **Complexity:** S. **Verification:** select error gives 500 and `last_error`; missing row but known customer still writes the invoice.

#### PAY-7. Any Stripe PermissionError is read as "account gone" and disconnects the creator
- **System:** Connect `accountIsGone()` and 8 callers.
- **Problem/Risk:** a platform-wide permission problem (rotated or restricted key, platform restriction) would release each creator's Connect account on next checkout, closing checkout until they reconnect. Whether Reconnect re-attaches the old account is UNPROVEN.
- **Evidence:** `lib/payments/stripe/connect.ts:109-114, 158-176, 253-266, 672-680`; callers in `app/api/checkout/stripe-session/route.ts:442-447`, `cart/route.ts:586`, `site/route.ts:532`.
- **Root cause:** narrow migration heuristic on a broad error class. **Severity:** MEDIUM (low probability, high blast radius). **User impact:** stores stop selling. **Financial impact:** lost sales across stores.
- **Solution:** probe the platform (`balance.retrieve`) before releasing; release only if the probe succeeds; env kill switch `STRIPE_AUTO_RELEASE=off`.
- **Complexity:** S. **Verification:** both calls PermissionError: no release; platform OK: release.

#### SITE-5. Theme publish RPC can hit statement timeouts, with no retry and a large return payload
- **System:** `themes/[installId]/publish`.
- **Problem/Risk:** one PostgREST statement waits on the advisory lock, updates every page, moves every drafted file and returns all their contents as jsonb. Large themes time out under load. No retry, no abort, no `maxDuration`.
- **Evidence:** `publish/route.ts:140-150`; `supabase/sql/run-now/130_theme_publish_in_one_step.sql:2`; production: 8 "release was not written: statement timeout", 56 theme-files statement timeouts.
- **Root cause:** payload grows with theme size; no transient retry. **Severity:** MEDIUM. **User impact:** publish fails repeatedly for large stores when the database is slow. **Financial impact:** small.
- **Solution:** (b) retry once on `57014`/PGRST002/fetch failure (idempotent, serialised by the lock); (c) `maxDuration = 120`; (a) later, additive SQL returning paths only.
- **Complexity:** S (b, c) / M (a). **Verification:** first RPC `57014`, second OK gives 200.

#### SITE-6. The AI-site slug availability check fails open
- **System:** `ensureSlug` in AI sites publish.
- **Problem/Risk:** a read error counts as "free"; a site can be published on another creator's name during a blip; slug update unchecked.
- **Evidence:** `lib/sites/publish.ts:138-170`.
- **Root cause:** error treated as zero. **Severity:** MEDIUM. **User impact:** a stranger's site on a creator's name. **Financial impact:** trust, possible fraud.
- **Solution:** error means "taken"; abort with "try again"; check the slug update.
- **Complexity:** S. **Verification:** count error fails the publish with no slug written.

#### SITE-7. Per-tenant AI and publish limits fail open when the database errors
- **System:** `lib/sites/rate-limit.ts`, AI sites agent concurrency.
- **Problem/Risk:** errors count as zero; `themeAgentLimit` allows on error; `site_active_run` error ignored.
- **Evidence:** `lib/sites/rate-limit.ts:58-67, 147-160`; `app/api/sites/[siteId]/agent/route.ts:102-108`.
- **Root cause:** availability chosen over spend control. **Severity:** MEDIUM. **User impact:** none directly. **Financial impact:** unbounded model tokens during an incident.
- **Solution:** fail closed (503) for AI runs only; publish may stay fail-open.
- **Complexity:** S. **Verification:** count error returns a limit message; route 503 with no provider call.

#### SITE-8. Proxy routing answers fall back to "no" on a cold instance during database errors
- **System:** proxy.ts site routing for subdomains.
- **Problem/Risk:** `remembered()` / `compatSiteFor` return `false` when the read failed and nothing is held, so AI and imported-theme sites are routed to the wrong renderer. Custom domains already show 503.
- **Evidence:** proxy.ts:239-268, 400-410, 736-741, 1768, 1796.
- **Root cause:** boolean where three states are needed. **Severity:** MEDIUM. **User impact:** wrong page for minutes. **Financial impact:** small.
- **Solution:** return "unavailable" and answer `SITE_UNAVAILABLE` 503 on the subdomain branch.
- **Complexity:** S-M. **Verification:** failing read with empty maps gives 503 for `x.storelib.com/`.

#### SITE-9. Draft theme assets and settings are served without authentication
- **System:** `app/api/site-theme/assets/[installId]/[version]/[...name]`.
- **Problem/Risk:** `version=edit` or `draft*` serves unpublished CSS/JS and draft settings to anyone with the install id (which appears in published asset URLs).
- **Evidence:** route.ts:86-112.
- **Root cause:** sandboxed canvas has no cookies, so the route was left open (UNPROVEN whether required). **Severity:** MEDIUM (low sensitivity). **User impact:** unreleased design visible. **Financial impact:** low.
- **Solution:** require the install's preview token in the draft version string.
- **Complexity:** M. **Verification:** no token 404; valid token 200.

#### SHR-2. "Payout available" push goes to the creator id instead of the user id, and is not awaited
- **System:** `/api/cron/release-holds`, push.
- **Evidence:** `app/api/cron/release-holds/route.ts:46-48, 161-163`; `lib/push/notifications.ts:54-65`; `lib/push/sender.ts:97-111`; mapping elsewhere at `lib/orders/sale-events.ts:173-175`.
- **Problem/Risk:** push probably reaches no device (UNPROVEN that ids never match); fire-and-forget on serverless.
- **Root cause:** id mix-up and unawaited call. **Severity:** MEDIUM. **User impact:** sellers not told funds are ready. **Financial impact:** indirect.
- **Solution:** resolve `creators.user_id`; wrap in `after(() => Promise.allSettled(...))`; add `maxDuration`.
- **Complexity:** S. **Verification:** mocked sender called with `user_id`; `after` received the work.

#### SHR-3. `/api/cron/community` can need about 80s of work inside 60s
- **System:** community cron (every 5 min).
- **Evidence:** `app/api/cron/community/route.ts:42-65`; budgets in `lib/communities/server/notify.ts:542-543`, `scheduled-posts.ts:389`, `community-deletion.ts:591`, `chat-automations.ts:349`; production: community hit its limit once in 48h.
- **Problem/Risk:** each step budget starts from its own start; platform kills the run during deletions or automations; `cron_runs` never finished.
- **Root cause:** no run-wide deadline. **Severity:** MEDIUM. **User impact:** automations, deletions, seat release starved. **Financial impact:** low.
- **Solution:** one `until = started + 52s`; each step gets `min(own, until - now)`; cap the job queue at 30s.
- **Complexity:** S. **Verification:** fake steps using full budgets stay under 55s total.

#### SHR-4. `/api/cron/physical` starts its clock after two unbudgeted steps
- **System:** physical cron (every 10 min), includes checkout follow-ups.
- **Evidence:** `app/api/cron/physical/route.ts:35-50`; `lib/checkout/site-payment-sweep.ts:54-70`; production: physical hit its limit twice in 48h.
- **Problem/Risk:** up to 50 sequential Stripe cancels plus a 15s follow-up sweep run before `started`; later guards overshoot 60s.
- **Root cause:** clock taken in the wrong place. **Severity:** MEDIUM. **User impact:** hold expiry, tracking, reminders cut off. **Financial impact:** low to medium.
- **Solution:** take `started` first; give `cancelStaleSitePayments` a deadline or limit 20.
- **Complexity:** S. **Verification:** fake slow steps stay inside the budget.

#### SHR-5. Scheduled-emails cron and Mailgun webhook use a raw client with no deadline
- Same root cause and fix as DB-1, listed separately because the shared-systems branch owns these two files. **Evidence:** `app/api/cron/process-scheduled-emails/route.ts:2, 75-78, 158, 188, 240-246`; `app/api/webhooks/mailgun/route.ts:22-25`. **Severity:** MEDIUM. **User impact:** campaign and course emails delayed; legacy rows stuck in `sending`. **Financial impact:** low. **Solution:** `createAdminClient()`. **Complexity:** S. **Verification:** grep test; existing tests pass. **Coordination:** the shared and DB branches must not both edit these files; whichever lands first wins and the other drops it.

#### SHR-6. Cron failures inside a 200 response are never alerted
- **System:** rollup-daily, storage-cleanup, sub-steps of community, physical, notifications.
- **Evidence:** `lib/observability/report.ts:226-236`; `app/api/cron/rollup-daily/route.ts:143-174`; `app/api/cron/storage-cleanup/route.ts:46,64`.
- **Problem/Risk:** a broken rollup is never reported; dashboards fall back to raw reads (19s against 0.7s per the code comment), feeding DB-2.
- **Root cause:** partial failure folded into success. **Severity:** MEDIUM. **User impact:** stale or slow analytics. **Financial impact:** low (DB load).
- **Solution:** rollup-daily answers 500 when any RPC failed (or 207 partial); or `recordCronRun` treats `errors.length > 0` as not ok.
- **Complexity:** S. **Verification:** mocked RPC error gives non-2xx and `reportError` called.

#### DB-3. Home waits on uncapped sales totals that can scan every order and download FX history
- **System:** `/app` Home.
- **Evidence:** `app/(storelib)/app/page.tsx:161` (not wrapped, unlike :168, :170); `lib/analytics/creator-orders.ts:76-111`; `lib/money/report-currency-server.ts:51-89`; `lib/markets/fx-server.ts:99`.
- **Problem/Risk:** 3 serial calls; mixed-currency stores read every order (up to 200k) and may trigger a 60s ECB history download inside the render; the "not ilike" probe walks every order of single-currency stores.
- **Root cause:** rare slow branches inside a critical path. **Severity:** MEDIUM. **User impact:** Home takes seconds to a minute for multi-currency stores. **Financial impact:** churn risk for top stores.
- **Solution:** `within(…, 3000, fallback)`; never fetch FX history from a render (`noFetch`); memoize the currency probe 5-10 min.
- **Complexity:** S-M. **Verification:** never-resolving RPC: Home resolves in under 3.5s; `noFetch` skips `refreshHistory`.

#### DB-4. Customers page reads unpaginated and truncates at 1,000
- **System:** `/app/customers`.
- **Evidence:** `app/(storelib)/app/customers/page.tsx:52-70, ~97`.
- **Problem/Risk:** wrong lifetime values past 1,000 orders; truncated list; `.in(product_id, all)` URL can exceed limits (about 400 ids, UNPROVEN threshold) and show zero orders; O(customers x orders).
- **Root cause:** code from before `orders.creator_id` and paging helpers. **Severity:** MEDIUM. **User impact:** wrong customer values. **Financial impact:** bad decisions, no direct money movement.
- **Solution:** filter by creator via `scopedOrders`, named columns, `readByKeyset`; paginate or aggregate in SQL.
- **Complexity:** M. **Verification:** 1,000 + 5 rows both counted; 600 product ids make no `.in("product_id"` call.

#### DB-5. Payouts page and tax summary read orders unpaged; the 1099-K draft understates past 1,000 rows
- **System:** `/app/payouts`, `/api/stripe/tax-summary`.
- **Evidence:** `app/(storelib)/app/payouts/page.tsx:197-198, 229-270, 305-307`; `app/api/stripe/tax-summary/route.ts:77-84`.
- **Root cause:** same as DB-4. **Severity:** MEDIUM. **User impact:** wrong tax summary and missing history. **Financial impact:** creators may under-report from the draft.
- **Solution:** creator-scoped keyset reads; named columns; product Map; paginate or cap with a note.
- **Complexity:** M. **Verification:** 1,500 rows over two pages give the full sum.

#### DB-6. The /app layout reads `draft_blocks` and every product id on each navigation, and uses neither
- **System:** /app shell.
- **Evidence:** `app/(storelib)/app/layout.tsx:157, 161-165, 186-188, 316`; `components/app/notifications-modal.tsx:346`; `lib/home/progress.ts:221,283`.
- **Problem/Risk:** large JSONB fetched and dropped every navigation; `onePagePublished` is true when a OnePage merely exists (logic bug).
- **Root cause:** carried-over columns. **Severity:** MEDIUM. **User impact:** slower navigation; wrong notification state. **Financial impact:** egress and CPU.
- **Solution:** select `id, published, status`; real published flag; products `.limit(1)`; sale probe by `creator_id`.
- **Complexity:** S. **Verification:** select string lacks `draft_blocks`; products query has `limit(1)`; draft-only OnePage not counted as published.

#### DB-7. Products page selects `*` with no limit
- **System:** `/app/products`.
- **Evidence:** `app/(storelib)/app/products/page.tsx:33, 52-56`; client uses 13 fields (`products-client.tsx:37-51`).
- **Problem/Risk:** whole rows in the RSC payload; silent cut at 1,000; `community_id` filtered in JS.
- **Root cause:** convenience select. **Severity:** MEDIUM. **User impact:** slow page on phones; missing products. **Financial impact:** egress.
- **Solution:** named columns; `community_id is null` in SQL; keyset paging to a cap.
- **Complexity:** S. **Verification:** no `*` in select; 1,000 + 3 rows render 1,003.

#### DB-8. Every Orders visit checks up to 60 Stripe PaymentIntents and writes orders, unthrottled
- **System:** `/app/orders/sales` `after()` sweep.
- **Evidence:** `app/(storelib)/app/orders/sales/page.tsx:43-46, 77-127, 184`.
- **Problem/Risk:** platform-key Stripe volume competes with checkout (UNPROVEN at current traffic); refunded status written in two updates with no ledger event, diverging from `lib/stripe/refund-sync.ts`.
- **Root cause:** safety net on a page view instead of a schedule. **Severity:** MEDIUM. **User impact:** possible checkout 429s; refunds without ledger lines. **Financial impact:** possible ledger mismatch (UNPROVEN).
- **Solution:** throttle per creator (6-24h); later move to a cron calling refund-sync; merge the two updates.
- **Complexity:** S / M. **Verification:** two renders retrieve PIs only once; sweep calls refund-sync.

#### DB-9. Buyer-email lookups use ILIKE, which no index serves
- **System:** "my orders", site accounts, order lookup, access links, "already owned", email area.
- **Evidence:** `lib/site-accounts/account-data.ts:166-210`; `lib/physical/order-lookup-server.ts:46-72`; `lib/checkout/access-link.ts:87-94`; `lib/checkout/owned.ts:102`; `app/api/email/area/route.ts:158,165`; indexes `idx_orders_buyer_email` (btree) and `commerce_checkouts_buyer_idx` (on `lower()`).
- **Problem/Risk:** per-creator scan on public lookup paths; cheap DB load generator for big stores.
- **Root cause:** ILIKE against btree and `lower()` indexes. **Severity:** MEDIUM (scale-dependent). **User impact:** slow lookups for big stores. **Financial impact:** DB CPU, abuse vector.
- **Solution:** trigram GIN indexes IDX-1 (`orders.buyer_email`) and IDX-2 (`commerce_checkouts.buyer_email`), each run alone `CONCURRENTLY` with owner approval; or lowercase on write plus `.eq`.
- **Complexity:** S (index) / M (code). **Verification:** `EXPLAIN (ANALYZE, BUFFERS)` in staging shows a bitmap index scan.

#### DB-10. Chat Realtime runs a plpgsql RLS function per subscriber for every message change
- **System:** community chat Realtime.
- **Evidence:** `components/community/member/chat.tsx:114-119`; policy using `community_can_read_space(space_id)`.
- **Problem/Risk:** `event: "*"` fans out inserts and reaction updates; O(subscribers) function calls per change through Realtime's single WAL consumer.
- **Root cause:** Postgres Changes with RLS. **Severity:** MEDIUM (scale risk, UNPROVEN at current scale). **User impact:** late messages. **Financial impact:** Realtime and DB CPU.
- **Solution:** subscribe to INSERT only; later Realtime Broadcast from the server.
- **Complexity:** S / M. **Verification:** channel registered with `INSERT`; staging `pg_stat_statements` before and after.

#### EVD-2. Supabase gateway HTML error pages and truncated bodies are parsed as theme data
- **System:** theme files reads for published sites.
- **Problem/Risk:** when the Supabase gateway answers with an HTML error page (or a body cut short), the code tries to parse it and logs "theme files: <!DOCTYPE html>" or "Unterminated string in JSON". Whether this is classified as a transient error (retry, last-good) or as bad data was not checked by an audit (UNPROVEN).
- **Evidence:** PROD_EVIDENCE: 201 "<!DOCTYPE html>" lines, 7 truncated JSON lines.
- **Root cause:** upstream 5xx with a non-JSON body (UNPROVEN where it is read).
- **Severity:** MEDIUM. **User impact:** site pages fail during gateway trouble. **Financial impact:** as EVD-1.
- **Solution:** in the theme-files read, treat a non-JSON or HTML body as a transient read error (so it is retried and the last-good copy is used). Not yet assigned; candidate for `claude/rel-sites` follow-up.
- **Complexity:** S. **Verification:** fake fetch returning `text/html` 502 is retried and then raises `SiteReadError`, not a parse error.

#### EVD-3. `auth/v1/user` is called on public routes that need no user
- **System:** `/w/[username]/robots.txt`, `/api/site-theme/assets/...`, `/api/site-theme/cover/[pass]`, middleware, `/api/analytics/own/token`, builder sections and agent-activity polling.
- **Problem/Risk:** each call costs latency up to the 10s auth deadline and Auth quota; a polling endpoint waiting 10s per call ties up functions during Auth slowness.
- **Evidence:** PROD_EVIDENCE: 48 auth DeadlineExceeded in 7d; last 48h by path: analytics own token 15, builder sections 11, agent-activity 10, cover 2, assets 1, robots.txt 1.
- **Root cause:** UNPROVEN which helper triggers it on public paths (likely a shared layout or a `getUser` in a route that only needs presence).
- **Severity:** MEDIUM. **User impact:** slow public assets during Auth slowness. **Financial impact:** wasted function time and Auth calls (see [COSTS.md](COSTS.md)).
- **Solution:** trace each listed route; skip auth when the route serves public content; for polling endpoints use the cookie claims (`getClaims`) or a shorter deadline. Not yet assigned; fits `claude/rel-security`.
- **Complexity:** S-M. **Verification:** route tests assert no `/auth/v1/user` request for public paths; production count of the group falls.

#### EVD-4. Crons seo-index, warm-sites and notify still hit their 60s limit
- **System:** `/api/cron/seo-index`, `/api/cron/warm-sites`, `/api/cron/notify`.
- **Problem/Risk:** in the last 48h: seo-index 3, warm-sites 2, notify 1 timeouts. No audit traced their budgets in depth.
- **Evidence:** PROD_EVIDENCE timeout group.
- **Root cause:** UNPROVEN; likely the same per-step budget pattern as SHR-3, or slow self-fetches in warm-sites.
- **Severity:** MEDIUM. **User impact:** delayed indexing, colder site caches, delayed notifications. **Financial impact:** function-seconds.
- **Solution:** one run-wide deadline per cron (pattern from SHR-3); log per-step elapsed time. Not yet assigned; fits `claude/rel-shared` follow-up.
- **Complexity:** S. **Verification:** fake clock tests; production timeout count falls to zero.

---

### LOW

#### SEC-8. `/auth/continue` does not use the claims fallback
- **System:** `app/(storelib)/auth/continue/route.ts`. **Evidence:** :63-79; compare `lib/auth/request-scope.ts:37`. **Problem/Risk:** during an Auth outage, post-login landings end on the login form. **Root cause:** route calls the primitive directly. **Severity:** LOW-MEDIUM. **User impact:** "it logged me out" reports. **Financial impact:** lost conversions in incidents. **Solution:** pass `fallbackClaims`. **Complexity:** S. **Verification:** timed-out `getUser` with valid claims redirects to the destination.

#### SEC-9. Recovery tokens sent to a `storelib://` custom-scheme link
- **System:** reset-password legacy flow, `/auth/app-callback`. **Evidence:** `app/(storelib)/(auth)/reset-password/page.tsx:26-80, 276-280`; `app/(storelib)/auth/app-callback/page.tsx:46-85`; `android/app/src/main/AndroidManifest.xml:74,85`. **Problem/Risk:** any Android app can claim the scheme; app-callback has no caller but puts tokens in the URL. **Root cause:** legacy flows. **Severity:** LOW-MEDIUM. **User impact:** possible takeover with a malicious app installed. **Financial impact:** low. **Solution:** delete app-callback after zero log hits; use bridge codes or App Links only. **Complexity:** S. **Verification:** no code builds `storelib://` with tokens; app-callback 404.

#### SEC-10. Dead App Link bridge with a non-atomic single-use check
- **System:** `app/(storelib)/app/auth/callback/route.ts`. **Evidence:** :49-91; no writer of `oauth_bridge_tokens`. **Problem/Risk:** SELECT then DELETE lets two requests use one token; no `no-store`. **Root cause:** dead feature. **Severity:** LOW. **User impact:** none known. **Financial impact:** none. **Solution:** remove the bridge branch or `delete … returning`. **Complexity:** S. **Verification:** two concurrent GETs, one success.

#### SEC-11. Personal data in logs and URLs
- **System:** email capture, verify-email, exchange-reset-code. **Evidence:** `app/api/onepage/email-capture/route.ts:208`; verify-email route.ts:91, 113; `signup/page.tsx:378`. **Problem/Risk:** emails and codes in logs and request URLs. **Root cause:** hygiene. **Severity:** LOW (GDPR). **User impact:** privacy. **Financial impact:** regulatory exposure. **Solution:** `maskEmail()`; drop email and code from the verify URL. **Complexity:** S. **Verification:** grep test.

#### SEC-12. Security headers incomplete
- **System:** `vercel.json` headers. **Evidence:** CSP is `Report-Only`; no `Permissions-Policy`; HSTS not explicit (UNPROVEN for custom domains). **Severity:** LOW. **Solution:** `Permissions-Policy: camera=(), microphone=(), geolocation=()` on apex app routes; enforce CSP once reports are clean (Batch 6). **Complexity:** S / M. **Verification:** smoke script checks the header. **User impact / Financial impact:** defence in depth only.

#### PAY-8. Memberships cron can cancel a day-old trial whose DB row still says incomplete
- **System:** `lib/memberships/reminders.ts:66-77`. **Problem/Risk:** a trial with a card but a missed sync is cancelled. **Root cause:** DB status trusted; `trialing` ambiguous. **Severity:** LOW. **User impact:** lost paid trial. **Financial impact:** lost subscriber. **Solution:** sync first; cancel only `incomplete`, or `trialing` with no payment method and an unsucceeded setup intent. **Complexity:** S. **Verification:** trialing with payment method: no cancel, row synced.

#### PAY-9. Product checkout idempotency keys never repeat
- **System:** `app/api/checkout/stripe-session/route.ts:192-194, 244-296, 375, 381`. **Problem/Risk:** random tokens in hashed params; double tap makes two PIs; removes PAY-1's safety net. **Root cause:** hashing per-request values. **Severity:** LOW. **User impact:** none directly. **Financial impact:** none directly. **Solution:** client `attemptId` per Pay press; key without random fields. **Complexity:** S. **Verification:** same `attemptId` returns same PI.

#### PAY-10. Plan sync reads at most 20 subscriptions per customer
- **System:** `lib/billing/subscription-sync.ts:278-283` (and reader ~:181). **Problem/Risk:** theoretical wrong downgrade. **Severity:** LOW. **Solution:** page on `has_more` or query active/trialing/past_due separately. **Complexity:** S. **Verification:** 21 canceled newer than one active gives `paid`. **User impact / Financial impact:** theoretical.

#### PAY-11. Legacy `checkout.session.completed` product path is dead but unsafe if reached
- **System:** `app/api/stripe/webhook/route.ts:356-896`. **Problem/Risk:** invalid `expand`, non-fatal ledger, logged-only entitlement, "minimal" order fallback. **Severity:** LOW (UNPROVEN no old sessions in flight). **Solution:** route to `fulfilPaymentIntent` with the 500 mapping; log if hit. **Complexity:** S. **Verification:** session with `metadata.product_id` creates the order through fulfil-payment, ledger once. **User impact / Financial impact:** incomplete order and ledger drift if hit.

#### PAY-12. Webhook does slow follow-ups before answering
- **System:** `payment_intent.succeeded`, `fulfil-payment.ts:370-445, 631`; route has no `maxDuration`. **Problem/Risk:** slow answers raise endpoint failure rates; Stripe disables endpoints that keep failing. **Severity:** LOW. **Solution:** 5s and 1 retry on the two Stripe reads; emails and notify into `after()` (journal keeps them safe). **Complexity:** S. **Verification:** webhook answers in under 2s with delayed fakes; follow-ups later done. **User impact / Financial impact:** low.

#### SITE-10. Creator lookup uses `ilike` without escaping wildcards
- **System:** `lib/profile/profile-by-name.ts:30`; `app/(storelib)/(marketing)/u/[username]/page.tsx:419`. **Problem/Risk:** `/a_b` can resolve to `axb`. **Severity:** LOW (reachability UNPROVEN). **Solution:** `exactIlike`. **Complexity:** S. **Verification:** escaped pattern `a\_b` sent. **User impact / Financial impact:** wrong storefront at a crafted URL; low.

#### SITE-11. A GitHub push marked delivered before it is applied is lost if the apply fails
- **System:** `app/api/github/webhook/route.ts:43-45, 87-104`; `lib/github-sync/deliveries.ts`. **Problem/Risk:** redelivery dropped as duplicate. **Severity:** LOW. **Solution:** delete the delivery row on failure. **Complexity:** S. **Verification:** rejected apply leaves no row. **User impact:** a push silently not synced. **Financial impact:** none.

#### SITE-12. Last-good copies exist only in memory per instance
- **System:** `compat-site.ts:308`, `published-site.ts:679`, proxy held maps. The sites audit rated this LOW as a known trade-off. Production evidence makes it the root of EVD-1 (HIGH); fix is tracked there. **Solution:** persist in the Next data cache. **Complexity:** M. **Verification:** primed cache, failing DB, fresh instance returns 200.

#### SHR-7. Web Push sends have no timeout
- **System:** `lib/push/sender.ts:53-57`. **Problem/Risk:** a silent push service holds notify batches. FCM defaults UNPROVEN. **Severity:** LOW. **Solution:** `timeout: 8000`. **Complexity:** S. **Verification:** stub that never answers returns failed in about 8s. **User impact:** delayed notifications. **Financial impact:** low.

#### SHR-8. translation-jobs chained POST runs outside the cron lease; comment says 3 min, schedule says 5
- **System:** `app/api/cron/translation-jobs/route.ts:15, 41-55`. **Problem/Risk:** possible duplicate store-change sweep (UNPROVEN). Per-job lease prevents double translation. **Severity:** LOW. **Solution:** fix comment; confirm `runChangedStores` claims each store. **Complexity:** S. **Verification:** claim unit test. **User impact / Financial impact:** minor AI cost.

#### SHR-9. Legacy scheduled-email rows stuck in `sending` are never surfaced
- **System:** `app/api/cron/process-scheduled-emails/route.ts:240-246, 307-310`. **Problem/Risk:** silent loss (errs to not sending twice, which is right). **Severity:** LOW (UNPROVEN). **Solution:** move `sending` older than 1h to `failed` with a reason; never resend. **Complexity:** S. **Verification:** seeded 2h row becomes failed. **User impact:** an email silently not sent. **Financial impact:** low.

#### SHR-10. Orphan sweep reads comments and messages by `created_at` only
- **System:** `lib/communities/server/orphans.ts:107-112, 131-132`. **Problem/Risk:** a picture added by editing an old comment could be deleted after 14 days (only if edits can add media, UNPROVEN). **Severity:** LOW. **Solution:** add `edited_at`/`updated_at` clause. **Complexity:** S. **Verification:** edited old comment keeps its picture. **User impact:** lost picture. **Financial impact:** none.

Design notes (not defects): private community pictures are in the public
`product-images` bucket behind hard-to-guess URLs; a public post's share card
can be served from the CDN for about 10 minutes after the post is made
private.

#### DB-11. Jobs and routes that can reach the 300s ceiling or have no `maxDuration`
- **System:** rollup-daily (240s check plus a 60s RPC; manual range path has no budget), storage-cleanup (no overall budget), process-scheduled-emails (290s course deadline against 300s). No `maxDuration`: both Stripe webhooks, `/api/analytics/reports`, crons fx-rates, release-holds, purge-chat-attachments. **Evidence:** `app/api/cron/rollup-daily/route.ts:83, 140-163`; `app/api/cron/storage-cleanup/route.ts:21-40`; `lib/storage/cleanup.ts:158`; process-scheduled-emails :43, :72. **Severity:** LOW. **Solution:** backfill budget 180s and on the range loop; shared `stopAt` in storage-cleanup; course deadline 270s; `maxDuration = 60` on webhooks. **Complexity:** S. **Verification:** fake clock with 60s RPC stub stops before 270s. **User impact / Financial impact:** delayed jobs; function-seconds.

#### DB-12. Duplicate and overlapping indexes on high-write tables
- **System:** `analytics_events` (about 21 index definitions, two identical pairs), `orders` (`product_id` three times, `buyer_id` twice), `email_campaigns`, `email_flows`. Existence in production UNPROVEN. **Severity:** LOW. **Solution:** run the read-only `pg_stat_user_indexes` check; owner decides on `DROP INDEX CONCURRENTLY` later (destructive, not proposed now). **Complexity:** S. **Verification:** the check's output. **User impact:** none. **Financial impact:** write amplification, larger backups.

#### DB-13. About 30 RLS policies call `auth.uid()` per row
- **System:** `email_events`, `site_rum_events`, `campaign_recipients`, `digital_assets`, `ai_memories`, `store_offers` and others. Mostly read via service role. **Severity:** LOW. **Solution:** wrap as `(select auth.uid())` when next touched. **Complexity:** S. **Verification:** `EXPLAIN` shows InitPlan. **User impact / Financial impact:** low. Note: production shows 10 `store_offers` reads over 20s (EVD group), which may be related (UNPROVEN).

#### DB-14. `/api/dashboard` has no callers and repeats the read-every-order pattern
- **System:** `app/api/dashboard/route.ts:95-110`. **Severity:** LOW. **Solution:** 410 or delete after confirming the native shells do not call it. **Complexity:** S. **Verification:** grep and logs. **User impact / Financial impact:** heavy reachable endpoint; low.

#### EVD-5. The `/500` error page is missing from the build output
- **System:** Next.js error page. **Evidence:** "Failed to load static file for page: /500 ENOENT", 30 since 09-12, still on 10-31. **Problem/Risk:** when a page fails, the visitor gets a raw failure instead of the error page. **Root cause:** UNPROVEN (likely the custom error page not emitted by the current build setup). **Severity:** LOW. **Solution:** reproduce with a production build; make sure `app/(storelib)/error.tsx` / `global-error.tsx` cover it or the pages-router `/500` is emitted. Not assigned. **Complexity:** S-M. **Verification:** smoke test that a forced server error renders the error page. **User impact:** ugly failure page. **Financial impact:** low.

## 5. Index candidates (prepared, not run)

Only additive, each run alone (`CONCURRENTLY` cannot run in a transaction):

```sql
-- IDX-1 (DB-9)
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_buyer_email_trgm_idx
  ON public.orders USING gin (buyer_email gin_trgm_ops) WHERE buyer_email IS NOT NULL;
-- IDX-2 (DB-9)
CREATE INDEX CONCURRENTLY IF NOT EXISTS commerce_checkouts_buyer_email_trgm_idx
  ON public.commerce_checkouts USING gin (buyer_email gin_trgm_ops) WHERE buyer_email IS NOT NULL;
```

Use `extensions.gin_trgm_ops` if pg_trgm lives in the `extensions` schema.
Before approving, confirm the indexes the audit assumed exist in production
(query in the DB audit; owner or someone with DB read access runs it).
