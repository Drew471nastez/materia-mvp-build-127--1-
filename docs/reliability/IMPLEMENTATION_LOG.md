# Implementation log

What each fix branch did, from the fix agents' reports, checked by the lead.
Nothing here is deployed. All of it sits on `claude/reliability-engineering`
(Vercel never builds `claude/*` branches). Production needs the owner's
approval ([MANUAL_ACTIONS.md](MANUAL_ACTIONS.md), action 1).

Status values: **COMPLETE** (fixed, regression test written and run green,
shown failing on the old code unless noted), **IMPLEMENTED, NOT VERIFIED**,
**BLOCKED**, **NEEDS APPROVAL**, **NOT STARTED**.

Rollback for every row: `git revert <sha>` (or revert the branch's merge
commit, `git revert -m 1 <merge>`). No row needs a data migration.

## Already landed before this round (parallel session, on main)

| Commit | What |
| --- | --- |
| `2e88c64ea` | billing reads fail closed; one plan writer from Stripe's current state |
| `918388a5d` | auth that does not answer is never a sign out; one auth answer per /app render |
| `f3e1f58bb` | Stripe bounded and breaker guarded; staleness window; one object per press |
| `21c0882e5` | billing fails closed; deadlines on every Supabase request; credit notes |
| `299772b2e` | payout and schedule idempotency keys by identity; trusted return URLs |

## Integration gates (run by the lead, not the agents)

| Combination | `npm run test:push` | Notes |
| --- | --- | --- |
| security alone (`claude/rel-security`) | every suite passes except `round-aj` | `round-aj` fails identically on main (10e69cf32 changed `compat-section-preview.tsx` without its pin) |
| security + db (merged branch) | every suite passes except `round-aj` | |
| + shared + sites | every suite passes except `round-aj` | production build passed (exit 0) |
| + commerce (final, 10b342089) | every suite passes except `round-aj` | typecheck ratchet: 334 on base and branch; the files over baseline are none this work touched |

Agents also saw `agent-loop` (17) and `sites` (1) fail with "This environment
cannot render-check reliably"; those fail the same way on a clean base and
did not fail in the lead's runs. The typecheck ratchet reports 334 errors on
both the base and each branch (baseline 313, inflated by missing generated
route types); no file got worse. ESLint covers only `.js/.mjs` files in this
repo, so it does not see the TypeScript changes.

## `claude/rel-security` (merged as 1dfc96171)

