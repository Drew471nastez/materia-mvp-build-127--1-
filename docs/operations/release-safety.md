# Release safety: nothing broken goes live quietly

Three parts. Before a change is live, it is checked, and its build memory
and bundle size are held to a budget. The moment a deployment is ready, it
is opened and checked. After it is live, anything that breaks is written
down and you hear about it. Load tests: [load-testing.md](load-testing.md).
Undoing something: [rollback.md](rollback.md).

## Before: CI on every push

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

| Job | What it proves |
| --- | --- |
| Tests | `pnpm test:push`, every suite the sessions run by hand, now run every time. |
| Lint | `pnpm lint`, clean. |
| Type errors only go down | `scripts/ci/typecheck-ratchet.mjs`: the codebase carries type errors from before anyone checked (`.github/typescript-baseline.json`, file by file). No file may get more. Fixing is always allowed; run `node scripts/ci/typecheck-ratchet.mjs --write` after a fix so it cannot come back. When the baseline is empty, `typescript.ignoreBuildErrors` comes out of `next.config.mjs`. |
| Production build | `pnpm build` with placeholder keys, the build Vercel does, run through `scripts/ci/measure-build.mjs`: the peak memory of the whole build process tree, sampled from `/proc`, must stay under 7,600 MB (Vercel Standard builds in 8 GB). Then `scripts/perf-budget.mjs`: first-load JS of eight key routes and the server output against `perf-budgets.json`. Both figures are in the job's summary. |

A red CI on GitHub is a broken commit on `main`: fix it before anything else.

### The fast part, before a push

`node scripts/pre-push.mjs` runs on this machine what a change can break, in
a minute or two: ESLint on the changed `.js`/`.mjs` files, and the suites
from `scripts/run-push-tests.mjs` that are changed or read a changed file.
`--types` adds the type error ratchet, `--list` only prints the suites,
`--base <branch>` compares with something other than `origin/main`. As a git
hook, once per clone:

```bash
printf '#!/bin/sh\nexec node scripts/pre-push.mjs\n' > .git/hooks/pre-push && chmod +x .git/hooks/pre-push
```

It is a shortcut, not a replacement: CI still runs everything.

### Run the type checks locally

`pnpm typecheck` runs the complete strict check. It still exits with diagnostics
while the legacy errors in the baseline remain. `pnpm typecheck:ratchet` runs
that same compiler and enforces the existing per-file no-regression policy.
Neither command upgrades the lockfile's TypeScript 5.0.2 or excludes tests.

The graph has roughly 7,100 inputs and can exceed Node's default heap. The
commands provide a 6 GiB old-space ceiling, as CI does. The ratchet preserves
an explicit heap choice and unrelated Node options. An exhausted heap, killed
compiler, missing input, or invalid option is a failure, not zero type errors.
The ES2022 target matches the Node 22 test workflow; Next's browser compilation
still uses its own supported browser targets.
Do not run a build or `next typegen` concurrently with the check in the same
checkout: Next replaces `.next/types` during generation. Finish generation
first, then check; a missing generated input must fail rather than be ignored.
The separate CI jobs already use independent checkouts.

The production Next CLI has a separate 4 GiB heap ceiling in `pnpm build`.
The package's Node 22 engine keeps Vercel and local installs aligned with CI.
Route-data and prerender work uses one worker in `next.config.mjs`.
The Next CLI loads `scripts/build-limits.env` for build-only Rayon and Tokio
thread defaults of two, rather than sizing native pools to each machine's
CPU count. Explicit caller values take precedence; runtime environments
and their service configuration are not changed.
These are resource limits, not validation skips; the 7,600 MB whole-process
build budget and bundle budgets remain unchanged.

### Budgets

`perf-budgets.json` holds, per route, the first-load JavaScript (gzipped)
and the size of `.next/server` (without its trace lists), each set at the
figure measured when it was added plus 10%. Measured on 15 October 2026:

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

A route's first load is every client chunk its client reference manifest
names (root layout to page, with their error and not-found boundaries) plus
the runtime, each counted once. Turbopack writes no size table of its own.

