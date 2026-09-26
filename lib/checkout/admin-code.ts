import "server-only"

/**
 * THE ADMIN'S CODE, CHECKED ON THE SERVER ONLY (see ADMIN_CODE in ./coupons).
 *
 * Kept out of ./coupons on purpose: that file is also imported by the Coupons
 * page's client component, and the admin session is read from a cookie
 * through next/headers, which cannot be in a browser bundle. Putting this
 * check there once failed the production build for every page.
 */
import { adminCoupon, checkCoupon, isAdminCode, normaliseCode, type CouponCheck } from "./coupons"

async function adminSignedIn(): Promise<boolean> {
  try {
    const { isAdminAuthenticated } = await import("@/lib/admin-blog-auth")
    return await isAdminAuthenticated()
  } catch {
    return false
  }
}

/** The admin's 100% for a signed-in admin console session, or null: then the code is looked up like any other. */
export async function adminCodeCheck(opts: { creatorId: string; productId: string; code: unknown; priceCents: number }): Promise<CouponCheck | null> {
  const code = normaliseCode(opts.code)
  if (!code || !isAdminCode(code)) return null
  if (!(await adminSignedIn())) return null
  return checkCoupon(adminCoupon(opts.creatorId), { productId: opts.productId, priceCents: opts.priceCents })
}
