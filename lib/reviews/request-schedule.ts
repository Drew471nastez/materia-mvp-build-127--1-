/**
 * ===========================================================================
 *  STORELIB REVIEWS: WHEN A BUYER IS ASKED, AND WHETHER THEY STILL ARE
 * ===========================================================================
 * With the app on, the store's own settings decide the review request email
 * for every order line it sells, on Storelib and on its website alike
 * (lib/reviews/requests-server.ts sends them from the hourly email run).
 * The notification engine's fixed seven and fourteen days
 * (./request-rules.ts) then stands aside for this store, so nobody is asked
 * twice.
 *
 *   DIGITAL     `digitalDays` after the purchase
 *   PHYSICAL    `physicalDays` after the parcel was delivered, or shipped,
 *               as the store chose. "Delivered" with no delivery scan yet
 *               counts from a week after it shipped, so a carrier that never
 *               reports delivery does not stop the ask for good. Not shipped
 *               yet: not due.
 *   REMINDER    one, `reminderDays` after the first, while still unreviewed
 *
 * And it is asked only when ALL of these hold, checked again right before
 * each email (requestBlock):
 *
 *   still theirs   paid or free and not refunded, failed or disputed
 *   after the app  bought after the app was turned on: turning it on never
 *                  emails last month's buyers
 *   not a test     not a test sale made from the admin
 *   not reviewed   no review on this order, by this buyer, or by this
 *                  address for this product
 *   not the store  the store's own order or its own support address
 *   still sold     the product is still there
 *   may email      the address has not turned review emails off, bounced,
 *                  or complained
 *   not too late   at most LATE_DAYS after it was due, so a store that turns
 *                  emails on after a pause does not send a backlog
 *
 * Pure: no database.
 */
import { canDeliver } from "../receipts/rules"
import type { ReviewsAppSettings } from "./app-settings"

export const DAY_MS = 86_400_000
/** A delivered parcel that was never scanned as delivered counts from this long after it shipped. */
export const UNSCANNED_DELIVERY_DAYS = 7
/** How long after it was due an ask is still worth sending. */
export const LATE_DAYS = 21

export interface ScheduleOrder {
  created_at?: string | null
  requires_shipping?: boolean | null
}

export interface Shipment {
  shippedAt?: string | null
  deliveredAt?: string | null
}

const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

/** When the first email is due, in ms, or null when it cannot be known yet (a parcel not shipped). */
export function requestDueAt(order: ScheduleOrder, shipment: Shipment | null, request: ReviewsAppSettings["request"]): number | null {
  const bought = t(order.created_at)
  if (!Number.isFinite(bought)) return null
  if (!order.requires_shipping) return bought + request.digitalDays * DAY_MS
  const shipped = t(shipment?.shippedAt)
  const delivered = t(shipment?.deliveredAt)
  let from: number
  if (request.physicalFrom === "shipped") {
    from = Number.isFinite(shipped) ? shipped : delivered
  } else {
    from = Number.isFinite(delivered) ? delivered : Number.isFinite(shipped) ? shipped + UNSCANNED_DELIVERY_DAYS * DAY_MS : NaN
  }
  return Number.isFinite(from) ? from + request.physicalDays * DAY_MS : null
}

export interface RequestFacts {
  order: { status?: string | null; amount_cents?: number | null; refund_amount_cents?: number | null; created_at?: string | null; buyer_id?: string | null; buyer_email?: string | null; source_detail?: unknown } | null
  productExists: boolean
  reviewed: boolean
  sellerUserId: string | null
  sellerSupportEmail: string | null
  /** Live suppression scopes of the address: all, optional, review_requests. */
  suppressed: readonly string[]
}

export type RequestBlock = "no_order" | "not_open" | "before_app" | "test_sale" | "reviewed" | "own_order" | "no_product" | "unsubscribed" | "too_late"

function surfaceOf(detail: unknown): string | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null
  const s = (detail as Record<string, unknown>).surface
  return typeof s === "string" ? s : null
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** Null when the email may go now; otherwise the first reason it may not. `dueAt` in ms. */
export function requestBlock(f: RequestFacts, settings: Pick<ReviewsAppSettings, "enabledAt">, dueAt: number, now: number): RequestBlock | null {
  const o = f.order
  if (!o) return "no_order"
  if (!canDeliver(o)) return "not_open"
  if (surfaceOf(o.source_detail) === "admin") return "test_sale"
  const enabledAt = t(settings.enabledAt)
  if (Number.isFinite(enabledAt) && t(o.created_at) < enabledAt) return "before_app"
  if (!f.productExists) return "no_product"
  if ((o.buyer_id && o.buyer_id === f.sellerUserId) || same(o.buyer_email, f.sellerSupportEmail)) return "own_order"
  if (f.reviewed) return "reviewed"
  if (f.suppressed.some((s) => s === "all" || s === "optional" || s === "review_requests")) return "unsubscribed"
  if (now - dueAt > LATE_DAYS * DAY_MS) return "too_late"
  return null
}

/** The reminder is due `reminderDays` after the first email went. */
export function reminderDueAt(sentAt: string | null | undefined, request: ReviewsAppSettings["request"]): number | null {
  const s = t(sentAt)
  return request.reminder && Number.isFinite(s) ? s + request.reminderDays * DAY_MS : null
}
