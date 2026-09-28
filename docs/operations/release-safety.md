# Release safety: nothing broken goes live quietly

Two halves. Before a change is live, it is checked. After it is live, anything
that breaks is written down and you hear about it.

## Before: CI on every push

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

| Job | What it proves |
| --- | --- |
| Tests | `pnpm test:push`, every suite the sessions run by hand, now run every time. |
| Lint | `pnpm lint`, clean. |
| Type errors only go down | `scripts/ci/typecheck-ratchet.mjs`: the codebase carries type errors from before anyone checked (`.github/typescript-baseline.json`, file by file). No file may get more. Fixing is always allowed; run `node scripts/ci/typecheck-ratchet.mjs --write` after a fix so it cannot come back. When the baseline is empty, `typescript.ignoreBuildErrors` comes out of `next.config.mjs`. |
| Production build | `pnpm build` with placeholder keys, the build Vercel does. |

A red CI on GitHub is a broken commit on `main`: fix it before anything else.

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
rebuild. Then fix forward on `main`.

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

"You" is an email to `ALERT_EMAIL` and a post to `ALERT_WEBHOOK_URL` (a Slack
or Discord incoming webhook). Each kind of error is told the first time, then
at most once an hour while it continues. Every occurrence is counted in the
admin: Health, Errors. Nothing personal is sent: addresses are masked and
anything named like a secret is dropped (`lib/observability/report.ts`).

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
