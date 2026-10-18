/**
 * ===========================================================================
 *  MILESTONES: SAID ONCE, WHEN THEY HAPPEN
 * ===========================================================================
 *   sales_milestone        the 1st, 10th and 100th sale (payments that are
 *                          sales, a basket counted once: lib/orders/order-view)
 *   first_review           the first review on any product
 *   subscribers_milestone  50 and 500 subscribed contacts
 *
 * A milestone is news for a few days, not forever. One reached before the
 * engine first saw the creator (a store with a year of sales) is recorded
 * silently as a baseline, so it is never announced late and never looked
 * for again. Each pushes once. The sale that crosses a sales milestone
 * pushes as that milestone rather than as a second push beside
 * "You made a sale" (lib/notifications/events.ts saleMilestone).
 */
import { ageDays, money, ordinal, productName, shortDate } from "../format"
import type { Finding, Rule } from "../types"

export const SALES_THRESHOLDS = [1, 10, 100] as const
export const SUBSCRIBER_THRESHOLDS = [50, 500] as const
/** How long after it happened a milestone is still news. */
export const MILESTONE_FRESH_DAYS = 3
export const REVIEW_FRESH_DAYS = 7

export const salesMilestone: Rule = {
  kind: "sales_milestone",
  category: "milestone",
  priority: 65,
  version: 1,
  needs: ["creator", "sales"],
  cooldownDays: 0,
  ttlDays: 30,
  resolveWhenGone: false,
  push: true,
  evaluate(s) {
    const sales = s.sales
    if (!sales) return undefined
    const zone = s.creator?.timeZone ?? null
    const out: Finding[] = []
    for (const n of SALES_THRESHOLDS) {
      if (sales.times.length < n) {
        /* Not read far enough to know when it happened, but it did, long ago. */
        if (sales.truncated) out.push(baseline(`sales_${n}`))
        continue
      }
      const at = sales.times[n - 1]
      if (ageDays(at, s.now) > MILESTONE_FRESH_DAYS) {
        out.push(baseline(`sales_${n}`))
        continue
      }
      const first = n === 1 && sales.first
      out.push({
        subject: `sales_${n}`,
        period: "",
        title: n === 1 ? "Your first sale" : `Your ${ordinal(n)} sale`,
        message: first
          ? money(first.amountCents, first.currency) ? `${productName(first.productTitle)} sold for ${money(first.amountCents, first.currency)}.` : `${productName(first.productTitle)} sold.`
          : `That is ${n} sales since your first on ${shortDate(sales.times[0], zone)}.`,
        href: "/app/orders",
        area: "Milestone",
        data: { sales: n },
      })
    }
    return out
  },
}

export const firstReview: Rule = {
  kind: "first_review",
  category: "milestone",
  priority: 60,
  version: 1,
  needs: ["reviews"],
  cooldownDays: 0,
  ttlDays: 30,
  resolveWhenGone: false,
  push: true,
  evaluate(s) {
    const r = s.reviews
    if (!r) return undefined
    if (r.olderExists) return [baseline("review_1")]
    const first = r.firstRecent
    if (!first) return []
    if (ageDays(first.at, s.now) > REVIEW_FRESH_DAYS) return [baseline("review_1")]
    const stars = Math.max(1, Math.min(5, Math.round(first.rating)))
    return [
      {
        subject: "review_1",
        period: "",
        title: "Your first review",
        message: `${stars} ${stars === 1 ? "star" : "stars"} on ${productName(first.productTitle)}.`,
        href: first.productId ? `/app/products/${encodeURIComponent(first.productId)}` : "/app/products",
        area: "Milestone",
        productId: first.productId,
        reviewId: first.id,
        data: { rating: stars },
      },
    ]
  },
}

export const subscribersMilestone: Rule = {
  kind: "subscribers_milestone",
  category: "milestone",
  priority: 55,
  version: 1,
  needs: ["subscribers"],
  cooldownDays: 0,
  ttlDays: 30,
  resolveWhenGone: false,
  push: true,
  evaluate(s) {
    const sub = s.subscribers
    if (!sub) return undefined
    const out: Finding[] = []
    for (const n of SUBSCRIBER_THRESHOLDS) {
      if (sub.count < n) continue
      if (sub.countWeekAgo >= n) {
        out.push(baseline(`subscribers_${n}`))
        continue
      }
      out.push({
        subject: `subscribers_${n}`,
        period: "",
        title: `${n} subscribers`,
        message: `Your list passed ${n} people this week.`,
        href: "/app/emails?tab=subscribers",
        area: "Milestone",
        data: { subscribers: sub.count },
      })
    }
    return out
  },
}

/** Reached long ago: kept quietly so it is never announced. */
function baseline(subject: string): Finding {
  return { subject, period: "", title: "", message: "", href: "/app", area: "Milestone", baseline: true }
}
