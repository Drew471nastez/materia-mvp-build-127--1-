/**
 * ===========================================================================
 *  STORELIB REVIEWS: THE REQUEST EMAIL'S OWN WORDS, AND WHAT A STORE CAN DO
 *  WITH ONE REQUEST
 * ===========================================================================
 * Reviews › Requests lets a store write the request email itself: the
 * subject, the heading, the words, the button, the reminder's subject and
 * words, the name the inbox shows, and whether the product's picture is in
 * it. Anything left empty is Storelib's own default (lib/notify/templates
 * reviewAsk). Three words fill themselves in: {first_name}, {product} and
 * {store}. The email is still the notification engine's, so its layout, the
 * stars to tap, the unsubscribe line and the suppression rules are the same
 * whatever the store writes.
 *
 * A REQUEST ROW (review_requests, one per order line) can be:
 *
 *   sent now          while it waits for its day (scheduled)
 *   sent again        after it went, at most once a day (RESEND_GAP_MS),
 *                     always the first email, never a second reminder
 *   cancelled         while it waits, or before its one reminder; kept as
 *                     skipped with the reason "cancelled", so the hourly run
 *                     never picks it up again
 *   tried again       after a send failed
 *
 * And the hourly run never asks one address twice about one product: a
 * second order of the same product by the same address is skipped as a
 * duplicate (dedupeAsks).
 *
 * Pure: no database.
 */
import type { ReviewsAppSettings } from "./app-settings"

export const COPY_TOKENS = ["{first_name}", "{product}", "{store}"] as const

export interface CopyVars {
  firstName?: string | null
  product?: string | null
  store?: string | null
}

/** A store's text with its three words filled in. An empty first name leaves no stray space or comma behind. */
export function fillCopy(text: string, vars: CopyVars): string {
  return text
    .replace(/\{first_name\}/g, (vars.firstName ?? "").trim())
    .replace(/\{product\}/g, (vars.product ?? "").trim())
    .replace(/\{store\}/g, (vars.store ?? "").trim())
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/(^|\n)[,.]\s*/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export interface EmailCopy {
  subject: string | null
  heading: string | null
  paragraphs: string[] | null
  button: string | null
  fromName: string | null
  showProduct: boolean
}

/** What the template is handed for the first email or the reminder: the store's words filled in, null where Storelib's default stands. */
export function emailCopyFor(settings: Pick<ReviewsAppSettings, "email">, vars: CopyVars, reminder: boolean): EmailCopy {
  const e = settings.email
  const fill = (t: string) => (t.trim() ? fillCopy(t, vars) || null : null)
  const body = reminder ? e.reminderBody : e.body
  const paragraphs = body.trim()
    ? fillCopy(body, vars)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
    : []
  return {
    subject: fill(reminder ? e.reminderSubject : e.subject),
    /* The reminder keeps the store's heading: it is the same ask. */
    heading: fill(e.heading),
    paragraphs: paragraphs.length ? paragraphs : null,
    button: fill(e.button),
    fromName: fill(e.fromName),
    showProduct: e.showProduct,
  }
}

/* ── One request ─────────────────────────────────────────────────────── */

export const RESEND_GAP_MS = 86_400_000

export type RequestState = "scheduled" | "sent" | "reminded" | "reviewed" | "cancelled" | "skipped" | "failed"
export type RequestAction = "send_now" | "resend" | "cancel" | "retry"

export interface RequestRowLike {
  status: string
  skip_reason?: string | null
  sent_at?: string | null
  reminded_at?: string | null
  last_sent_at?: string | null
}

/** The row's state as the store reads it: a skipped row the store cancelled says so. */
export function requestState(row: RequestRowLike): RequestState {
  if (row.status === "skipped" && row.skip_reason === "cancelled") return "cancelled"
  const known: RequestState[] = ["scheduled", "sent", "reminded", "reviewed", "skipped", "failed"]
  return (known as string[]).includes(row.status) ? (row.status as RequestState) : "skipped"
}

/** When an email about this row last went, in ms, or 0. */
export function lastSentAt(row: RequestRowLike): number {
  return Math.max(0, ...[row.last_sent_at, row.reminded_at, row.sent_at].map((t) => (t ? Date.parse(t) || 0 : 0)))
}

/** What the store can do with the row now. */
export function requestActions(row: RequestRowLike, now = Date.now()): RequestAction[] {
  const state = requestState(row)
  const rested = now - lastSentAt(row) >= RESEND_GAP_MS
  switch (state) {
    case "scheduled":
      return ["send_now", "cancel"]
    case "sent":
      return [...(rested ? (["resend"] as const) : []), "cancel"]
    case "reminded":
      return rested ? ["resend"] : []
    case "failed":
      return ["retry"]
    default:
      return []
  }
}

/** Why an action cannot run now, in the store's words, or null when it can. */
export function requestActionBlock(row: RequestRowLike, action: RequestAction, now = Date.now()): string | null {
  if (requestActions(row, now).includes(action)) return null
  const state = requestState(row)
  if ((action === "resend" || action === "send_now") && (state === "sent" || state === "reminded")) return "It was sent less than a day ago. Try again tomorrow."
  if (state === "reviewed") return "They already wrote a review."
  if (state === "cancelled") return "This request was cancelled."
  return "That can't be done with this request now."
}

/**
 * Orders the hourly run may plan, one ask an address and product: an order
 * whose address was already asked about the product (a row the store has),
 * or whose address and product an earlier order in the same list has, is a
 * duplicate. Addresses are compared in lower case.
 */
export function dedupeAsks<T extends { id: string; product_id?: string | null; buyer_email?: string | null }>(orders: readonly T[], asked: readonly { email?: string | null; product_id?: string | null }[]): { fresh: T[]; duplicates: T[] } {
  const pair = (email: unknown, product: unknown) => `${String(email ?? "").trim().toLowerCase()}\n${String(product ?? "")}`
  const taken = new Set(asked.map((a) => pair(a.email, a.product_id)))
  const fresh: T[] = []
  const duplicates: T[] = []
  /* Oldest first, so the first purchase is the one asked. */
  for (const o of [...orders].reverse()) {
    const k = pair(o.buyer_email, o.product_id)
    if (taken.has(k)) duplicates.push(o)
    else {
      taken.add(k)
      fresh.push(o)
    }
  }
  return { fresh: fresh.reverse(), duplicates }
}
