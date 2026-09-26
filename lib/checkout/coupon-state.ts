/**
 * WHERE A DISCOUNT CODE STANDS, AND ITS WORD. Split from ./coupons because
 * the Coupons list draws these in the browser, and ./coupons reaches the
 * admin's server only code (a dynamic import of lib/admin-blog-auth, which
 * reads next/headers): a client component importing it failed the build.
 * Nothing here touches the server.
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

