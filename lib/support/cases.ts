/**
 * ===========================================================================
 *  A BUYER'S CASE ABOUT AN ORDER, IN WORDS EVERY SIDE SHARES
 * ===========================================================================
 * The way a marketplace handles a problem with an order (SQL part 117):
 *
 *   1. The buyer opens a case from their order page or receipt: what's
 *      wrong, in their words. It goes to the store first, by email and in
 *      Support › From buyers, because the store is who can ship a missing
 *      parcel, send a replacement or refund.
 *   2. The store and the buyer write back and forth.
 *   3. Either of them can ask Storelib to step in. The case then waits on
 *      Storelib in /admin's Resolution center, and every message from
 *      Storelib goes to both.
 *   4. Anyone resolves it. A new message opens it again.
 *
 *   status   store      the store's turn
 *            buyer      the buyer's turn
 *            storelib   Storelib's turn (asked to step in)
 *            resolved   done
 *
 * No database here: the pages, the routes and the tests read these words.
 */

export const CASE_REASONS = ["not_arrived", "damaged", "wrong_item", "missing_item", "return", "refund", "access", "other"] as const
export type CaseReason = (typeof CASE_REASONS)[number]

export const CASE_REASON_LABELS: Record<CaseReason, string> = {
  not_arrived: "It hasn't arrived",
  damaged: "It arrived damaged",
  wrong_item: "I got the wrong item",
  missing_item: "Something is missing",
  return: "I want to return it",
  refund: "I want a refund",
  access: "I can't open what I bought",
  other: "Something else",
}

/** Which reasons fit which order: a download can't arrive damaged, a parcel has nothing to open. */
export function reasonsFor(kind: "physical" | "digital"): CaseReason[] {
  return kind === "physical" ? ["not_arrived", "damaged", "wrong_item", "missing_item", "return", "refund", "other"] : ["access", "refund", "other"]
}

export const CASE_STATUSES = ["store", "buyer", "storelib", "resolved"] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export type CaseAuthor = "buyer" | "store" | "storelib"

/** As each side reads whose turn it is. */
export const STATUS_FOR_BUYER: Record<CaseStatus, string> = { store: "With the store", buyer: "Your reply", storelib: "With Storelib", resolved: "Resolved" }
export const STATUS_FOR_STORE: Record<CaseStatus, string> = { store: "Your reply", buyer: "Waiting on the buyer", storelib: "With Storelib", resolved: "Resolved" }
export const STATUS_FOR_ADMIN: Record<CaseStatus, string> = { store: "With the store", buyer: "With the buyer", storelib: "Needs a reply", resolved: "Resolved" }

export const MAX_CASE_BODY = 5000

export interface CaseSummary {
  id: string
  reason: CaseReason
  status: CaseStatus
  escalated: boolean
  escalatedBy: "buyer" | "store" | null
  orderRef: string | null
  kind: "physical" | "digital"
  buyerEmail: string
  buyerName: string | null
  createdAt: string
  lastMessageAt: string
  unread: boolean
}

export interface CaseMessage {
  id: number
  author: CaseAuthor
  internal: boolean
  body: string
  createdAt: string
}

/**
 * Whose turn it is after a message. Once Storelib is in, a message from the
 * buyer or the store puts it back with Storelib; Storelib's own reply puts it
 * with whoever it was written for (the buyer, unless it says otherwise). An
 * internal note changes nothing.
 */
export function statusAfterMessage(author: CaseAuthor, c: { status: CaseStatus; escalated: boolean }, opts: { internal?: boolean; to?: "buyer" | "store" } = {}): CaseStatus {
  if (opts.internal) return c.status
  if (author === "storelib") return opts.to === "store" ? "store" : "buyer"
  if (c.escalated) return "storelib"
  return author === "buyer" ? "store" : "buyer"
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "")

/** A case as a buyer opens it, or what is missing. */
export function readNewCase(body: Record<string, unknown> | null, kind: "physical" | "digital"): { ok: true; reason: CaseReason; message: string } | { ok: false; error: string } {
  if (!body) return { ok: false, error: "Bad request." }
  const allowed = reasonsFor(kind)
  const reason = allowed.includes(body.reason as CaseReason) ? (body.reason as CaseReason) : null
  if (!reason) return { ok: false, error: "Choose what's wrong." }
  const message = text(body.message, MAX_CASE_BODY)
  if (message.length < 10) return { ok: false, error: "Tell the store a bit more, so they can help the first time." }
  return { ok: true, reason, message }
}

/** A reply's words, or null when there are none. */
export function readCaseReply(v: unknown): string | null {
  const t = text(v, MAX_CASE_BODY)
  return t ? t : null
}

/** The buyer's private link to their case: the secret is never stored, only its hash. */
export const caseLink = (origin: string, id: string, secret: string) => `${origin.replace(/\/$/, "")}/order-help/${id}?k=${encodeURIComponent(secret)}`
