/**
 * ===========================================================================
 *  AN ORDER'S HISTORY, READ BEFORE IT IS OPENED
 * ===========================================================================
 * Everything an order's page shows is already on the client except two
 * things its timeline reads: what happened after the sale (receipts sent
 * again, the email changed) and Stripe's payout steps. Read after the order
 * opened, they arrived half way through the slide and pushed the timeline's
 * rows down under the finger.
 *
 * So a finger on a row, or a pointer resting on one, asks for both, and the
 * product pictures are decoded. By the time the tap lands the answers are
 * usually here, and the timeline is drawn whole on the order's first frame
 * (Timeline in app/app/orders/order-detail.tsx reads this cache for its
 * first state). An answer is kept for FRESH_MS; an action on the order reads
 * again past it.
 */
import type { Order } from "@/lib/orders/order-view"
import { prefetchPhysicalOrder } from "@/components/physical/order-panel"

const FRESH_MS = 30_000

interface Entry {
  at: number
  data: unknown
}

const answers = new Map<string, Entry>()
const pending = new Map<string, Promise<unknown>>()
const decoded = new Set<string>()

export const activityUrl = (orderId: string) => `/api/app/orders/${encodeURIComponent(orderId)}/activity`
export const stripeTimelineUrl = (lineId: string) => `/api/stripe/order-timeline?orderId=${encodeURIComponent(lineId)}`

/** The row whose payment Stripe's steps are read for. */
export function paidLineOf(order: Order) {
  return order.lines.find((l) => (l.amount_cents || 0) > 0 && l.stripe_payment_intent_id) ?? null
}

/** Stripe has something to say only about a payment that went through. */
export function hasPayoutSteps(order: Order): boolean {
  return paidLineOf(order) !== null && order.payment !== "failed" && order.payment !== "pending"
}

/** A fresh answer for `url`, if there is one. `undefined` means none. */
export function cachedJson(url: string): unknown {
  const hit = answers.get(url)
  if (!hit || Date.now() - hit.at > FRESH_MS) return undefined
  return hit.data
}

/**
 * The answer for `url`: the fresh one kept here, the request already on its
 * way, or a new request. `again` skips what is kept (after an action). A
 * failed read is not kept, so the next open asks again.
 */
export function readJson(url: string, again = false): Promise<unknown> {
  if (!again) {
    const hit = cachedJson(url)
    if (hit !== undefined) return Promise.resolve(hit)
    const inFlight = pending.get(url)
    if (inFlight) return inFlight
  }
  const request = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((data) => {
      if (pending.get(url) === request) pending.delete(url)
      if (data !== null) answers.set(url, { at: Date.now(), data })
      return data
    })
  pending.set(url, request)
  return request
}

function decode(src: string) {
  if (decoded.has(src) || typeof Image === "undefined") return
  decoded.add(src)
  const img = new Image()
  img.decoding = "async"
  img.src = src
  img.decode?.().catch(() => decoded.delete(src))
}

/** Everything the order's page will ask for, asked for now. Cheap to call again. */
export function prefetchOrder(order: Order) {
  void readJson(activityUrl(order.id))
  const paid = paidLineOf(order)
  if (paid && hasPayoutSteps(order)) void readJson(stripeTimelineUrl(paid.id))
  for (const line of order.lines) {
    const src = line.product?.thumbnail_url
    if (src) decode(src)
  }
  /* A parcel's shipments, tracking and history, so its cards draw on the first frame rather than a beat later. */
  if (order.shipping) {
    const line = order.lines.find((l) => l.product?.type === "physical")
    if (line) prefetchPhysicalOrder(line.id)
  }
}

/**
 * A pointer that rests on a row for a moment, not one passing over it on the
 * way somewhere else: sweeping down the list must not read every order.
 */
export const HOVER_PREFETCH_MS = 80
