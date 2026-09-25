/**
 * ===========================================================================
 *  PRODUCTS AND CHECKOUT
 * ===========================================================================
 *   product_missing_file     a problem: a published digital product with no
 *                            file a buyer can download (none, still
 *                            uploading, or flagged by the scan). Buyers pay
 *                            and get nothing.
 *   receipt_not_delivered    a problem: a buyer paid this week and the email
 *                            with their download failed; the order's page
 *                            sends it again.
 *   checkout_not_completing  a problem: three or more people reached Pay in
 *                            the last day and not one order came of it, on a
 *                            store that did sell in the month before. Stripe
 *                            does not tell Storelib why a card fails, so this
 *                            is read from started checkouts that never
 *                            became orders.
 *   product_views_no_sales   an opportunity: 50 or more views in the last 14
 *                            days and no sale, on a product older than three
 *                            weeks.
 *   coupon_expiring          an opportunity: a coupon people are using ends
 *                            in the next three days.
 */
import { ageDays, ageHours, clip, dayKey, monthKey, productName, shortDate } from "../format"
import type { Finding, Rule } from "../types"

export const VIEWS_WITHOUT_SALES = 50
export const TRAFFIC_DAYS = 14
export const CHECKOUT_BUYERS_MIN = 3

export const productMissingFile: Rule = {
  kind: "product_missing_file",
  category: "problem",
  priority: 75,
  version: 1,
  needs: ["products", "files"],
  cooldownDays: 3,
  ttlDays: 30,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    if (!s.products || !s.deliverable) return undefined
    const has = new Set(s.deliverable)
    const out: Finding[] = []
    for (const p of s.products) {
      if (p.status !== "published" || p.type !== "digital" || has.has(p.id)) continue
      /* A file may still be on its way up for a product published a moment ago. */
      if (ageHours(p.createdAt, s.now) < 2) continue
      out.push({
        subject: p.id,
        title: `${productName(p.title)} has no file to deliver`,
        message: "Buyers can pay and get nothing to download. Add the file or unpublish it.",
        href: `/app/products/${encodeURIComponent(p.id)}`,
        area: "Products",
        productId: p.id,
      })
    }
    return out
  },
}

/**
 * A buyer paid and the email with their download did not go through
 * (lib/orders/notify writes the failure on the order). The order's page has
 * Resend receipt; resolved once it has gone (buyer_notified_at).
 */
export const receiptNotDelivered: Rule = {
  kind: "receipt_not_delivered",
  category: "problem",
  priority: 74,
  version: 1,
  needs: ["delivery"],
  cooldownDays: 0,
  ttlDays: 7,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    if (!s.undelivered) return undefined
    const list = s.undelivered.filter((o) => ageDays(o.createdAt, s.now) <= 7)
    return list.slice(0, 3).map((o) => ({
      subject: o.orderId,
      period: "",
      title: o.productTitle ? `A receipt for ${clip(o.productTitle, 30)} did not reach the buyer` : "A receipt did not reach the buyer",
      message: "The email with their download did not go through. Open the order to send it again.",
      href: `/app/orders?order=${encodeURIComponent(o.orderId)}`,
      area: "Orders",
    }))
  },
}

export const checkoutNotCompleting: Rule = {
  kind: "checkout_not_completing",
  category: "problem",
  priority: 72,
  version: 1,
  needs: ["creator", "checkout"],
  cooldownDays: 2,
  ttlDays: 2,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    const c = s.checkout
    if (!c) return undefined
    /* Stripe has card payments off: stripe_restricted already says so. */
    if (s.creator?.chargesEnabled === false) return []
    if (c.buyers < CHECKOUT_BUYERS_MIN || c.orders > 0 || !c.soldBefore) return []
    return [
      {
        subject: "checkout",
        period: dayKey(s.now),
        title: `${c.buyers} buyers reached Pay in the last day and none finished`,
        message: "Card payments may be failing. Check Payments, then try a purchase yourself.",
        href: "/app/settings/payments",
        area: "Checkout",
        data: { buyers: c.buyers, starts: c.starts },
      },
    ]
  },
}

export const productViewsNoSales: Rule = {
  kind: "product_views_no_sales",
  category: "opportunity",
  priority: 45,
  version: 1,
  needs: ["products", "traffic"],
  cooldownDays: 30,
  kindCooldownDays: 7,
  ttlDays: 14,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    if (!s.products || !s.traffic) return undefined
    const recent = new Set(s.traffic.soldRecently)
    return s.products
      .filter((p) => p.status === "published" && ageDays(p.createdAt, s.now) >= 21)
      .map((p) => ({ p, views: s.traffic!.views14[p.id] ?? 0, orders: s.traffic!.orders14[p.id] ?? 0 }))
      .filter((x) => x.views >= VIEWS_WITHOUT_SALES && x.orders === 0 && !recent.has(x.p.id))
      .sort((a, b) => b.views - a.views)
      .slice(0, 2)
      .map(({ p, views }) => ({
        subject: p.id,
        period: monthKey(s.now),
        title: `${productName(p.title)}: ${views} views and no sales in ${TRAFFIC_DAYS} days`,
        line: `${clip(p.title || "A product", 26)}: ${views} views, no sales`,
        message: "People look and leave. A clearer first photo, a lower price or a coupon often helps.",
        href: `/app/products/${encodeURIComponent(p.id)}`,
        area: "Products",
        productId: p.id,
        data: { views },
      }))
  },
}

export const couponExpiring: Rule = {
  kind: "coupon_expiring",
  category: "opportunity",
  priority: 35,
  version: 1,
  needs: ["creator", "coupons"],
  cooldownDays: 0,
  ttlDays: 4,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    if (!s.coupons) return undefined
    const zone = s.creator?.timeZone ?? null
    return s.coupons
      .filter((c) => {
        const left = -ageDays(c.expiresAt, s.now)
        return left > 0 && left <= 3 && c.usageCount >= 1 && (c.usageLimit === null || c.usageCount < c.usageLimit)
      })
      .map((c) => ({
        subject: c.id,
        /* Extended and ending again later is a new ending. */
        period: c.expiresAt.slice(0, 10),
        title: `${clip(c.code, 24)} ends on ${shortDate(c.expiresAt, zone)}`,
        message: `Used ${c.usageCount === 1 ? "once" : `${c.usageCount} times`}. Extend it if it is still bringing in sales.`,
        href: `/app/coupons/${encodeURIComponent(c.id)}`,
        area: "Coupons",
        data: { used: c.usageCount },
      }))
  },
}
