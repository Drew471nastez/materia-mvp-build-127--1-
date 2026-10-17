/**
 * ===========================================================================
 *  A BUYER ASKS TO CANCEL AN ORDER THAT HASN'T SHIPPED
 * ===========================================================================
 * The buyer's order page (app/checkout/physical/order/[token]) has Cancel
 * order while the order is Unfulfilled: paid, nothing refunded, nothing sent,
 * and the seller hasn't marked it in progress. Once the seller has started on
 * it, it is theirs to decide, and the buyer replies to their order email
 * instead.
 *
 * Pressing it cancels at once (cancelMode "now", ./buyer-cancel-server.ts):
 * every paid line is refunded in full, the stock goes back on sale, the buyer
 * gets the Order cancelled and refund emails and the seller is emailed that
 * the buyer cancelled. The order is still the seller's untouched, so nothing
 * of theirs is lost.
 *
 * It asks the shop instead (cancelMode "ask") when cancelling on the spot
 * could cost the seller: the order was already sent to a print partner, a
 * shipping app or a webhook ("fulfillment.forwarded"), or it holds a download
 * the buyer already has. Then it writes one entry on the order's timeline,
 * "order.cancel_requested" by the buyer, which emails the seller
 * (lib/physical/events-server.ts sellerEmailFor). The seller answers from the
 * order: Cancel and refund, or Keep order, which writes
 * "order.cancel_declined". One request per order: the entry is keyed by the
 * order, so a second press or a script asks nothing twice. A refund that
 * cannot be made on the spot also falls back to asking.
 *
 * Kept as timeline entries rather than columns, so it needs no database
 * change. Pure: the order page, the seller's panel, the route and the tests
 * read the same rules.
 */

export const CANCEL_REQUESTED = "order.cancel_requested"
export const CANCEL_DECLINED = "order.cancel_declined"
/** The order went to a partner or an app to fulfil (lib/integrations/fulfilment, lib/physical/jobs-server). */
export const FORWARDED = "fulfillment.forwarded"
export const CANCEL_REASON_MAX = 300

/** The reason the order is cancelled with when the seller says yes. */
export const CANCELLED_AT_BUYERS_REQUEST = "Cancelled at the buyer's request"
/** The reason an order the buyer cancelled themselves carries. */
export const CANCELLED_BY_BUYER = "Cancelled by the buyer"

export interface CancelOrderFacts {
  status: string
  cancelledAt: string | null
  processingAt: string | null
  refundedCents: number
  lines: { requiresShipping: boolean; fulfilled: number }[]
  shipments: { status: string }[]
}

/**
 * How Cancel order works for an order the buyer may cancel: "now" cancels and
 * refunds it on the spot; "ask" asks the shop (see above): it went to a
 * partner or an app already, or a line is a download the buyer already has.
 */
export function cancelMode(o: { lines: { requiresShipping: boolean }[]; events: Pick<Event, "kind">[] }): "now" | "ask" {
  if (o.events.some((e) => e.kind === FORWARDED)) return "ask"
  return o.lines.every((l) => l.requiresShipping) ? "now" : "ask"
}

type Event = { kind: string; createdAt: string; message?: string; detail?: Record<string, unknown> | null }

/** Unfulfilled, in the seller's words: paid, nothing refunded, nothing sent or started, something to send. */
export function stillUnfulfilled(o: CancelOrderFacts): boolean {
  return (
    o.status === "paid" &&
    !o.cancelledAt &&
    !o.processingAt &&
    o.refundedCents <= 0 &&
    o.lines.some((l) => l.requiresShipping) &&
    o.lines.every((l) => l.fulfilled <= 0) &&
    o.shipments.every((s) => s.status === "cancelled")
  )
}

/** The buyer's request, while it waits for the seller: when, and why. Null when there is none, or it was answered. */
export function openCancelRequest(o: Pick<CancelOrderFacts, "cancelledAt" | "shipments"> & { events: Event[] }): { at: string; reason: string | null } | null {
  /* Cancelled, or sent after all: nothing is waiting any more. */
  if (o.cancelledAt || o.shipments.some((s) => s.status !== "cancelled")) return null
  const asked = o.events.find((e) => e.kind === CANCEL_REQUESTED)
  if (!asked) return null
  const answered = o.events.some((e) => e.kind === CANCEL_DECLINED && e.createdAt >= asked.createdAt)
  if (answered) return null
  const reason = typeof asked.detail?.reason === "string" && asked.detail.reason.trim() ? asked.detail.reason.trim() : null
  return { at: asked.createdAt, reason }
}

export type BuyerCancelState = "can_request" | "requested" | "declined" | "cancelled" | "closed"

/**
 * What the buyer's order page shows: Cancel order, the request waiting, the
 * seller's no, the order cancelled, or nothing (shipped, started, refunded,
 * or the shop doesn't take requests).
 */
export function buyerCancelState(o: CancelOrderFacts & { events: Event[] }, enabled: boolean): BuyerCancelState {
  if (o.cancelledAt) return "cancelled"
  if (openCancelRequest(o)) return "requested"
  if (o.events.some((e) => e.kind === CANCEL_REQUESTED)) return o.events.some((e) => e.kind === CANCEL_DECLINED) ? "declined" : "closed"
  return enabled && stillUnfulfilled(o) ? "can_request" : "closed"
}

/** A buyer's reason, kept short and plain. */
export function cleanCancelReason(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()
  return t ? t.slice(0, CANCEL_REASON_MAX) : null
}
