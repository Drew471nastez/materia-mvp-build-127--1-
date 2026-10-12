/**
 * ===========================================================================
 *  STATUSES: PAYMENT, FULFILLMENT AND RETURNS ARE THREE DIFFERENT THINGS
 * ===========================================================================
 * An order can be paid and unfulfilled, partially fulfilled and partially
 * returned. Each is derived from the rows that prove it (fulfillment items,
 * return items) so a stored status can always be recomputed and never
 * drifts. Labels and tones are the ones the order pages show.
 */

import type { DeliveryMethod, FulfillmentStatus, PaymentStatus, ReturnStatus, ShipmentStatus } from "./types"
import { CARRIER_NAMES, carrierTrackingUrl } from "./carriers"

export type Tone = "green" | "blue" | "amber" | "red" | "gray"

export interface LineProgress {
  orderId: string
  quantity: number
  requiresShipping: boolean
  fulfilled: number
  returned: number
}

/**
 * Unfulfilled, Processing, Shipped (fulfilled), Delivered, from the rows:
 * delivered once everything shipped and every shipment that was not
 * cancelled has arrived; processing once the seller started on it and
 * nothing has shipped yet.
 */
export function fulfillmentStatusOf(lines: LineProgress[], cancelled = false, extra: { processing?: boolean; allDelivered?: boolean } = {}): FulfillmentStatus {
  const shippable = lines.filter((l) => l.requiresShipping)
  if (shippable.length === 0) return "not_required"
  if (cancelled) return "cancelled"
  const want = shippable.reduce((n, l) => n + l.quantity, 0)
  const done = shippable.reduce((n, l) => n + Math.min(l.quantity, l.fulfilled), 0)
  if (done <= 0) return extra.processing ? "processing" : "unfulfilled"
  if (done < want) return "partially_fulfilled"
  return extra.allDelivered ? "delivered" : "fulfilled"
}

/** The four steps an order shows, and which one it is on (-1 when cancelled or nothing ships). */
export const ORDER_STEPS: { id: FulfillmentStatus; ship: string; pickup: string }[] = [
  { id: "unfulfilled", ship: "Unfulfilled", pickup: "Unfulfilled" },
  { id: "processing", ship: "Processing", pickup: "Processing" },
  { id: "fulfilled", ship: "Shipped", pickup: "Ready for pickup" },
  { id: "delivered", ship: "Delivered", pickup: "Picked up" },
]
export function orderStep(status: FulfillmentStatus): number {
  if (status === "partially_fulfilled") return 2
  return ORDER_STEPS.findIndex((s) => s.id === status)
}

export function returnStatusOf(lines: LineProgress[], openReturns: number): ReturnStatus {
  const sold = lines.reduce((n, l) => n + l.quantity, 0)
  const back = lines.reduce((n, l) => n + Math.min(l.quantity, l.returned), 0)
  if (back > 0 && back >= sold) return "returned"
  if (back > 0) return "partially_returned"
  if (openReturns > 0) return "in_progress"
  return "none"
}

/**
 * The items a request names, one entry per line: the same line twice is its
 * quantities added together, so two entries of 2 on a line with 2 left are 4
 * and refused, never 2 and 2 each passing on its own. Whole numbers above
 * zero only; the first entry's other fields are kept.
 */
export function mergeItemQuantities<T extends { orderId: string; quantity: number }>(items: T[]): T[] {
  const byLine = new Map<string, T>()
  for (const item of items) {
    const quantity = Math.floor(Number(item.quantity) || 0)
    if (quantity <= 0) continue
    const had = byLine.get(item.orderId)
    byLine.set(item.orderId, had ? { ...had, quantity: had.quantity + quantity } : { ...item, quantity })
  }
  return [...byLine.values()]
}

/** What is still to ship on each line: ordered minus already in a fulfillment that was not cancelled. */
export function unfulfilledQuantities(lines: LineProgress[]): Map<string, number> {
  return new Map(lines.filter((l) => l.requiresShipping).map((l) => [l.orderId, Math.max(0, l.quantity - l.fulfilled)]))
}

/** What can still be returned on each line: what was fulfilled (or sold, when nothing ships) minus already returned. */
export function returnableQuantities(lines: LineProgress[]): Map<string, number> {
  return new Map(lines.map((l) => [l.orderId, Math.max(0, (l.requiresShipping ? Math.min(l.quantity, l.fulfilled) : l.quantity) - l.returned)]))
}

export const PAYMENT_LABEL: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Payment pending", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  failed: { label: "Payment failed", tone: "red" },
  expired: { label: "Expired", tone: "gray" },
  cancelled: { label: "Cancelled", tone: "gray" },
  refunded: { label: "Refunded", tone: "gray" },
  partially_refunded: { label: "Partially refunded", tone: "amber" },
}

