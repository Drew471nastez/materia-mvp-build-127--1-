# Storelib notification engine

Storelib decides who hears about what, when, and how. Mailgun only carries the
email. The vocabulary (events, notification types, shapes) is in `types.ts`.

```
business action
  -> domain event        emit() in outbox.ts, or a database trigger (products, auth.users, creators, custom_domains)
  -> notification_events the outbox: one row per event, unique event_key
  -> orchestrator        orchestrator.ts runs the workflows in workflows/*.ts for the event
  -> notification_jobs   one row per planned notification, unique idempotency_key, run_at for delayed ones
  -> worker              worker.ts: claim, re-check state, preferences, suppression, cooldown, daily cap
  -> channels            channels/email.ts (EmailProvider -> MailgunEmailProvider), channels/in-app.ts
  -> deliveries          notification_deliveries, updated by the Mailgun webhook (tracking.ts)
```

## Why this shape

- **Postgres is the queue.** Storelib already runs three durable Postgres job
  systems (automations, campaigns, notification rules) with leases, retries and
  `FOR UPDATE SKIP LOCKED` claims, driven by Vercel crons. This engine uses the
  same pattern, so there is one kind of queue in the codebase. Nothing is held
  in memory: a delayed job is a row with a `run_at`, and survives restarts and
  deploys.
- **Transactional outbox.** Products are written from the browser under RLS,
  Stripe Connect state is written by the webhook, passwords and emails change
  inside Supabase Auth. Triggers on those tables insert the event row in the
  same transaction as the change, so the change and its event cannot disagree.
  Server code that raises an event (webhook, routes) calls `emit()`, which is
  idempotent on the event key, so a Stripe retry raises it again harmlessly.
- **Soon, then the cron.** `emit()` asks for the events and due jobs to be
  processed in `after()` with a small budget; the `/api/cron/notify` cron
  (every 5 minutes) and the existing hourly crons pick up anything left, with
  delayed jobs among it.
- **Registry, not if-statements.** `registry.ts` declares every notification
  type once: category, priority, requirement, recipient type, channels,
  template family, default, cooldown, condition.
- **Workflows.** Each file in `workflows/` maps events to planned jobs for one
  area (onboarding, payments, payouts, sales, security, customer, domains,
  subscriptions) and says which jobs an event cancels.
- **Conditions at send time.** A delayed reminder names a condition
  (`conditions.ts`). The worker runs it against the database immediately
  before sending; if it is no longer true the job is `skipped` with
  `CONDITION_NO_LONGER_TRUE`. Completing the task also cancels the pending
  jobs of that workflow.

## Tables (run-now part 40)

- `notification_events`: outbox. `event_key` unique. `processed_at`,
  `attempts`, `claimed_until`, `last_error`.
- `notification_jobs`: `idempotency_key` unique (recipient + type + entity +
  step). `state` pending | processing | sent | skipped | cancelled | failed,
  `skip_reason`, `run_at`, `expires_at`, `attempts`, `max_attempts`,
  `claimed_until`, `workflow`, `step`, `data`, `event_id`, `correlation_id`.
- `notification_deliveries`: one per job and channel. provider,
  provider_message_id, status, attempt_count, sent/delivered/failed/opened/
  clicked timestamps, failure_reason.
- `notification_preferences`: user_id + category + channel, enabled,
  updated_at, source. A missing row means the registry default.
- `email_suppressions`: email + scope (`all` for a hard bounce, `optional` for
  a complaint or an unsubscribe), reason, source, timestamps.
- `mailgun_webhook_events`: the event id of every webhook handled, so a retry
  is a no-op.
- In app: the existing `seller_notifications` table (the bell already reads
  it), with `expires_at` added and the engine's rows keyed by `dedupe_key`.

## Volume

Required service email (security, payments, receipts) always goes. Optional
email is limited: at most 3 optional emails a person a day, at most one
lifecycle nudge a day, and a cooldown per type. Sales email can be turned off
or left to the in-app bell; a digest can come later on the same preference.

## Mailgun

`providers/mailgun.ts` implements `EmailProvider` over `lib/mailgun.ts`
(`sendMailgunOnce`, so a timeout is never re-sent blindly). Region is
`MAILGUN_BASE_URL` (EU by default, `https://api.mailgun.net` for US).
Sender is `MAILGUN_FROM_NAME <MAILGUN_FROM_EMAIL>`, falling back to
`EMAIL_FROM`. Webhook signatures use `MAILGUN_WEBHOOK_SIGNING_KEY`, a 5 minute
timestamp window and the token recorded once.

DNS for the sending domain is set at the domain's registrar, not in this
repository: Mailgun's SPF (TXT `v=spf1 include:mailgun.org ~all`, or
`include:eu.mailgun.org` for EU), the two DKIM TXT records Mailgun shows for
the domain, the tracking CNAME (`email.<domain>` to `eu.mailgun.org` or
`mailgun.org`), MX records if Mailgun receives, and a DMARC TXT at
`_dmarc.<domain>` (start with `v=DMARC1; p=none; rua=mailto:...`).
