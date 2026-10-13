import { tt } from "@/lib/i18n/text"
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

export const CASE_REASONS = ["question", "change_address", "cancel", "not_arrived", "damaged", "wrong_item", "missing_item", "return", "refund", "access", "other"] as const
export type CaseReason = (typeof CASE_REASONS)[number]

export const CASE_REASON_LABELS: Record<CaseReason, string> = {
  get question() { return tt("A question") },
  get change_address() { return tt("Change the address") },
  get cancel() { return tt("Cancel the order") },
  get not_arrived() { return tt("It hasn't arrived") },
  get damaged() { return tt("It arrived damaged") },
  get wrong_item() { return tt("I got the wrong item") },
  get missing_item() { return tt("Something is missing") },
  get return() { return tt("I want to return it") },
  get refund() { return tt("I want a refund") },
  get access() { return tt("I can't open what I bought") },
  get other() { return tt("Something else") },
}

/**
 * The topics a buyer picks from, in the order the form shows them, for the
 * kind of order: a download can't arrive damaged or move address, a parcel
 * has nothing to open.
 */
export function reasonsFor(kind: "physical" | "digital"): CaseReason[] {
  return kind === "physical" ? ["question", "change_address", "cancel", "not_arrived", "damaged", "missing_item", "wrong_item", "return", "refund", "other"] : ["question", "access", "refund", "other"]
}

/**
 * The topics added in SQL part 164. A database without it refuses them, so
 * the server files such a case under "other" and says the topic in its
 * first line rather than losing the message (cases-server openCase).
 */
export const REASONS_SINCE_164: ReadonlySet<CaseReason> = new Set(["question", "change_address", "cancel"])

/* ─────────────────────────── asking Storelib in ─────────────────────────── */

/**
 * ASK STORELIB FOR HELP, AS A BUYER. A buyer's problem is the store's to
 * solve first. When the problem is about money or goods (nothing arrived, it
 * came damaged, something is missing or wrong, a refund, a download that
 * won't open) and the store has not answered the buyer for three days,
 * the buyer can ask Storelib to step in. Questions, address changes,
 * cancellations and returns stay between the buyer and the store (cancel
 * and return have their own buttons on the order page). The store can ask
 * Storelib in at any time.
 */
export const ESCALATE_AFTER_DAYS = 3
export const ESCALATABLE: ReadonlySet<CaseReason> = new Set(["not_arrived", "damaged", "missing_item", "wrong_item", "refund", "access"])

/**
 * When the buyer may ask Storelib in: `from` is the moment it opens (three
 * days after the first message the store has not answered), null when it
 * never can for this case as it is (another topic, already in, resolved, or
 * the store answered last).
 */
export function buyerEscalation(
  c: { reason: CaseReason; status: CaseStatus; escalated: boolean },
  messages: { author: CaseAuthor; internal?: boolean; createdAt: string }[],
  now: number = Date.now(),
): { can: boolean; from: string | null } {
  if (c.escalated || c.status === "resolved" || !ESCALATABLE.has(c.reason)) return { can: false, from: null }
  let waiting: number | null = null
  for (const m of messages) {
    if (m.internal) continue
    if (m.author === "buyer") waiting ??= Date.parse(m.createdAt)
    else if (m.author === "store") waiting = null
  }
  if (waiting === null || !Number.isFinite(waiting)) return { can: false, from: null }
  const from = waiting + ESCALATE_AFTER_DAYS * 86_400_000
  return { can: now >= from, from: new Date(from).toISOString() }
}

export const CASE_STATUSES = ["store", "buyer", "storelib", "resolved"] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export type CaseAuthor = "buyer" | "store" | "storelib"

/** As each side reads whose turn it is. */
export const STATUS_FOR_BUYER: Record<CaseStatus, string> = { get store() { return tt("With the store") }, get buyer() { return tt("Your reply") }, get storelib() { return tt("With Storelib") }, get resolved() { return tt("Resolved") } }
export const STATUS_FOR_STORE: Record<CaseStatus, string> = { get store() { return tt("Your reply") }, get buyer() { return tt("Waiting on the buyer") }, get storelib() { return tt("With Storelib") }, get resolved() { return tt("Resolved") } }
export const STATUS_FOR_ADMIN: Record<CaseStatus, string> = { get store() { return tt("With the store") }, get buyer() { return tt("With the buyer") }, get storelib() { return tt("Needs a reply") }, get resolved() { return tt("Resolved") } }

export const MAX_CASE_BODY = 5000

export interface CaseSummary {
  id: string
  reason: CaseReason
  status: CaseStatus
  escalated: boolean
  escalatedBy: "buyer" | "store" | null
  /** The buyer's reference (#85737C57 without the #): what the buyer's pages and emails say. */
  orderRef: string | null
  /** The Orders page's number ("#1003"), on what the store reads (lib/orders/order-number-server.ts). */
  sellerNumber?: string | null
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
  /** Photos sent with it (SQL part 164): a short lived signed address each, made for this read. */
  photos?: { url: string; name: string }[]
}

/* ─────────────────────────── photos with a message ──────────────────────── */

/** Up to four photos a message, each up to 8 MB, pictures only (checked again on the server: lib/support/case-photos-server.ts). */
export const MAX_CASE_PHOTOS = 4
export const MAX_CASE_PHOTO_BYTES = 8 * 1024 * 1024
export const CASE_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const

/** A stored photo as the message row keeps it: never a public address. */
export interface CasePhotoRef {
  path: string
  type: string
  size: number
  name: string
}

/* ───────────────────────────── spam ─────────────────────────────────────── */

/**
 * What makes a message look like spam rather than a buyer: the hidden field
 * a person never sees filled in, or a wall of links. A refusal reads the
 * same as any other, so a script learns nothing from it.
 */
export function spamReason(message: string, trap: unknown): string | null {
  if (typeof trap === "string" && trap.trim()) return "trap"
  const links = message.match(/https?:\/\/|www\./gi)?.length ?? 0
  if (links > 3) return "links"
  return null
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
  if (!body) return { ok: false, error: tt("Bad request.") }
  const allowed = reasonsFor(kind)
  const reason = allowed.includes(body.reason as CaseReason) ? (body.reason as CaseReason) : null
  if (!reason) return { ok: false, error: tt("Choose what it's about.") }
  const message = text(body.message, MAX_CASE_BODY)
  if (message.length < 10) return { ok: false, error: tt("Tell the store a bit more, so they can help the first time.") }
  if (spamReason(message, body.website)) return { ok: false, error: tt("That message could not be sent. Write it without links and try again.") }
  return { ok: true, reason, message }
}

/** A reply's words, or null when there are none. */
export function readCaseReply(v: unknown): string | null {
  const t = text(v, MAX_CASE_BODY)
  return t ? t : null
}

/** The buyer's private link to their case: the secret is never stored, only its hash. */
export const caseLink = (origin: string, id: string, secret: string) => `${origin.replace(/\/$/, "")}/order-help/${id}?k=${encodeURIComponent(secret)}`
