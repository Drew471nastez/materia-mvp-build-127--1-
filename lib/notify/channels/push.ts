/**
 * ===========================================================================
 *  THE SELLER'S PHONE, FOR WHAT THE ENGINE TELLS THEM (r57)
 * ===========================================================================
 * The engine wrote a refund, a payout sent, a closed dispute, orders waiting
 * to ship or a changed bank account into the bell and the inbox, and nothing
 * reached the Storelib app: only sales (lib/orders/sale-events.ts), payouts
 * ready to cash out (lib/payments/payout-push.ts) and the hourly bell rules'
 * critical rows (lib/notifications/engine.ts) ever pushed. A seller who lives
 * in the app heard about a refund the next time they opened it.
 *
 * Now push is a channel of its own here, with its own delivery row (unique
 * per job and channel, written before the send), so a job retried for its
 * email, a webhook Stripe delivers twice or two workers on one job push
 * once. It follows the bell's switch for that category (Settings,
 * Notifications): somebody who turned a category off in the app hears
 * nothing on their phone either. Required notices (security, money) always
 * go, as they do by email.
 *
 * WHICH TYPES. Only those in PUSH_TYPES, all to the seller. Left out on
 * purpose:
 *
 *   NEW_SALE, FIRST_SALE      the sale's own push, once per purchase, with
 *                             the amount (lib/orders/sale-events.ts)
 *   DISPUTE_CREATED, PAYOUT_FAILED, PAYOUT_RESTRICTED,
 *   PAYMENT_VERIFICATION_REQUIRED, PAYMENT_SETUP_FAILED,
 *   PAYOUT_ACTION_REQUIRED, VERIFICATION_REMINDER(_2),
 *   SUBSCRIPTION_PAYMENT_FAILED
 *                             the bell rules push these as critical the
 *                             moment the webhook notes them (noteDispute,
 *                             notePayout, noteStripeAccount), so a second
 *                             push here would say it twice
 *   lifecycle and tips        nudges: the bell and email are enough
 *
 * WHAT IT SAYS. The bell's title and a fixed line, as every bell push does
 * (lib/notifications/push.ts pushPayloadOf): a lock screen is not the place
 * for a buyer's name or address. A tap opens the bell row's own page inside
 * /app (lib/push/tap.ts).
 */
import { pushPayloadOf, type NotificationPush } from "@/lib/notifications/push"
import type { InAppContent, NotificationType, RegistryEntry, TemplateContext } from "../types"
import type { JobRow } from "../store"

export const PUSH_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "REFUND_CREATED",
  "DISPUTE_ACTION_REQUIRED",
  "DISPUTE_CLOSED",
  "ORDERS_WAITING_TO_SHIP",
  "PAYOUT_SENT",
  "PAYOUT_METHOD_ADDED",
  "PAYOUT_METHOD_CHANGED",
  "PAYOUT_METHOD_PROBLEM",
  "PAYMENT_SETUP_COMPLETED",
  "PHYSICAL_STORE_NOT_READY",
  "FIRST_PRODUCT_PUBLISHED",
  "DOMAIN_CONNECTED",
  "DOMAIN_CONNECTION_FAILED",
  "ACCOUNT_RESTRICTED",
  "PASSWORD_CHANGED",
  "EMAIL_CHANGED",
])

/** Does this type go to the seller's phone as well. */
export function pushes(entry: RegistryEntry): boolean {
  return entry.recipient === "creator" && PUSH_TYPES.has(entry.type)
}

/** The stack it sits in on an iPhone, from the area the bell files it under. */
const THREAD: Record<string, string> = {
  sales: "sales",
  payouts_and_payments: "payouts",
  security: "security",
  product_and_store: "store",
  account: "account",
}

export interface PushSendResult {
  devices: number
  sent: number
}

export type PushWrite = (input: { job: JobRow; entry: RegistryEntry; recipientName: string | null }) => Promise<"sent" | "no_device" | "failed">

export interface PushChannelOptions {
  render: (type: NotificationType, data: Record<string, unknown>, ctx: TemplateContext) => InAppContent
  baseUrl: () => string
  send: (userId: string, push: NotificationPush & { collapseKey: string; threadId: string }) => Promise<PushSendResult>
}

/** What one engine push says and where it opens. Pure. */
export function enginePush(entry: RegistryEntry, content: InAppContent, job: Pick<JobRow, "idempotency_key">): NotificationPush & { collapseKey: string; threadId: string } {
  const p = pushPayloadOf({
    kind: entry.type.toLowerCase(),
    category: entry.priority === "critical" ? "critical" : "update",
    title: content.title,
    pushTitle: null,
    href: content.actionUrl ?? "/app",
  })
  return { ...p, collapseKey: `n:${job.idempotency_key}`.slice(0, 64), threadId: THREAD[entry.category] ?? "storelib" }
}

export function pushChannel(o: PushChannelOptions): PushWrite {
  return async ({ job, entry, recipientName }) => {
    if (!job.recipient_user_id) return "no_device"
    const content = o.render(entry.type, job.data ?? {}, { baseUrl: o.baseUrl(), recipientName, unsubscribeUrl: null, preferencesUrl: null, when: null })
    const r = await o.send(job.recipient_user_id, enginePush(entry, content, job))
    if (r.devices === 0) return "no_device"
    return r.sent > 0 ? "sent" : "failed"
  }
}