The build's peak was 6,958 MB RSS (6,625 MB PSS) on 4 CPUs, against the
7,600 MB ceiling. `BUILD_PEAK_LIMIT_MB` changes the ceiling for one run.

A route over budget fails the build job. If the growth is deliberate, raise
its number in `perf-budgets.json` in the same pull request and say why;
`node scripts/perf-budget.mjs --write` resets every budget to today plus 10%,
which should be rare. Run it locally after `pnpm build`:
`node scripts/perf-budget.mjs`.

### Make Vercel wait for it (one time, the owner)

Vercel deploys every push to `main` the moment it lands. To make production
wait until CI is green:

1. Vercel, the project, Settings, **Deployment Checks**: add the GitHub checks
   `Tests`, `Lint`, `Type errors only go down` and `Production build`. A
   production deployment is then built but not promoted until all four pass.
2. GitHub, the repository, Settings, Branches, add a rule for `main`: require
   the same four checks to pass. (Sessions that push straight to `main` then
   have to go through a pull request.)

### Undo a bad deploy

Vercel, Deployments, the last good one, **Instant Rollback**. Seconds, no
rebuild. Then fix forward on `main`. The whole runbook, including one
creator's website, a SQL trigger and a variable, is
[rollback.md](rollback.md).

## Right after: the deployment is opened and checked

`.github/workflows/post-deploy.yml` runs when Vercel reports a deployment
ready (GitHub's `deployment_status` event, state success, which Vercel's
GitHub integration sends for every deployment). It runs
`scripts/smoke-deploy.mjs` against the deployment's address:

- `/`, `/pricing`, `/explore`, `/features` answer 200 and are public
  (`Cache-Control` lets the CDN hold them); `/explore` may redirect home
  instead, as it does while the marketplace is switched off;
- `/app` is never public, `/checkout/site` is `no-store`;
- `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and a
  content security policy are sent (vercel.json);
- `/api/health` says ok and is never cached;
- `robots.txt` and `sitemap.xml` answer with their content;
- `/login` renders, and `/api/health` carries nothing that reads as a key or
  a token;
- with the repository variable `SMOKE_SITE` set (a username, or a full
  address such as `https://demo.storelib.com`), that website opens;
- the critical paths that need a real creator, each from a repository
  variable, and each a visible `skip` line in the summary while unset:

  | Variable | Example | Checks |
  | --- | --- | --- |
  | `SMOKE_CREATOR` | `satori` | `/<handle>` (the creator page) answers 200 |
  | `SMOKE_PRODUCT` | `satori/loop-pack-1` | the product page answers 200 |
  | `SMOKE_CHECKOUT_PRODUCT` | a published product's id | `/checkout?productId=<id>` renders (200) and is never `public` |
  | `SMOKE_DOMAIN` | `https://shop.example.com` | a creator's custom domain answers 200 (production deploys only) |

It is **advisory**: it runs after the deployment exists, so it cannot stop
it. A failure is a warning on the run with the details in its summary, and
a post to `ALERT_WEBHOOK_URL` when set. It never turns a check red.

Run it by hand against anything:

```bash
BASE_URL=https://storelib.com node scripts/smoke-deploy.mjs
```

Against a local `next start` on placeholder keys, set `SMOKE_NO_DATABASE=1`
(health only has to answer, sitemap may be 503). The security headers are
skipped on localhost, since `next start` does not apply vercel.json.

### Set it up (one time, the owner)

1. Vercel's GitHub integration must be connected (it is, if pull requests
   show Vercel's preview links). It posts deployment statuses by default; if
   Vercel, Settings, Git, **Deployment Status Events** is off, turn it on.
2. If previews are behind Vercel Authentication (Settings, Deployment
   Protection), create a **Protection Bypass for Automation** secret there and
   add it in GitHub, Settings, Secrets and variables, Actions, as
   `VERCEL_AUTOMATION_BYPASS_SECRET`. Without it every preview answers 401
   and the smoke run says so.
