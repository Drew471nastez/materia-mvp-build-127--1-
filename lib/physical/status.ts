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

/** A tracking link for the carriers buyers see most; anything else shows the number alone. */
export function trackingUrl(carrier: string | null | undefined, number: string | null | undefined): string | null {
  const n = (number ?? "").trim()
  if (!n || !/^[A-Za-z0-9-]{4,40}$/.test(n)) return null
  const c = (carrier ?? "").toLowerCase().replace(/[^a-z]/g, "")
  const q = encodeURIComponent(n)
  if (c === "usps") return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${q}`
  if (c === "ups") return `https://www.ups.com/track?tracknum=${q}`
  if (c === "fedex") return `https://www.fedex.com/fedextrack/?trknbr=${q}`
  if (c === "dhl" || c === "dhlexpress") return `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${q}`
  if (c === "royalmail") return `https://www.royalmail.com/track-your-item#/tracking-results/${q}`
  if (c === "canadapost") return `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${q}`
  if (c === "auspost" || c === "australiapost") return `https://auspost.com.au/mypost/track/#/details/${q}`
  if (c === "fancourier") return `https://www.fancourier.ro/awb-tracking/?tracking=${q}`
  if (c === "sameday") return `https://sameday.ro/#awb=${q}`
  if (c === "dpd") return `https://tracking.dpd.de/status/en_US/parcel/${q}`
  if (c === "gls") return `https://gls-group.com/track/${q}`
  return null
}

export const CARRIERS = ["USPS", "UPS", "FedEx", "DHL Express", "Royal Mail", "Canada Post", "Australia Post", "DPD", "GLS", "FAN Courier", "Sameday", "Other"]

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
