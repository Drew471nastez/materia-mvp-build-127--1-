/**
 * The parts of a discount code the Coupons page draws in the browser: the
 * pattern a code must match and where a code stands right now. Kept apart
 * from lib/checkout/coupons.ts, which reads the admin console cookie on the
 * server and so cannot be bundled into a client component. That file
 * re-exports all of these, so server code imports them from there as before.
 */
import type { CouponRow } from "./coupons"

/** A code as a buyer types it: letters, digits, - and _, 3 to 32 of them. */
export const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/

export type CouponState = "active" | "scheduled" | "expired" | "used_up" | "off"

/** Where a code stands right now, in the order a buyer would meet it. */
export function couponState(
  c: Pick<CouponRow, "is_active" | "starts_at" | "expires_at" | "usage_limit" | "usage_count">,
  now: Date = new Date(),
): CouponState {
  if (!c.is_active) return "off"
  const t = now.getTime()
  if (c.expires_at && Date.parse(c.expires_at) < t) return "expired"
  if (c.usage_limit !== null && c.usage_limit !== undefined && (c.usage_count ?? 0) >= c.usage_limit) return "used_up"
  if (c.starts_at && Date.parse(c.starts_at) > t) return "scheduled"
  return "active"
}

export const COUPON_STATE_LABEL: Record<CouponState, string> = {
  active: "Active",
  scheduled: "Scheduled",
  expired: "Expired",
  used_up: "Used up",
  off: "Off",
}
