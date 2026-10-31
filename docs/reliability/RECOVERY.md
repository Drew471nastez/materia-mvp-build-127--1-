# Recovery runbooks

What to do when something fails. Each runbook: how you notice, what the
system already does by itself, what a person does, and how to know it is
over. Rolling back code and data: [rollback.md](../operations/rollback.md).
Restoring from backups: [backups.md](../operations/backups.md).

## Where to look first

| Signal | Where |
| --- | --- |
| Errors by kind, first occurrence emailed, then hourly | Admin, Health, Errors (`error_events`); `ALERT_EMAIL`, `ALERT_WEBHOOK_URL` |
| Uptime and database reachability | `https://storelib.com/api/health`; GitHub Actions uptime workflow (every 15 min) |
| Cron runs | `/admin/performance`, Scheduled jobs (`cron_runs`); Vercel, Settings, Cron Jobs |
| Function errors and timeouts | Vercel, the project, Observability and Logs |
| Database | Supabase Dashboard, Reports and Query Performance |
| Stripe | Stripe Dashboard, Developers, Webhooks (delivery attempts), and status.stripe.com |
| Mailgun | Mailgun dashboard, Logs; status page |

## 1. Database slow or down

- **Notice:** "site unavailable" and "served the last good copy" lines,
  `DeadlineExceeded`, statement timeouts, "connection pool" errors; `/api/health`
  fails.
- **Already automatic:** every Supabase call has a deadline; reads retry
  twice; theme sites serve a held last-good copy or a 503 with `Retry-After`
  (not cached); billing shows the stored plan; Stripe webhooks answer 500 and
  Stripe retries; crons skip when their lease is held.
- **Do:**
  1. Check Supabase status and the project's Reports (CPU, connections).
  2. If one query dominates (Query Performance), find its route; if it is a
     dashboard or analytics read, consider disabling crons temporarily
     (Vercel, Settings, Cron Jobs, Disable) to cut load. Re-enable after.
  3. If the database is down, not slow: there is nothing to fail over to.
     Wait for Supabase, or follow backups.md layer 2 or 3 if data is lost.
  4. Do not redeploy during the incident unless a deploy caused it.
- **Over when:** `/api/health` ok; "site unavailable" stops; Stripe webhook
  deliveries succeed again (Stripe retries failed ones for up to 3 days).
- **Afterwards:** check Admin, Orders for anything stuck `pending` more than
  an hour; the 10 minute follow-up sweep should have finished them.

## 2. Supabase Auth down or slow

- **Notice:** `DeadlineExceeded … auth/v1/user`, builder 503s, reports of
  "it logged me out".
- **Already automatic:** app code treats a timeout as "indeterminate", never
  as signed out; the proxy redirects to login only on "anonymous"; routes
  using `routeUser` / request scope accept the JWT claims; the builder answers
  503 and retries; the native app keeps its stored session.
- **Known gaps until fixed:** a 500/429 on token refresh deletes cookies
  (SEC-3); `/auth/continue` sends users to login (SEC-8).
- **Do:** nothing in the app; watch Supabase status. Tell support that
  re-login may be needed for some users.
- **Over when:** auth `DeadlineExceeded` lines stop.

## 3. Stripe down

- **Notice:** breaker log lines (`storelib_stripe_unavailable`), checkout
  errors, status.stripe.com.
- **Already automatic:** calls time out at 20s, retry twice, then the
  breaker refuses at once for 10-60s per instance; billing shows the stored
  plan; nothing is downgraded; fulfilment answers 503 so Stripe redelivers.
- **Known gaps until fixed:** confirm can say "Nothing was charged" when
  Stripe may have charged (PAY-1); Payouts shows empty figures (PAY-5).
- **Do:** nothing to switch. After recovery: Stripe, Developers, Webhooks,
  the endpoint, resend failed deliveries if any are not retried; check
  Admin, Orders for buyers charged without an order (search Stripe payments
  in the window against orders).
- **Over when:** webhook deliveries are 2xx again; breaker lines stop.

## 4. Email provider (Mailgun) down

- **Notice:** mail send errors in `error_events`; Mailgun status.
- **Already automatic:** sends time out at 15s with bounded retries; the
  notify outbox keeps jobs and retries under a lease; order emails are
  follow-up steps re-run by the 10 minute sweep; community emails are deduped
  by key so a retry does not double-send. Alert emails also go through
  Mailgun, so use `ALERT_WEBHOOK_URL` as the second channel.
