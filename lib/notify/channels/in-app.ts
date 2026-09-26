/**
 * ===========================================================================
 *  ONE NOTIFICATION IN THE BELL
 * ===========================================================================
 * The bell already reads seller_notifications (app/api/notifications,
 * components/app/notifications-modal.tsx), so the engine writes its rows
 * there, in the shape the panel already understands:
 *
 *   type         one of the values the table's check has always allowed
 *                (new_sale, payout, critical, problem, next_step, milestone,
 *                update), so no constraint had to change
 *   category     the panel's ranking group (critical first, then problems,
 *                then next steps)
 *   kind         the notification type, WELCOME_TO_STORELIB and so on
 *   dedupe_key   the job's idempotency key: one row however often it is
 *                written (unique on creator_id, dedupe_key)
 *   priority     95 critical, 75 important, 50 normal, 25 info
 *   action_url   a path inside /app from the template, never a full URL
 *   expires_at   lifecycle nudges after a week, info after two weeks,
 *                normal after sixty days; important and critical stay until
 *                read
 *
 * lib/notifications/engine.ts knows these kinds (KNOWN_KINDS), so its hourly
 * run leaves these rows alone instead of retiring them as a removed rule's.
 */
import type { InAppContent, NotificationType, RegistryEntry, TemplateContext } from "../types"
import { PRIORITY_NUMBER, type InAppRecord, type JobRow, type NotifyStore } from "../store"

export type RenderInApp = (type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext) => InAppContent

export interface InAppChannelOptions {
  render: RenderInApp
  baseUrl: () => string
  now?: () => number
}

export type InAppWrite = (input: { job: JobRow; entry: RegistryEntry; recipientName: string | null }) => Promise<"inserted" | "duplicate" | "unavailable">

const DAY_MS = 86_400_000

const AREA: Record<string, string> = {
  sales: "Sales",
  payouts_and_payments: "Payouts",
  product_and_store: "Store",
  account: "Account",
  security: "Security",
  lifecycle: "Getting started",
  tips: "Tips",
  marketing: "Updates",
}

/** Where a row sits in the bell, from its registry entry. */
export function bellOf(entry: RegistryEntry): { type: string; category: string; area: string } {
  const area = AREA[entry.category] ?? "Updates"
  if (entry.priority === "critical") return { type: "critical", category: "critical", area }
  if (entry.category === "lifecycle" || entry.type === "WELCOME_TO_STORELIB") return { type: "next_step", category: "next_step", area: "Getting started" }
  if (entry.template === "success") return { type: "milestone", category: "milestone", area }
  if (entry.priority === "important" && entry.template === "action_required") return { type: "problem", category: "problem", area }
  if (entry.category === "sales") return { type: "new_sale", category: "update", area }
  if (entry.category === "payouts_and_payments") return { type: "payout", category: "update", area }
  return { type: "update", category: "update", area }
}

export function inAppExpiry(entry: RegistryEntry, now: number): string | null {
  if (entry.priority === "critical" || entry.priority === "important") return null
  const days = entry.category === "lifecycle" ? 7 : entry.priority === "info" ? 14 : 60
  return new Date(now + days * DAY_MS).toISOString()
}

const pathOnly = (u: string | null | undefined) => (typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u : null)

export function inAppChannel(store: NotifyStore, o: InAppChannelOptions): InAppWrite {
  return async ({ job, entry, recipientName }) => {
    if (!job.creator_id || !job.recipient_user_id) return "unavailable"
    const content = o.render(entry.type, job.data ?? {}, { baseUrl: o.baseUrl(), recipientName, unsubscribeUrl: null, preferencesUrl: null, when: null })
    const bell = bellOf(entry)
    const now = (o.now ?? Date.now)()
    const record: InAppRecord = {
      creatorId: job.creator_id,
      userId: job.recipient_user_id,
      type: entry.type,
      dedupeKey: job.idempotency_key,
      title: content.title,
      message: content.body,
      actionUrl: pathOnly(content.actionUrl),
      bellType: bell.type,
      bellCategory: bell.category,
      priority: PRIORITY_NUMBER[entry.priority],
      expiresAt: inAppExpiry(entry, now),
      area: bell.area,
      correlationId: job.correlation_id,
      productId: typeof job.data.productId === "string" && /^[0-9a-f-]{36}$/i.test(job.data.productId) ? job.data.productId : null,
      orderId: job.entity_type === "order" && job.entity_id && /^[0-9a-f-]{36}$/i.test(job.entity_id) ? job.entity_id : null,
    }
    return store.insertInApp(record)
  }
}
