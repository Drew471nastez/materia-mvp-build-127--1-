import { tt } from "@/lib/i18n/text"
/**
 * ===========================================================================
 *  SUPPORT REQUESTS: WHAT ONE IS, IN WORDS BOTH SIDES SHARE
 * ===========================================================================
 * A store asks Storelib for help from /app/support; Storelib answers from
 * /admin/resolution (SQL part 114). This file is the vocabulary and the
 * checks on what a store sends, and touches no database, so the pages and
 * the routes read the same words.
 *
 *   status   open      Storelib's turn
 *            waiting   the store's turn (Storelib replied)
 *            resolved  done; a new message from the store opens it again
 */
export const TOPICS = ["orders", "payments", "disputes", "payouts", "shipping", "account", "website", "bug", "other"] as const
export type Topic = (typeof TOPICS)[number]
export const TOPIC_LABELS: Record<Topic, string> = {
  get orders() { return tt("An order") },
  get payments() { return tt("Payments") },
  get disputes() { return tt("A dispute or chargeback") },
  get payouts() { return tt("Payouts") },
  get shipping() { return tt("Shipping") },
  get account() { return tt("My account") },
  get website() { return tt("My website") },
  get bug() { return tt("Something isn't working") },
  get other() { return tt("Something else") },
}

export const STATUSES = ["open", "waiting", "resolved"] as const
export type TicketStatus = (typeof STATUSES)[number]
/** As the store reads it. */
export const STATUS_FOR_STORE: Record<TicketStatus, string> = { get open() { return tt("With Storelib") }, get waiting() { return tt("Your reply") }, get resolved() { return tt("Resolved") } }
/** As Storelib reads it. */
export const STATUS_FOR_ADMIN: Record<TicketStatus, string> = { get open() { return tt("Needs a reply") }, get waiting() { return tt("Waiting on the store") }, get resolved() { return tt("Resolved") } }

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const
export type Priority = (typeof PRIORITIES)[number]

export const MAX_OPEN = 10
export const MAX_BODY = 5000

export interface TicketSummary {
  id: string
  topic: Topic
  subject: string
  status: TicketStatus
  priority: Priority
  orderRef: string | null
  createdAt: string
  lastMessageAt: string
  unread: boolean
}

export interface TicketMessage {
  id: number
  author: "creator" | "storelib"
  internal: boolean
  body: string
  createdAt: string
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "")

/** A new request as the store sent it, or what is missing. */
export function readNewTicket(body: Record<string, unknown> | null): { ok: true; topic: Topic; subject: string; message: string; orderRef: string | null } | { ok: false; error: string } {
  if (!body) return { ok: false, error: tt("Bad request.") }
  const topic = TOPICS.includes(body.topic as Topic) ? (body.topic as Topic) : "other"
  const subject = text(body.subject, 150)
  const message = text(body.message, MAX_BODY)
  const orderRef = text(body.orderRef, 60).replace(/^#/, "") || null
  if (!subject) return { ok: false, error: tt("Add a subject, a few words on what it's about.") }
  if (message.length < 10) return { ok: false, error: tt("Tell us a bit more, so we can help the first time.") }
  if (orderRef && !/^[A-Za-z0-9_-]{4,60}$/.test(orderRef)) return { ok: false, error: tt("That order number doesn't look right. It's the code after # on the order.") }
  return { ok: true, topic, subject, message, orderRef }
}

/** A reply's words, or null when there are none. */
export function readReply(v: unknown): string | null {
  const t = text(v, MAX_BODY)
  return t ? t : null
}

/** Whose turn it is after a message from one side. */
export function statusAfter(author: "creator" | "storelib", internal = false, current: TicketStatus = "open"): TicketStatus {
  if (internal) return current
  return author === "creator" ? "open" : "waiting"
}
