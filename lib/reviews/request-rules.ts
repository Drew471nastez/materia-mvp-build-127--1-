/**
 * ===========================================================================
 *  WHEN STORELIB ASKS A BUYER FOR A REVIEW
 * ===========================================================================
 * Two emails at most for an order, from the notification engine
 * (lib/notify/workflows/customer.ts plans them on order.created, the worker
 * sends them): REVIEW_REQUEST seven days after the purchase and
 * REVIEW_REMINDER seven days after that. Each is decided again, from fresh
 * rows, the moment it would send (lib/notify/conditions.ts
 * review_still_wanted), by reviewRequestBlock below. Any "no" skips it for
 * good; the idempotency key (type, address, order, step) means neither can
 * ever be planned twice.
 *
 * ALL of these must hold:
 *
 *   NOT THE APP'S      the store does not have Storelib Reviews on. With it
 *                      on, the store's own settings decide when and whether
 *                      to ask, for every order it sells
 *                      (lib/reviews/request-schedule.ts), and these two
 *                      stand aside so nobody is asked twice.
 *   SOLD ON STORELIB   orders.source is "storelib" and the page Buy was
 *                      pressed on (source_detail.surface) was not a website
 *                      the creator built, nor a test sale from the admin.
 *                      Explore, a product page, the creator's page, their
 *                      OnePage and a checkout link all count. An order whose
 *                      source was never recorded is not asked: the rule is
 *                      "only when we know it was Storelib".
 *   STILL THEIRS       paid, or a free claim, and the buyer still has it: a
 *                      full refund, a failed payment or a dispute stops it
 *                      (lib/receipts/rules accessStateOf, the rule downloads
 *                      use). A partial refund leaves the sale standing.
 *   TIME TO USE IT     seven days after the purchase for the first, fourteen
 *                      for the reminder, counted from the order.
 *   NOT REVIEWED       no review on this order, and none by this buyer (their
 *                      account, or any order of theirs by this email) of the
 *                      product. Checked again before the reminder.
 *   NOT THE SELLER     a creator's own free copy of their product is never
 *                      asked about.
 *   STILL ON SALE      the product exists and is not deleted.
 *   MAY BE EMAILED     the address has not turned review requests off (its
 *                      own suppression scope, "review_requests"). The worker
 *                      then checks the rest of the suppression list as it
 *                      does for every optional email: a hard bounce ("all")
 *                      or a complaint or general unsubscribe ("optional")
 *                      stops it there.
 *
 * WHETHER THEY ENJOYED IT is not something a platform can know, so the email
 * asks and nothing guesses. A download is not required either: a course or
 * a link has no download, and a library download is logged against the
 * entitlement rather than the order, so "no download seen" would be wrong
 * for exactly the buyers who used it most.
 *
 * Free claims are asked too: a rating on a free product is read on Explore
 * the same as any other, and it is the same two emails at most.
 */
import { accessStateOf } from "../receipts/rules"

/** Days after the purchase that the first request goes. */
export const REVIEW_REQUEST_DAYS = 7
/** Days after the purchase that the one reminder goes. */
export const REVIEW_REMINDER_DAYS = 14
/** How long each email may wait for a late worker before it is not worth sending. */
export const REVIEW_EMAIL_WINDOW_DAYS = 7

export const DAY_MS = 86_400_000

export type ReviewEmailStep = "request" | "reminder"

export function daysFor(step: ReviewEmailStep): number {
  return step === "request" ? REVIEW_REQUEST_DAYS : REVIEW_REMINDER_DAYS
}

/** When the step is due, from the moment of purchase. */
export function dueAt(purchasedAt: string | number | Date, step: ReviewEmailStep): number {
  return new Date(purchasedAt).getTime() + daysFor(step) * DAY_MS
}

export interface ReviewRequestOrder {
  id: string
  status?: string | null
  amount_cents?: number | null
  refund_amount_cents?: number | null
  source?: string | null
  source_detail?: unknown
  created_at?: string | null
  buyer_id?: string | null
  buyer_email?: string | null
  receipt_token?: string | null
  product_id?: string | null
}

export interface ReviewRequestFacts {
  order: ReviewRequestOrder | null
  product: { id: string; title?: string | null; status?: string | null; creator_id?: string | null } | null
  /** The Storelib user who sells the product. */
  sellerUserId: string | null
  /** A review exists for this order, or by this buyer (account or email) for this product. */
  reviewed: boolean
  /** The address's live suppression scopes (email_suppressions). */
  suppressed: readonly string[]
  /** The store has Storelib Reviews on, which asks on its own schedule (lib/reviews/request-schedule.ts). */
  appHandles?: boolean
}

export type ReviewRequestBlock =
  | "no_order"
  | "source_unknown"
  | "website"
  | "test_sale"
  | "not_open"
  | "no_product"
  | "own_product"
  | "reviewed"
  | "unsubscribed"
  | "too_early"
  | "no_receipt"
  | "app_handles"

function surfaceOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null
  const s = (detail as Record<string, unknown>).surface
  return typeof s === "string" ? s : null
}

/** The source rule on its own: Storelib yes, a website built with the builder no, unknown no. */
export function soldOnStorelib(order: Pick<ReviewRequestOrder, "source" | "source_detail">): ReviewRequestBlock | null {
  if (order.source === "website") return "website"
  if (order.source !== "storelib") return "source_unknown"
  const surface = surfaceOf(order.source_detail)
  if (surface === "website") return "website"
  if (surface === "admin") return "test_sale"
  return null
}

/** Null when the email may go now; otherwise the first reason it may not. */
export function reviewRequestBlock(facts: ReviewRequestFacts, step: ReviewEmailStep, now: number): ReviewRequestBlock | null {
  const order = facts.order
  if (!order) return "no_order"
  const source = soldOnStorelib(order)
  if (source) return source
  if (facts.appHandles) return "app_handles"
  if (accessStateOf(order) !== "open") return "not_open"
  if (!facts.product || facts.product.status === "deleted") return "no_product"
  if (order.buyer_id && facts.sellerUserId && order.buyer_id === facts.sellerUserId) return "own_product"
  if (facts.reviewed) return "reviewed"
  if (facts.suppressed.includes("review_requests")) return "unsubscribed"
  /* An hour's grace for clocks; the job's run_at is the real schedule. */
  if (order.created_at && now < dueAt(order.created_at, step) - 3_600_000) return "too_early"
  if (!order.receipt_token) return "no_receipt"
  return null
}