- **Do:** wait. Do not resend campaigns by hand (risk of duplicates). After
  recovery, check legacy scheduled emails stuck in `sending` (SHR-9):
  ```sql
  select id, status, updated_at from public.scheduled_flow_emails
  where status = 'sending' and updated_at < now() - interval '1 hour';
  ```
  (the legacy queue table read by `process-scheduled-emails`).
  Decide per row; do not resend blindly.
- **Over when:** notify outbox drains (admin performance page) and new sends succeed.

## 5. Bad deploy

- **Notice:** post-deploy smoke warning, new error kinds right after a
  deploy, uptime check failing.
- **Do:** Vercel, Deployments, Production, the last good one, **Instant
  Rollback** (seconds, no rebuild). Full steps, what a rollback does not undo
  (env vars, database rows, crons follow the live deployment) and the
  ten-minute checklist: [rollback.md](../operations/rollback.md) section 1
  and "Who checks what afterwards".
- **Then:** fix forward on `main`; Promote or Undo Rollback when fixed.
  SQL parts are additive, so never undo SQL to match a code rollback.

## 6. Webhook backlog replay

- **Stripe:** Stripe retries failed deliveries with backoff for up to 3 days.
  Events are claimed in `stripe_webhook_events`; a replay of a done event is
  a no-op, a failed one is re-run, a dead run is taken over after 10 minutes.
  To replay by hand: Stripe, Developers, Webhooks, the endpoint, the event,
  Resend. Safe to repeat.
  ```sql
  -- events that failed and have not yet succeeded
  select event_id, type, account, attempts, last_error, received_at
  from public.stripe_webhook_events
  where processed_at is null and last_error is not null
  order by received_at desc limit 50;
  ```
  (columns as written by `lib/payments/ledger.ts`.)
- **Mailgun:** inbound events are deduped by event id; Mailgun retries on
  non-2xx. Nothing to replay by hand normally.
- **GitHub:** redeliver from the repository's webhook settings. Until SITE-11
  is fixed, a delivery that failed during apply is dropped as a duplicate
  for 24 hours; the creator can push again or use the builder's sync.

## 7. Cron stuck or lease held

- **Notice:** `/api/health` reports a job late; `cron_runs` shows a run with
  no finish.
- **How the lease works:** a run is skipped while an earlier unfinished run
  is younger than the job's `maxDuration` plus 30 seconds
  (`lib/observability/report.ts:155-210`). A run killed by the platform
  never writes its finish, but its lease expires on its own after that time.
  So a stuck lease clears itself within about 5.5 minutes at most.
- **Do:**
  1. Vercel, Logs, filter the cron path: did it time out (EVD-4, SHR-3,
     SHR-4) or fail?
  2. To run it now: Vercel, Settings, Cron Jobs, the job, **Run**.
  3. If it keeps timing out, the fix is in code (run-wide deadline); in the
     meantime it keeps making partial progress each run.
  4. To stop all crons during an incident: **Disable Cron Jobs** (instant,
     no redeploy).
- **Over when:** the job's next run finishes and `/api/health` is ok.

## RPO and RTO

| Data | RPO (most that can be lost) | RTO (time to restore) | Status |
| --- | --- | --- | --- |
| A deleted row | none within 90 days (`deleted_rows`) | under an hour | in place (part 66) |
| Whole database, Supabase backup | 1 day without PITR; about a second with the PITR add-on | a few hours | **UNKNOWN whether PITR is enabled**; owner to check Supabase, Add-ons |
| Whole database, off-site copy | 1 day | a few hours (restore into a new project, repoint env vars) | **UNKNOWN whether the nightly backup and weekly drill are configured and green**; owner to check GitHub Actions |
| Files | 1 day (off-site copy) | under an hour for one file; longer for a bucket | same unknown |
| A deploy | none (code is in git) | seconds (Instant Rollback) | in place |
| One creator's site | to their last publish | about a minute | in place (releases, part 180) |
| Stripe data | Stripe is the source of truth | n/a | in place |

Unknowns to close: PITR status, backup workflow secrets and last green run,
whether the restore drill has ever passed, and the real Supabase statement
timeout and pool size.