3. Optionally the variable `SMOKE_SITE` (above), and `SMOKE_CREATOR`,
   `SMOKE_PRODUCT`, `SMOKE_CHECKOUT_PRODUCT`, `SMOKE_DOMAIN` for a creator
   who agrees to be the check (a demo account is best: the checks only read).

### Rolling back when it fails

The workflow does not roll back by itself: it has no Vercel token, and a
rollback that a flaky check can trigger is worse than a warning. A failure
posts to `ALERT_WEBHOOK_URL` with a link to the run; the rollback is one
click, [rollback.md](rollback.md) section 1 (Vercel, Deployments, the
previous production deployment, Instant Rollback). With `SMOKE_BLOCKING` and
Deployment Checks (below) a failing production deploy is never promoted, so
there is nothing to roll back.

### Make it blocking (if you want that)

Two steps, both needed:

1. GitHub, Settings, Secrets and variables, Actions, **Variables**: add
   `SMOKE_BLOCKING` = `true`. A failed smoke run is then a failed check
   instead of a warning.
2. Have Vercel wait for it before promoting: Vercel, Settings, **Deployment
   Checks**, add the GitHub check `Smoke the deployment`. Vercel then builds
   production, dispatches `vercel.deployment.success` to the repository
   (the workflow listens for it), and promotes only when the check passes.
   A deployment that fails it stays built and unpromoted; the live site is
   untouched.

To undo either, delete the variable or remove the check.

## After: alerts when something breaks

| What | Where it goes |
| --- | --- |
| Any server error, caught or not (`instrumentation.ts`, `onRequestError`) | `error_events` + you |
| The Stripe webhook failing an event | `error_events` + you (Stripe retries on its own) |
| A scheduled job failing (every run recorded in `cron_runs`) | `error_events` + you |
| An account deletion step failing | `error_events` + you |
| A notification email failing | `error_events` + you |
| A crash in someone's browser (`/api/client-errors`) | `error_events` + you |
| The site or database down, or a job late (`/api/health`, checked every 15 minutes from outside by `.github/workflows/uptime.yml`) | the GitHub run fails + you |
| A nightly backup or the weekly restore drill failing | the GitHub run fails + you |

### Alert routing

| Alert | Sent by | Channel | How soon | Who acts, with what |
| --- | --- | --- | --- | --- |
| A new kind of server error (uncaught, or a route, webhook, job or account step that reports it) | `lib/observability/report.ts` | `ALERT_EMAIL` (Mailgun) and `ALERT_WEBHOOK_URL` | first occurrence, then at most hourly while it continues | the owner: Admin, Health, Errors; the `rid` in the alert finds the request in Vercel's logs |
| A browser crash (an error boundary, `/api/client-errors`) | the same | the same | the same | the same; the digest in the report matches the server's `error_report` line |
| `/api/health` not 200 three times in a row (site down, database down, a job late or failed) | `.github/workflows/uptime.yml`, every 15 minutes | `ALERT_WEBHOOK_URL`, and GitHub's failed-run email | within 15 to 20 minutes | the owner: [RECOVERY.md](../reliability/RECOVERY.md) for the dependency named in `checks` |
| A deployment fails the smoke checks | `.github/workflows/post-deploy.yml` | `ALERT_WEBHOOK_URL`, a warning on the run | minutes after the deploy | the owner: roll back ([rollback.md](rollback.md) section 1) unless the failure is known |
| A nightly backup or the weekly restore drill fails | `backup.yml`, `restore-drill.yml` | GitHub's failed-run email, `ALERT_WEBHOOK_URL` | the morning after | the owner: [backups.md](backups.md) |
| The live database's structure differs from `supabase/schema/` | `schema-drift.yml`, nightly | a pull request showing the difference (GitHub notifies) | the morning after | the owner: merge it, or run the SQL part it shows is missing |