| ID | Status | Commit | What changed | Test |
| --- | --- | --- | --- | --- |
| SEC-1 guest order takeover | COMPLETE (code); SQL part 347 NEEDS APPROVAL | d86c4dc57, fdf8a74ca | verify-email mails only the account's own Auth address (posted email ignored), limits per IP and per address, crypto codes; confirm-email takes only a code sent to the current address, 5 wrong tries burn it, atomic claim; proven address kept in Auth `app_metadata.verified_email`; guest orders attach only to a proven current address | `tests/auth-email-code.test.ts` (39), `buyer-auth-r39` (4 attach checks failed on old code) |
| SEC-3 sign outs during Auth trouble | COMPLETE | fa783fd5d | `deadlineFetch` turns 500/502/504/429 on the refresh token call into 503, which auth-js 2.87.3 treats as retryable instead of removing the session | `tests/auth-refresh-outage.test.ts`, drives the real GoTrue client; old code signs out |
| SEC-4 tokens in `/auth/sync-session` URL | COMPLETE | 210762bb9 | GET signs nobody in (303 to its same site `next`, no cookies, no referrer); POST unchanged; no caller used GET | `tests/auth-sync-session-get.test.ts` |
| SEC-6 device code guessing | COMPLETE | 08b3b4dd1 | 5 wrong tries burn the codes, per IP limit, atomic claim | `tests/device-code-guard.test.ts` (not run on the old route, which had no counter) |
| SEC-7 `next=` to creator subdomains | COMPLETE | 5110cbd3e | absolute returns only to storelib.com and its reserved platform subdomains | `tests/return-to.test.ts`, `sell-intent` (changed on purpose) |
| SEC-2 admin blog login | COMPLETE (code); env vars NEED OWNER | e39bd533e | rate limit before the password check; loud log while the fallback credential is in use; fallback kept (owner's decision) | `tests/admin-login-limit.test.ts` |
| SEC-8 `/auth/continue` in an Auth outage | COMPLETE | 387d7c450 | falls back to the token's signature like `route-user` | static test; fallback itself covered by `net-resilience` |
| SEC-5, SEC-9 to SEC-12 | NOT STARTED | | verify-email spam is now covered by SEC-1's limits; recovery links on a custom scheme, dead App Link bridge, unmasked emails in some logs, CSP report-only | |

Known effect: accounts that changed email in Settings before this change and
have no Google/Apple identity for the new address no longer get guest orders
attached automatically. "Add to library" on the receipt still works.

## `claude/rel-db` (merged as af0ff980d)

| ID | Status | Commit | What changed | Test |
| --- | --- | --- | --- | --- |
| DB-1 raw clients without a deadline | COMPLETE | 7e9520205, a5e0c8576 | domains cleanup, wishlist (3), security confirm-device and verify-email use `createAdminClient()`; business login anon client gets the deadline fetch | `tests/rel-db-dashboard.test.ts` §1 guard: no bare supabase-js client outside `lib/supabase` |
| DB-2 analytics fallback piles load | COMPLETE | b12c05e86 | raw `analytics_events` reads only when the function is missing; other errors answer "Analytics are unavailable right now" fast; raw reads capped at 15s; route `maxDuration = 60` | §2 |
| DB-3 Home waits on all-time sales | COMPLETE | dcba05a40 | 3s cap, no ECB download in the render, milestones hidden rather than invented | §3 |
| DB-4 totals stop at 1,000 orders | COMPLETE | 60ebab8d5, a55f2d4aa | Customers, Payouts tax year and disputes read by creator a page at a time | §4 (1,500 rows) |
| DB-5 /app layout over-fetch | COMPLETE | dd2a41e45 | onepages `id, status`; `onePagePublished` means published; one product read for the ring | §5 |
| DB-6 Products page `select('*')` | COMPLETE | cca1312fd | 14 columns, pages of 1,000 up to 20k, same UI | §6 |
| DB-7 email ILIKE lookups | NEEDS APPROVAL | 63fdcb096 | SQL part 349 (trigram indexes) plus a standalone CONCURRENTLY file | §7 |
| DB-8 bare `auth.uid()` in RLS, duplicate indexes | NEEDS APPROVAL (documented only) | | list in the db report; read-only check query before any drop | |

## `claude/rel-shared` (merged as 4f9522a50)

| ID | Status | Commit | What changed | Test |
| --- | --- | --- | --- | --- |
| SHR-1 community uploads skip checks | COMPLETE | 50ee9166c | size and byte inspection at posting time (posts, scheduled posts, chat), refused files removed; existing posts untouched | `tests/rel-shared.test.ts` F1 (4 failures on old code) |
| SHR-2 payout push wrong id, not awaited | COMPLETE | d5c087e18 | creator id mapped to user id; pushes awaited, 10 at a time, 30s budget | F2 |
| SHR-3/4 community and physical crons | COMPLETE | 041ac1fea, 0f1910b56 | one clock from the request; whole run ends by 52s; late steps skipped cleanly | F3/F4 |
| EVD-4 seo-index, warm-sites, notify timeouts | COMPLETE | ba955b986 | run wide deadlines, smaller pages, resume next run; schedules unchanged | item 4 |
| SHR-5 email paths without a deadline | COMPLETE | e1137c66f, 173d1bd70 | scheduled emails cron and Mailgun webhook on `createAdminClient()` | item 5 |
| SHR-6 failed steps reported as success | COMPLETE | 1e6a7a158 | rollup-daily and storage-cleanup answer 500 with the failed list | item 6 (old route answered 200) |
| SHR-7 push send timeout | COMPLETE | a7cf4b4bd | 8s timeout on every Web Push | item 7 |
| SHR-8 translation-jobs | COMPLETE (comment); lease left alone with reasons | 923e3e0a6 | | item 8 |

## `claude/rel-sites` (merged as a14634882)

| ID | Status | Commit | What changed | Test |
| --- | --- | --- | --- | --- |
| SITE-2 AI site blip is a 404 or 301 | COMPLETE | 151df5af8 | bounded reads; failure serves the last live copy, else no-store 503 with Retry-After; true 404 and 301 unchanged | `tests/rel-sites.test.ts` (87) |
| SITE-3 Creator Page blip redirects | COMPLETE | 63eb10892 | strict reads for the gate and page; a failure is the error screen, never 404 or 308 | |
| SITE-4 OnePage blip is "not found" | COMPLETE | 3754472a6 | 4s per query, 8s budget, last good answer, else error; share images 503 not a cached 404 | |
| SITE-1 AI site publish can go dark | COMPLETE (code); SQL part 348 NEEDS APPROVAL | 639ba294a, 719e711f0 | compensating switch now; one step RPC once part 348 runs (tested on local Postgres 16) | |
| SITE-5 slug check fails open | COMPLETE | f7fe6149d | fails closed with a retry message | |
| SITE-6 theme publish timeouts | COMPLETE | 663ee7320 | one retry on 57014/PGRST002 only, `maxDuration = 120` | |
| SITE-7 AI spend limits fail open | COMPLETE | e011dc045 | 503 "could not check your usage, nothing was started" | |
| SITE-9 draft theme assets readable by id | COMPLETE | 9f71fbb3c | draft versions need an install bound HMAC pass; no pass gets the published file, never a 404 | |
| EVD-1 "site unavailable" | IMPLEMENTED, NOT VERIFIED | 7a618006d, c5def36a3 | last good copies LRU instead of FIFO; data cache keys fixed labels instead of minified callback text | effect can only be measured in production |
| SITE-10 `%`/`_` in username lookup | COMPLETE | d57763112 | exact case-insensitive match | |
| EVD-5 `/500` ENOENT | NOT STARTED (attempt reverted) | | `outputFileTracingIncludes` does not apply: Next skips trace includes for prerendered `/w` routes. Needs a different approach | |

## `claude/rel-commerce` (merged as 10b342089)

| ID | Status | Commit | What changed | Test |
| --- | --- | --- | --- | --- |
| PAY-1 double charge after an unclear confirm | COMPLETE | f4326ab08 | re-read the intent (5s), answer its real status; unknown is a 503 "we are still checking", never "nothing was charged"; Pay again reuses the same intent | `tests/rel-commerce.test.ts` §1 (109 total) |
| PAY-2 payout ledger errors swallowed | COMPLETE | a481f7a04 | 500 so Stripe redelivers; ledger keyed per payout and outcome | §2 |
| PAY-3 entitlement insert failures | COMPLETE | 2b3355d58 | failure recorded, sweep retries; duplicate counts as granted | §3 |
| PAY-6 webhook DB errors read as nothing to do | COMPLETE | 34d412a3a | 500 so Stripe retries; early `invoice.paid` written straight away | §4 |
| PAY-7 Connect disconnect on PermissionError | COMPLETE | 4b266f8e2 | platform key checked first; nobody released when in doubt; `STRIPE_AUTO_RELEASE=off` kill switch | §5 |
| PAY-4/5 payouts page | COMPLETE | e4b322dec | one fetch, 30s per person cache, explicit unavailable parts, last values kept with "Couldn't refresh just now" | §6 |
| PAY-10 plan sync 20 subscriptions | COMPLETE | 7f3afc33a | pages through; never writes Free from a partial list | §7 |
| DB-1 (Stripe webhooks) | COMPLETE | 09b978905 | webhooks on `createAdminClient()`, `maxDuration = 60` | §8 |
| Orders page refund checks | COMPLETE | dd698bf31 | once per creator per 6h; refunds through `syncChargeRefund` with a ledger line | §9 |
| Tax summary and payouts past 1,000 | COMPLETE | 92f031add, 1996a8686 | paged reads; on merge the Payouts page keeps the db branch's by-creator reads and its 1,000 newest sales list | §10, §11 (pin changed on merge) |
| PAY-9 stable product checkout idempotency key | NOT STARTED (deliberate) | | would need security tokens derived from a client id; PAY-1 already closes the double charge on the client | |
| PAY-8, PAY-11, PAY-12 | NOT STARTED | | memberships cron and trials, legacy checkout path, slow work before the webhook answers | |

## Not started in this round

- Correlation IDs across every route, structured logs everywhere (some areas already log JSON with correlation ids, for example `notify`).
- CSP enforcing, `Permissions-Policy` header.
- Full IDOR sweep of all service role routes (only about 12 sampled).
- Canvas on its own origin (editor freezes from theme code; see the round 14 editor report).
- Load test on a staging copy (needs a staging Supabase project).

## Deploy 1 (live)

Wave 1 merged with main and deployed to production on 2026-10-31 as `721d8bdb1`
(Vercel `dpl_9WLWfGBpjZSWCnoNdLXc76YSkK9A`, READY). Before the push: full
`test:push` passed except one main pin (`seo-tracking-r45` expected part 346
last; loosened on purpose), production build exit 0. After: public pages 200,
the guest order takeover path refuses, `GET /auth/sync-session` with tokens
signs nobody in (303), no error or fatal log lines on the deployment in its
first hour. `smoke-deploy.mjs` failed 2 checks (`/explore` not CDN cached,
`/app` redirect marked public) that this deploy did not touch (no diff in
proxy.ts, explore, next.config, vercel.json); left for the session that owns
them. The security SQL part was renumbered 345 → 347 because main took 345
and 346.

## Wave 2 (merged on `claude/reliability-engineering` as `72d603793`, not yet deployed)

Gates on the merged result: full `npm run test:push` **all suites passed
(exit 0)**; production build exit 0; `server/pages/500.html` and `404.html`
traced into 1057 of 1057 server traces.

| ID | Status | Branch, commits | What changed | Test |
| --- | --- | --- | --- | --- |
| EVD-1 last good copy per instance only | COMPLETE (production effect NOT VERIFIED until deployed) | rel2-sites2 62e992151, 4350c96a7 | `lib/website-builder/shared-copy.ts`: last good copies kept in Next's shared data cache under fixed names that survive deploys, tagged so publish, unpublish and take down expire them at once; served only instead of an error | `tests/rel-sites2.test.ts` (fresh process, renamed functions, every read failing: page served; after tag expiry: 503) |
| EVD-2 gateway HTML / cut JSON read as data | COMPLETE | rel2-sites2 2fab70f0f | `mediaFetch` retries a REST GET answered with an HTML error page or truncated JSON, then answers 503 SLGW1/SLGW2 so sites serve the last good copy | rel-sites2 EVD-2 |
| EVD-3 auth on public routes | COMPLETE | rel2-sites2 8e2c41389 | proxy skips the session read for site assets, covers, robots, sitemaps, manifest, favicon | through the real proxy: 6–7 token calls → 0; /app still renews |
| EVD-5 `/500` ENOENT | IMPLEMENTED, NOT VERIFIED on Vercel | rel2-sites2 99ff9634b | `scripts/trace-error-pages.mjs` after `next build` adds 500/404.html to every trace (the trace ran before the page existed) | build output checked |
| IDOR full sweep | COMPLETE, no gap found | rel2-security2 1df74e775 | `docs/reliability/IDOR_SWEEP.md`, 463 rows | n/a (docs) |
| SEC-10 bridge token used twice | COMPLETE | rel2-security2 9657f3cbf, 6ec29f5f2 | atomic consume, same origin next, no-store | `tests/bridge-token-once.test.ts` |
| SEC-9 tokens over storelib:// | COMPLETE for raw tokens; bridge code path NEEDS OWNER (device testing) | rel2-security2 8c68f1530 | legacy reset finishes in the browser | `tests/custom-scheme-tokens.test.ts` |
| SEC-11 emails in logs | COMPLETE for logs; email in `/signup/verify` URL NOT STARTED | rel2-security2 2c83283ce | `maskEmail` in logs | `tests/log-privacy.test.ts` |
| SEC-12 Permissions-Policy | COMPLETE (header on storelib.com app hosts only) | rel2-security2 4b8caeb31 | camera, microphone, payment allowed where used | `tests/permissions-policy.test.ts`; smoke checks it |
| PAY-8 trial cancelled with a card | COMPLETE | rel2-commerce2 495eb1c68 | decides from Stripe's current subscription and cards | `tests/rel-commerce2.test.ts` §1 |
| PAY-12 slow work before the webhook answers | COMPLETE | rel2-commerce2 2396cbac4, 5cc8bd696 | state writes first, PDFs, emails, fee read after the answer; 3272ms → 36ms in the test | §2 |
| PAY-11 legacy checkout path | COMPLETE | rel2-commerce2 4e95913a4 | `latest_charge`, logged | §3 |
| PAY-5 bank shown missing | COMPLETE | rel2-commerce2 6e78f0277 | "We couldn't check your bank account right now" | §4 |
| PAY-9 stable idempotency key | NOT STARTED (designed in IMPLEMENTATION_PLAN.md) | rel2-commerce2 b9ed5f05c | needs a `checkout_attempts` table | |
| Correlation ids | COMPLETE | rel2-obs b224a1d91 | request id on error rows, cron failures, webhooks | `tests/rel-obs.test.ts` |
| Structured logs | COMPLETE | rel2-obs b96bac6ce, 98c535631 | top noisy and misleveled lines as JSON at their real level | rel-obs |
| Health endpoint | COMPLETE | rel2-obs ccdb7b0e4 | bounded to 4s, one row ping, per dependency state | rel-obs |
| Load test script | COMPLETE (run only against a local stub) | rel2-obs d0b49887f | `scripts/load/scenarios.mjs`, refuses production and live Stripe | rel-obs |

Process note: the obs agent force pushed its own branch once (with lease)
after a rebase; nothing was lost and no shared branch was touched.

## Still open after wave 2

- PAY-9 (designed), SITE-8 cold instance routing, `/signup/verify?email=` in URLs,
  the `storelib://reset-password?code=` app link (needs device testing),
  CSP enforcing, canvas on its own origin, a staging load test,
  Supabase capacity review (needs dashboard access).

## Deploy 2 (live)

Wave 2 merged with main (22 new commits; only the generated SQL catalog
clashed; main's own new part became 350) and deployed on 2026-11-01 as
`940fc71e0` (Vercel `dpl_3Nn662ARdyyNREnN1ap5yU1rBGna`, READY). Before the
push: full `test:push` all suites passed, production build exit 0, error pages
traced into 1058 of 1058 traces. After: public pages, the creator site, its
robots.txt, OnePage on storelib.me and `/api/health` answer 200;
`Permissions-Policy` is on storelib.com and absent on creator sites;
`x-request-id` on responses; smoke: the same two pre-existing failures as
deploy 1 (`/explore`, `/app` cache headers).

First hour on the new deployment: a burst at 09:03–09:04 UTC of Supabase Auth
`auth/v1/user` over 10s together with REST reads over 20s (`site_releases`,
`community_members`): Supabase itself was slow. The new code handled it as
designed (no sign outs; the theme site drew from rows; one "site unavailable").
The proxy runs in the visitor's nearest region (fra1 for Europe) while
functions run in iad1, so the proxy's session read crosses the Atlantic;
creator site pages (`/collections/all` on a theme site) still do that read
for owner previews. Candidate follow up: skip the proxy's session renewal on
public theme site pages for visitors without a Storelib session cookie.

## Wave 3 (merged on `claude/reliability-engineering`, not yet deployed)

Started because of the random "We could not check your sign in just now" and
"Cannot reach the server" screens. Root cause: the Supabase project signs
tokens with the legacy shared secret (HS256), so
`/auth/v1/.well-known/jwks.json` is `{"keys":[]}` and every identity check is a
network call to `/auth/v1/user`. The local fallback only knew JWKS keys, and it
also read the token through `getClaims()`, which waits on supabase-js's session
lock that a hung `getUser()` holds. So during any Auth slowdown the check
timed out and the error screens showed.

| ID | Status | Branch, commits | What changed | Test |
| --- | --- | --- | --- | --- |
| AUTH local verify | COMPLETE in code; production effect needs the owner (MANUAL_ACTIONS 2b) | rel3-auth 8ea27432c | `lib/auth/verify-token.ts` (server only): HS256 with `SUPABASE_JWT_SECRET`, ES256/RS256 from JWKS; exp/nbf, issuer, audience, role, sub checked; alg none and confusion refused | `tests/auth-local-verify.test.ts` |
| AUTH use it | COMPLETE | rel3-auth 5382a6979, 656a7c315 | pages: one 2.5s Auth try, then the locally verified claims; proxy: a locally valid token passes with no Auth call, an invalid one still goes to Auth; sync-session answers from verified claims when Auth hangs or 5xx, 401/403 still refused; token read with `getSession()` so no lock wait | `tests/auth-hs256-outage.test.ts` (base: ~6.3s and null user; now ~2.5s and the user; proxy 5ms) |
| AUTH client recovery | COMPLETE | rel3-auth fee1b362a | marked 503s retried twice; the gate tries 3 times over ~6s before its screen, then checks `/api/auth/state` with backoff (up to ~4.5 min) and on reconnect, and reloads by itself | `tests/auth-client-retry.test.ts` |
| AUTH public pages | COMPLETE (already true, now pinned) | rel3-auth 991cf44c5 | no Auth call for cookieless visitors or theme sites | auth-hs256-outage §8 |
| AUTH owner steps | COMPLETE | rel3-auth 78b9fc8eb | `docs/reliability/AUTH_KEYS.md` | n/a |
| AUTH route writes during an outage | KEPT STRICT on purpose | | `routeUser()` default still needs Auth to answer, so a session revoked in the last hour can never change data during an outage | auth-reliability |
| PAY-9 stable idempotency key | IMPLEMENTED; live after SQL 352 | rel3-pay9 0fea248b1, 3248d66c2, 8e5b0aa49 | `checkout_attempts` (server only) keeps one attempt's tokens so a repeated Pay press gets the same PaymentIntent; changed order gets a new one; mismatch or canceled intent recovers; without the table, exactly as before | `tests/pay9-checkout-attempts.test.ts` (40) |
| /app sign-in redirect cache | COMPLETE | rel3-leftovers 04a30519d | `private, no-store` on the /app and /sell sign-in 307s | `tests/rel3-leftovers.test.ts` |
| /explore CDN cache | KEPT DYNAMIC on purpose | lead 1f860dbba | it builds "For you" per visitor, so a shared copy would remove that; the smoke check now accepts private | n/a |
| SEC-11 email in `/signup/verify` | COMPLETE | rel3-leftovers 69f8291ce, deacde24b | the page needs only the account id; old links still work and the email is removed from the address bar | rel3-leftovers SEC-11 |
| Shop read failure cached as empty | COMPLETE | rel3-leftovers 59b573104 | failed product reads throw inside the cache, so nothing empty is kept and the last good copy is served | rel3-leftovers SHOP-EMPTY |
| SITE-8 cold instance routing | COMPLETE | rel3-leftovers c24d1bf27, 4db7275e3 | unknown answer on a subdomain gives 503 Retry-After 5, no-store, instead of a CDN-held wrong page | rel3-leftovers SITE-8 |
| CSP readiness | COMPLETE (still report only) | rel3-leftovers 970d30279 | `SECURITY.md` section 6 | rel3-leftovers CSP |
| Canvas on its own origin | IMPLEMENTED behind `NEXT_PUBLIC_CANVAS_ORIGIN`, OFF | rel3-canvas d79b912d7..f85ed8abc | canvas shell on storelib.me, own process, strict message origins, HMAC pass, frame-ancestors; flag off is unchanged | `tests/canvas-origin.test.ts` (52); probes: editor long tasks down in 5 of 6 scenarios, ai-burst not better, keep off until a staging check over https |

Still open after wave 3: the owner's key migration (or `SUPABASE_JWT_SECRET`),
SQL 347, 348, 349, 352, canvas staging check, the `storelib://` app link on a
device, CSP enforcing, a staging load test, Supabase capacity review.

## Deploy 3 (live)

Wave 3 deployed on 2026-11-01 as `bdaae889d` (Vercel
`dpl_B566bfbUcBN2i3UVPTeSL8uaFb8T`). Before: full `test:push` passed except
one smoke pin the lead had changed (fixed, suite rerun 85/0); production build
exit 0, error pages traced into 1060 of 1060. After: home, pricing, explore,
health, `/api/auth/state`, the creator site and its robots.txt answer as
expected; `/app` redirect is `private, no-store`; `smoke-deploy` all passed
(first time with no failures); no runtime errors in the first 15 minutes.
The sign-in errors only fully stop once the owner does MANUAL_ACTIONS 2b.
