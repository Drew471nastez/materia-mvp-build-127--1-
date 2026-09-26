# Module contracts (who owns what)

Four parts, built side by side. Each part imports the others by these
signatures only. `types.ts` is shared and fixed; ask before changing it.

## Core (engine, SQL, worker, webhook)

- `supabase/sql/run-now/40_notification_engine.sql` (+ mirror in
  `supabase/migrations/20261006_notification_engine.sql`, README row,
  `99_check_after.sql` column `p40_notification_engine`,
  `python3 scripts/build-run-four.py`).
- `registry.ts`: `export const REGISTRY: Record<NotificationType, RegistryEntry>`,
  `export function entryFor(type: NotificationType): RegistryEntry`.
- `outbox.ts`:
  `export async function emit(event: EmitInput, opts?: { db?: AdminDb; soon?: boolean }): Promise<{ ok: boolean; eventId?: string }>`
  where `EmitInput = Omit<DomainEvent, "occurredAt" | "id"> & { occurredAt?: string }`.
  Never throws: an outage of the notification system never breaks the caller.
  `soon` (default true) schedules `processSoon()` in `after()`.
- `orchestrator.ts`: `handle(event, ctx) -> { jobs: PlannedJob[]; cancel: {workflow, recipientUserId, reason}[] }`, pure given ctx.
- `workflows/*.ts`, `conditions.ts`, `worker.ts` (`runNotificationWork(budgetMs)`),
  `store.ts` (the Supabase side, behind an interface so tests use memory).
- `preferences.ts`:
  `getPreferences(db, userId): Promise<{category, channel, enabled, updatedAt}[]>`,
  `setPreference(db, userId, category, channel, enabled, source: "settings" | "unsubscribe_link" | "mailgun" | "admin"): Promise<void>`,
  `allowed(db, userId, entry: RegistryEntry, channel): Promise<boolean>` (required_service is always true).
- `suppressions.ts`: `suppress(db, email, scope: "all" | "optional", reason, source)`, `isSuppressed(db, email, requirement): Promise<boolean>`.
- `providers/mailgun.ts`: `MailgunEmailProvider implements EmailProvider`; `emailProvider()` factory.
- `channels/email.ts`, `channels/in-app.ts`.
- `tracking.ts`: `recordProviderEvent(db, ev)` used by the Mailgun webhook.
- `urls.ts`: `baseUrl()` (canonical, one helper), `appUrl(path)`.
- `log.ts`: `notifyLog(level, msg, fields)` structured JSON, masks emails, never logs tokens or keys.
- Cron `app/api/cron/notify/route.ts` every 5 minutes in `vercel.json`, and the worker also run from the existing hourly crons.
- Mailgun webhook `app/api/webhooks/mailgun/route.ts`: timestamp window, token dedupe, `recordProviderEvent`, suppressions, keep existing campaign/subscriber handling.

## Templates

- `templates/index.ts`:
  `renderEmail(type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext): RenderedEmail`,
  `renderInApp(type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext): InAppContent`.
- `templates/layout.ts` families; `templates/catalog.ts` one entry per type.
- The `data` keys each type reads are listed in `templates/catalog.ts` as
  `export const DATA_KEYS: Record<NotificationType, readonly string[]>`; workflows fill them.

## Integration

- Calls `emit()` from the places events happen (webhook, routes, onboarding,
  domains, billing, admin moderation, refunds, cashout, auth routes).
- Removes or gates the old direct creator emails that the engine now sends,
  so nothing is sent twice. Fixes the bugs the audit found.

## UI

- Settings panel for preferences (`/api/notifications/preferences` GET/PUT using `preferences.ts`).
- `unsubscribe.ts`: `signUnsubscribe(userId, category)`, `verifyUnsubscribe(token) -> {userId, category} | null`,
  `unsubscribeUrl(userId, category): string` (HMAC with `NOTIFY_UNSUBSCRIBE_SECRET`, falling back to `EMAIL_LINK_SECRET`),
  route `app/api/notify/unsubscribe` (GET page + POST one click) and page.
- Notification center: pagination, priority, mark one/all read, expiry, action URL.
- Admin: deliveries trace and analytics.