export const FULFILLMENT_LABEL: Record<FulfillmentStatus, { label: string; tone: Tone }> = {
  unfulfilled: { label: "Unfulfilled", tone: "amber" },
  processing: { label: "Processing", tone: "blue" },
  partially_fulfilled: { label: "Partially shipped", tone: "blue" },
  fulfilled: { label: "Shipped", tone: "green" },
  delivered: { label: "Delivered", tone: "green" },
  cancelled: { label: "Cancelled", tone: "gray" },
  not_required: { label: "No shipping", tone: "gray" },
}

const PICKUP_FULFILLMENT_LABEL: Partial<Record<FulfillmentStatus, { label: string; tone: Tone }>> = {
  partially_fulfilled: { label: "Partly ready", tone: "blue" },
  fulfilled: { label: "Ready for pickup", tone: "green" },
  delivered: { label: "Picked up", tone: "green" },
}

/** The order's fulfilment status in the words for how it is delivered. */
export function fulfillmentLabel(status: FulfillmentStatus, method: DeliveryMethod = "ship"): { label: string; tone: Tone } {
  return (method === "pickup" ? PICKUP_FULFILLMENT_LABEL[status] : null) ?? FULFILLMENT_LABEL[status] ?? FULFILLMENT_LABEL.unfulfilled
}

export const RETURN_LABEL: Record<ReturnStatus, { label: string; tone: Tone }> = {
  none: { label: "No returns", tone: "gray" },
  requested: { label: "Return requested", tone: "amber" },
  in_progress: { label: "Return in progress", tone: "blue" },
  partially_returned: { label: "Partially returned", tone: "blue" },
  returned: { label: "Returned", tone: "gray" },
}

export const SHIPMENT_LABEL: Record<ShipmentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Preparing", tone: "amber" },
  submitted: { label: "Sent to fulfiller", tone: "blue" },
  shipped: { label: "Shipped", tone: "blue" },
  in_transit: { label: "In transit", tone: "blue" },
  out_for_delivery: { label: "Out for delivery", tone: "blue" },
  delivered: { label: "Delivered", tone: "green" },
  failed: { label: "Delivery problem", tone: "red" },
  cancelled: { label: "Cancelled", tone: "gray" },
}

/** A shipment's status, read as a pickup when the buyer collects it. */
export function shipmentLabel(status: ShipmentStatus, pickup = false): { label: string; tone: Tone } {
  if (pickup && (status === "shipped" || status === "in_transit" || status === "out_for_delivery")) return { label: "Ready for pickup", tone: "blue" }
  if (pickup && status === "delivered") return { label: "Picked up", tone: "green" }
  return SHIPMENT_LABEL[status]
}

/** A shipment only moves forward, except to failed or cancelled; delivered and cancelled are final. */
const ORDER: ShipmentStatus[] = ["pending", "submitted", "shipped", "in_transit", "out_for_delivery", "delivered"]
export function canMoveShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  if (from === to) return false
  if (from === "delivered" || from === "cancelled") return false
  if (to === "cancelled") return from === "pending" || from === "submitted" || from === "failed"
  if (to === "failed") return true
  if (from === "failed") return ORDER.includes(to)
  return ORDER.indexOf(to) > ORDER.indexOf(from)
}

export const TONE_CLASS: Record<Tone, string> = {
  green: "bg-[#dcfce7] text-[#166534]",
  blue: "bg-[#e0e7ff] text-[#3730a3]",
  amber: "bg-[#fef3c7] text-[#92400e]",
  red: "bg-[#fee4e2] text-[#b42318]",
  gray: "bg-[#f1f2f4] text-[#4b5563]",
}

/** A tracking link for the carriers buyers see most (./carriers.ts); anything else shows the number alone. */
export function trackingUrl(carrier: string | null | undefined, number: string | null | undefined): string | null {
  return carrierTrackingUrl(carrier, number)
}

/** What the seller picks from when marking an order shipped, Other last. */
export const CARRIERS = CARRIER_NAMES

/**
 * The carrier a tracking number most likely belongs to, from its shape, as
 * Shopify fills it in while the number is typed. Only shapes that are hard
 * to mistake: anything else returns null and the merchant picks. A guess,
 * never a check: the field stays the merchant's to change.
 */