Nothing pages a phone. If that is wanted, point `ALERT_WEBHOOK_URL` at a
service that pages (a Slack channel with notifications on, or an incident
tool's incoming webhook); every alert above already goes there. Keep
`ALERT_EMAIL` on an address that is read daily: the Mailgun sender must be
verified for it to arrive.

"You" is an email to `ALERT_EMAIL` and a post to `ALERT_WEBHOOK_URL` (a Slack
or Discord incoming webhook). Each kind of error is told the first time, then
at most once an hour while it continues. Every occurrence is counted in the
admin: Health, Errors. Nothing personal is sent: addresses are masked and
anything named like a secret is dropped (`lib/observability/report.ts`).

### `/api/health` for an uptime monitor

`GET /api/health`, no sign in, `Cache-Control: no-store`. Point any uptime
service at it (GitHub's `.github/workflows/uptime.yml` already asks every 15
minutes). It answers in about 4 seconds at worst, whatever the database does:
the database ping (one id from `creators`, no count) has 2.5 s, the job read
gets what is left of 4 s, and the function's `maxDuration` is 10 s.

| Status | Body `status` | Meaning |
| --- | --- | --- |
| 200 | `ok` | the database answered and every job is on time (or not recorded yet) |
| 503 | `degraded` | the database answered, a scheduled job is late or its last run failed |
| 503 | `down` | the database did not answer in time, or is not configured |

`checks` gives each dependency on its own, for a monitor that alerts on one:
`{ "database": "ok" | "down", "jobs": "ok" | "degraded" | "unknown" }`.
`jobs` lists each job's state and last run; `build` names the deployment.
Nothing private is in it: no error text from the database, no keys, no
people. Alert on two failures in a row, not one: a single slow answer during
a deploy is normal.

### Where each figure is

| Figure | Where |
| --- | --- |
| Speed, errors, slow statements, checkout reliability | `/admin/performance` |
| Each scheduled job: last run, failed or late, runs and failures in 24 hours (`cron_runs`) | `/admin/performance`, Scheduled jobs; `/api/health` |
| CDN cache hit ratio for real visitors | Vercel, Observability, Edge Requests. Vercel adds `x-vercel-cache` after the function answers, so the app cannot see it. For a test run, `scripts/load/storefront.mjs` reports it ([load-testing.md](load-testing.md)). |
| Function memory and duration | Vercel, Observability, Vercel Functions |
| Build memory and bundle size | the CI build job's summary |

No paid service is involved in any of these.

### Following one request through the logs

Every request that passes the proxy gets one id, `x-request-id`
(`lib/net/request-id.ts`): a valid one the caller sent is kept, else Vercel's
own `x-vercel-id`, else a new one. The proxy sends it back on every response,
so a person's failed load (browser dev tools, Network, the response headers)
can be looked up. The same id is in:

| Where | As |
| --- | --- |
| An error row in `error_events` (Admin, Health, Errors) | `last_context.rid`, for errors from `onRequestError`, the scheduled jobs, both Stripe webhooks, `/api/client-errors` and membership checkout |
| The `{"evt":"error_report",...}` log line `reportError` writes | `"rid"`, with `"route"`, `"method"`, `"status"` and `"digest"` for an uncaught error |
| Any other `console.error` / `console.warn` on the server (the console guard, below) | `"rid"` and `"route"` |
| JSON log lines from `lib/net/log.ts` (`logLine`, `logEvent`, `logServiceFailure`) and the proxy | `"rid"` |
| Notification events, jobs and deliveries | `correlation_id` |

Search Vercel's logs (Observability, Logs) for the id to see every line of
that request. The id is never a person's data: it is a random or Vercel id,
and a header that does not look like one (letters, digits, `-_:.`, 8 to 100
characters) is dropped. `reportError` does not read the request's headers by
itself (that would turn a cached page dynamic): a caller passes
`requestId: requestIdFrom(request.headers)`. Errors raised deep in a library
with no request at hand are written without one.

### Every server error line is JSON, with nothing private in it

`instrumentation.ts` `register()` installs `lib/net/console-guard.ts` in the
Node runtime. From then on every `console.error` and `console.warn` on the
server, from any of the ~770 route handlers or any page, is written as one
JSON line at the same level:

```
{"evt":"log","level":"error","route":"/api/orders/[id]","rid":"iad1::abc","msg":"[orders] read failed PGRST301 ...","stack":"Error: ..."}
```

- `route` is the route's pattern and `rid` the request id, read from
  Next's own request storage when the line is written (left out outside a
  request, for example at build time);
