/**
 * ===========================================================================
 *  THE NEXT STEP, ONE AT A TIME
 * ===========================================================================
 * Home's Getting started lists every step and ticks them off (the steps in
 * app/app/layout.tsx and app/app/page.tsx: branding, product, payouts,
 * OnePage, first sale). A notification per unticked step would repeat that
 * list in the bell, so this says the single most useful one, once it has
 * waited long enough to be a nudge rather than a nag, and only one is open
 * at a time (lib/notifications/policy.ts).
 *
 * Two steps are not here because the panel already draws them in the
 * browser from the account's own state (lib/notifications/unread-state.ts
 * setupNotificationIds): "Set up payments" and "Publish your OnePage".
 * Payments turns critical once a paid product is published and checkout
 * would refuse a buyer (payments.ts payouts_not_connected).
 *
 * A website started and never published is a rule of its own below
 * (website_not_published), because it reads the builder's installs, which
 * the steps here do not need: a failed read of them should silence that one
 * step, not every step. It is a next step too, so the planner still opens
 * one next step at a time across both rules.
 *
 * The steps, most useful first, and when each is due:
 *   product   no product at all, a day after signing up
 *   sale      a published product and payments on, and no sale a week after
 *             the first product went up
 *   branding  no photo or no bio, three days after signing up, once there
 *             is something to sell
 */
import { ageDays, monthKey } from "../format"
import type { Finding, Rule } from "../types"

export const setupNextStep: Rule = {
  kind: "setup_next_step",
  category: "next_step",
  priority: 50,
  version: 1,
  needs: ["creator", "products", "sales"],
  cooldownDays: 30,
  ttlDays: 30,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    const c = s.creator
    if (!c || !s.products) return undefined
    const age = ageDays(c.createdAt, s.now)
    /* Every step that is due, most useful first. The planner opens one at a
       time and moves on past one that was dismissed. */
    const steps: Finding[] = []
    if (s.products.length === 0) {
      if (age >= 1) {
        steps.push({
          subject: "product",
          period: monthKey(s.now),
          priority: 52,
          title: "Add your first product",
          message: "Nothing is for sale yet. A title, a price and a file is all a product needs.",
          href: "/app/products/new",
          area: "Getting started",
        })
      }
      return steps
    }
    const published = s.products.filter((p) => p.status === "published")
    const paid = c.payoutsEnabled === true || c.chargesEnabled === true
    /* Sales unknown is not "no sales": say nothing about the first sale then. */
    const noSales = s.sales ? s.sales.times.length === 0 && !s.sales.truncated : false
    const firstLive = published.map((p) => ageDays(p.createdAt, s.now)).filter(Number.isFinite).sort((a, b) => b - a)[0] ?? 0
    if (published.length > 0 && paid && noSales && firstLive >= 7) {
      steps.push({
        subject: "sale",
        period: monthKey(s.now),
        priority: 51,
        title: "Share your store to get your first sale",
        message: "Your products are live. Post your link where the people who follow you already are.",
        href: "/app/creator-page",
        area: "Getting started",
      })
    }
    if ((!c.hasAvatar || !c.hasBio) && age >= 3) {
      steps.push({
        subject: "branding",
        period: monthKey(s.now),
        title: c.hasAvatar ? "Add a short bio" : c.hasBio ? "Add a profile photo" : "Add a photo and a short bio",
        message: "Buyers trust a store more when they can see who is behind it.",
        href: "/app/settings",
        area: "Getting started",
      })
    }
    return steps
  },
}

/** Days a website may sit as a draft in the builder before it is a nudge. */
export const WEBSITE_DRAFT_DAYS = 2

/**
 * The website was started in the builder (an install exists, still a
 * draft) and nothing is published, two days on. One taken down on purpose
 * (status "unpublished") is a choice and is left alone. Resolved when a
 * website goes live. Home's banner says "Publish your website" from the
 * same fact (lib/home/announcements.ts "website").
 */
export const websiteNotPublished: Rule = {
  kind: "website_not_published",
  category: "next_step",
  priority: 49,
  version: 1,
  needs: ["website"],
  cooldownDays: 30,
  ttlDays: 30,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    const w = s.website
    if (!w) return undefined
    if (w.live || w.unpublished || !w.draftSince) return []
    if (ageDays(w.draftSince, s.now) < WEBSITE_DRAFT_DAYS) return []
    return [
      {
        subject: "website",
        period: monthKey(s.now),
        title: "Your website is not live yet",
        message: "You started it in the builder. Publish it so buyers can find it.",
        href: "/app/website-builder",
        area: "Website",
      },
    ]
  },
}