export function guessCarrier(number: string | null | undefined): string | null {
  const n = (number ?? "").replace(/[\s-]/g, "").toUpperCase()
  if (!n) return null
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return "UPS"
  if (/^(9[1-5])\d{18,20}$/.test(n) || /^[A-Z]{2}\d{9}US$/.test(n)) return "USPS"
  if (/^[A-Z]{2}\d{9}GB$/.test(n)) return "Royal Mail"
  if (/^[A-Z]{2}\d{9}CA$/.test(n)) return "Canada Post"
  if (/^[A-Z]{2}\d{9}AU$/.test(n)) return "Australia Post"
  if (/^(\d{12}|\d{15})$/.test(n)) return "FedEx"
  if (/^\d{10}$/.test(n)) return "DHL Express"
  return null
}

/**
 * THE RETURN WINDOW (Settings > Returns and refunds, "Return window"): its
 * days count from when the buyer has the items. For each shipment that was
 * not cancelled that is when it was delivered (picked up, for a pickup), or
 * when it was shipped if it has no tracking number to say it arrived (a
 * pickup marked ready counts from then too). An order with nothing to ship
 * counts from payment. The window is open while any shipment's is: not
 * started yet, or within its days. `endsAt` is the last day, once every
 * shipment's start is known.
 *
 * A TRACKED PARCEL NEVER MARKED DELIVERED still has a window that ends. It
 * counts from when the parcel should have arrived: the carrier's estimated
 * delivery, or the day it shipped plus the delivery's longest promise (the
 * zone rate's max days, ASSUMED_TRANSIT_DAYS when it gave none) plus
 * DELIVERY_GRACE_DAYS, whichever comes first. Until then the window has not
 * started, but its end is already known and the buyer is told the date.
 * `assumed` says a start was worked out this way.
 *
 * Pure: the buyer's order page and the return route read it the same way.
 */
export const DELIVERY_GRACE_DAYS = 14
export const ASSUMED_TRANSIT_DAYS = 10

export function returnWindow(
  o: {
    lines: { requiresShipping: boolean }[]
    shipments: { status: string; trackingNumber: string | null; shippedAt: string | null; deliveredAt: string | null; provider?: string | null; estimatedDeliveryAt?: string | null }[]
    paidAt: string | null
    pickup?: boolean
    /** The delivery paid for: its longest promise in days, when the rate gave one. */
    delivery?: { maxDays: number | null } | null
  },
  days: number,
  now: number = Date.now(),
): { open: boolean; started: boolean; endsAt: string | null; assumed: boolean } {
  const day = 86_400_000
  const span = Math.max(0, Math.floor(days)) * day
  const startOf = (iso: string | null | undefined) => {
    const t = iso ? Date.parse(iso) : NaN
    return Number.isFinite(t) ? t : null
  }
  let assumed = false
  let starts: (number | null)[]
  if (!o.lines.some((l) => l.requiresShipping)) starts = [startOf(o.paidAt)]
  else {
    const live = o.shipments.filter((s) => s.status !== "cancelled")
    if (live.length === 0) return { open: true, started: false, endsAt: null, assumed: false }
    const transit = typeof o.delivery?.maxDays === "number" && o.delivery.maxDays > 0 ? Math.min(90, Math.floor(o.delivery.maxDays)) : ASSUMED_TRANSIT_DAYS
    starts = live.map((s) => {
      const delivered = startOf(s.deliveredAt)
      if (delivered !== null) return delivered
      const shipped = startOf(s.shippedAt)
      if (o.pickup || s.provider === "pickup" || !s.trackingNumber) return shipped
      if (shipped === null) return null
      /* Tracked and never marked delivered: from when it should have arrived. */
      const latest = shipped + (transit + DELIVERY_GRACE_DAYS) * day
      const estimate = startOf(s.estimatedDeliveryAt)
      assumed = true
      return estimate !== null && estimate >= shipped ? Math.min(estimate, latest) : latest
    })
  }
  const known = starts.every((t) => t !== null)
  const started = known && (starts as number[]).every((t) => t <= now)
  const open = starts.some((t) => t === null || now - t <= span)
  const last = known && starts.length ? Math.max(...(starts as number[])) + span : null
  return { open, started, endsAt: last !== null ? new Date(last).toISOString() : null, assumed }
}

/** What buyers and the merchant call an order: short, stable, from its id. */
export function orderNumber(checkoutId: string): string {
  return `#${checkoutId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

/**
 * Whether a refund puts the order's stock back: refunded in full, nothing
 * out for delivery (every shipment cancelled or none made), not cancelled
 * already, and something physical in it. A partial refund, or one after
 * shipping, leaves stock to the return flow.
 */
export function refundReleasesStock(o: { totalCents: number; refundedCents: number; cancelledAt: string | null; shipments: { status: string }[]; lines: { type: string }[] }): boolean {
  if (o.cancelledAt || o.totalCents <= 0 || o.refundedCents < o.totalCents) return false
  if (o.shipments.some((s) => s.status !== "cancelled")) return false
  return o.lines.some((l) => l.type === "physical")
}