- a line that already is JSON (`logEvent`, the proxy) keeps its fields and
  gains `route` and `rid` when it had none;
- every string goes through `lib/net/scrub.ts` `scrubSecrets`: JWTs,
  `Bearer` values, Stripe/Resend/Supabase/webhook keys, Supabase session
  cookies, whole `Cookie` headers, `password`/`token`/`secret`/`apikey`
  values, `?code=` and `?token_hash=` in addresses and card numbers (Luhn
  checked) are replaced; addresses are masked as `an***@example.com`. Ids,
  PostgREST codes, amounts, times and routes stay;
- an uncaught error is logged once: `onRequestError` writes the
  `error_report` line (route, method, status 500, rid, digest) and marks
  the error, and the guard drops Next's own print of the same object.

`console.log` and `console.info` are not changed. `STORELIB_LOG_RAW=1`
(an environment variable) turns the JSON shape off and keeps the scrubbing,
if a log drain ever needs the old text.

A route that catches its own error and answers 500 does not tell the log its
status (only the response knows it). Vercel's request log has the status for
every request under the same `x-vercel-id`, which is the `rid` here.

### Log levels

`logEvent(level, evt, fields)` in `lib/net/log.ts` writes one JSON line at
its real level, with nothing private in it (tokens, keys and addresses are
cut). Vercel's log filters by level, so a line that is informational but
written as an error hides the real errors. The lines that were the most
frequent or at the wrong level in production (24 hours to 2026-10-31) now
go through it:

| `evt` | Level | Was |
| --- | --- | --- |
| `translate_models_changed` | info | `[translate] gemini/cloudflare models for translating now`, at error |
| `site_last_good_served` | warn | `[compat-site]` / `[published-site] served the last good copy`, at error (the visitor got a page) |
| `site_release_pointer_unread` | warn | `[site-releases] the live release could not be read, drawing from the rows`, at error |
| `rate_limit_count_failed` | warn | `[rate-limit] counting failed, allowing`, at error |
| `explore_creators_embed_refused` | warn | `[ExplorePage] Creators embed refused`, at error |
| `stripe_payment_failed` | info | `[Webhook] Payment failed` (a declined card), at error |
| `stripe_invoice_payment_failed` | warn | `[Invoice] Payment failed`, at info |
| `physical_unconfirmed_unread` | error | `[physical] unconfirmed deliveries not read: undefined` (now with the reason) |
| `auto_translate_list_failed` | error | `[auto-translate] could not list the changed stores` (now with the reason) |
| `cron_scheduled_emails_done` | info | a pretty-printed object over about thirty lines |
| `phase_timing` | info, warn from 3 s | `[product-timing] id=... total=...`, one per product page render |

Each line keeps the old text in `msg`, so an old search still finds it.
Lines that mean a visitor got no page (`site unavailable`) stay errors.

Known gap: where the proxy answers with a plain `NextResponse.next()` (no
`{ request }`), the route does not see an id the proxy made up. On Vercel
that is never the case in practice, since the proxy's id is `x-vercel-id`,
which the route reads as well; locally, the route and the response can show
different ids.

### Set it up (one time, the owner)

1. Vercel, Settings, Environment Variables, Production:
   `ALERT_EMAIL` = where you want alerts (it goes through Mailgun, so the
   Mailgun keys must be set), and optionally `ALERT_WEBHOOK_URL`.
2. GitHub, Settings, Secrets and variables, Actions: `ALERT_WEBHOOK_URL`
   (the same webhook) for the uptime, backup and drill jobs. Optionally a
   variable `SITE_URL` if the site is not `https://storelib.com`.
3. Run run-now part 68 (it is in the SQL files) so errors and job runs are recorded.
4. GitHub emails failed scheduled runs to whoever last changed the schedule:
   open each workflow in GitHub once and save it (or disable and enable it) so
   that is you.
