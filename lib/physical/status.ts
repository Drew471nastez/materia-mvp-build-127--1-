/**
 * ===========================================================================
 *  STATUSES: PAYMENT, FULFILLMENT AND RETURNS ARE THREE DIFFERENT THINGS
 * ===========================================================================
 * An order can be paid and unfulfilled, partially fulfilled and partially
 * returned. Each is derived from the rows that prove it (fulfillment items,
 * return items) so a stored status can always be recomputed and never
 * drifts. Labels and tones are the ones the order pages show.
 */

import type { FulfillmentStatus, PaymentStatus, ReturnStatus, ShipmentStatus } from "./types"

export type Tone = "green" | "blue" | "amber" | "red" | "gray"

export interface LineProgress {
  orderId: string
  quantity: number
  requiresShipping: boolean
  fulfilled: number
  returned: number
}

export function fulfillmentStatusOf(lines: LineProgress[], cancelled = false): FulfillmentStatus {
  const shippable = lines.filter((l) => l.requiresShipping)
  if (shippable.length === 0) return "not_required"
  if (cancelled) return "cancelled"
  const want = shippable.reduce((n, l) => n + l.quantity, 0)
  const done = shippable.reduce((n, l) => n + Math.min(l.quantity, l.fulfilled), 0)
  if (done <= 0) return "unfulfilled"
  return done >= want ? "fulfilled" : "partially_fulfilled"
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
  partially_fulfilled: { label: "Partially fulfilled", tone: "blue" },
  fulfilled: { label: "Fulfilled", tone: "green" },
  cancelled: { label: "Cancelled", tone: "gray" },
  not_required: { label: "No shipping", tone: "gray" },
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
