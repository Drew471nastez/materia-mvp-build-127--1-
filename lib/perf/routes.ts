/**
 * ===========================================================================
 *  WHICH PART OF STORELIB A PAGE IS, AND ITS ADDRESS WITHOUT ANYBODY IN IT
 * ===========================================================================
 * A measurement is filed under an area (the Dashboard, Explore, a community)
 * and a route PATTERN: `/community/:slug/post/:id`, never the address the
 * visitor had. Two reasons. Nobody's handle, post or order id is stored, and
 * the number of distinct routes stays small, so a day rolls up into a few
 * hundred rows however many pages were visited.
 *
 * Published websites on a subdomain or a connected domain are not measured
 * here: they have their own collector (components/website-builder/
 * site-vitals.tsx), whose numbers the health page reads as "Published
 * websites". The admin, the sign in pages and the marketing pages are left
 * out on purpose.
 *
 * Pure. The beacon calls it in the browser; tests/perf-health18.test.ts
 * holds it.
 */

import { isReservedRootSegment } from "@/lib/routes/reserved-segments"

import type { Area } from "./config"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMBER = /^\d+$/

/** Words that are pages of their own, kept as written in a pattern. Anything else after them is an id. */
const STATIC_WORDS = new Set([
  "about", "analytics", "billing", "builder", "changelog", "checkout", "classroom", "collections", "communities", "community", "coupons",
  "courses", "customers", "edit", "emails", "events", "feed", "files", "flow", "gamification", "identity-done", "inventory", "join", "leaderboard",
  "learn", "library", "links", "members", "membership", "memberships", "moderation", "navigation", "new", "notifications", "offers", "onepage",
  "orders", "payments", "payouts", "physical", "post", "posts", "preferences", "products", "receipt", "receipts", "reviews", "sales", "saved",
  "search", "sections", "settings", "sites", "space", "spaces", "stripe", "support", "themes", "upgrade", "website-builder", "wishlist", "demo",
  "creator-page", "order",
])

const BUILDER_IN_APP = new Set(["website-builder", "onepage", "creator-page", "sites"])

/** A segment as a pattern: kept when it is a known word, `:id` otherwise. */
function generic(seg: string): string {
  if (UUID.test(seg) || NUMBER.test(seg)) return ":id"
  return STATIC_WORDS.has(seg) ? seg : ":id"
}

function join(segs: string[]): string {
  return `/${segs.slice(0, 5).join("/")}`.slice(0, 96)
}

/** True for the hosts Storelib itself answers on; false for a published site's own address. */
export function isStorelibHost(hostname: string, mainDomain = "storelib.com"): boolean {
  const h = hostname.toLowerCase()
  if (h === mainDomain || h === `www.${mainDomain}`) return true
  if (h === "localhost" || h === "127.0.0.1") return true
  return h.endsWith(".vercel.app")
}

/**
 * The area and the route pattern of a pathname on storelib.com, or null for
 * a page that is not measured. Query strings and hashes are never read.
 */
export function classify(pathname: string): { area: Area; route: string } | null {
  const path = (pathname.split(/[?#]/)[0] || "/").toLowerCase()
  const segs = path.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  })
  if (segs.length === 0) return null
  const [first, second] = segs

  switch (first) {
    case "app": {
      if (second && BUILDER_IN_APP.has(second)) return { area: "builder", route: join(["app", ...segs.slice(1).map(generic)]) }
      if (second === "courses" && segs[3] === "builder") return { area: "builder", route: "/app/courses/:id/builder" }
      return { area: "app", route: join(["app", ...segs.slice(1).map(generic)]) }
    }
    case "dashboard":
      return { area: "app", route: join(["dashboard", ...segs.slice(1).map(generic)]) }
    case "website-builder":
    case "store-builder":
    case "creator-page":
      return { area: "builder", route: join([first, ...segs.slice(1).map(generic)]) }
    case "explore":
      if (!second) return { area: "explore", route: "/explore" }
      if (second === "search") return { area: "explore", route: "/explore/search" }
      return { area: "explore", route: "/explore/:category" }
    case "community":
    case "c":
      if (!second) return { area: "community", route: `/${first}` }
      return { area: "community", route: join([first, ":slug", ...segs.slice(2).map(generic)]) }
    case "account":
      return { area: "community", route: join(["account", ...segs.slice(1).map(generic)]) }
    case "u":
    case "member":
      return { area: "community", route: `/${first}/:username` }
    case "p":
      return { area: "product", route: "/p/:slug" }
    case "l":
      return { area: "creator", route: "/l/:slug" }
    case "checkout":
    case "pay":
    case "purchase":
      return { area: "checkout", route: join([first, ...segs.slice(1).map(generic)]) }
  }

  /* Everything else at the root is either Storelib's own page (not measured) or a creator's. */
  if (isReservedRootSegment(first) || first.startsWith("_") || first.includes(".")) return null
  if (!second) return { area: "creator", route: "/:seller" }
  if (second === "links") return { area: "creator", route: "/:seller/links" }
  return { area: "product", route: "/:seller/:product" }
}
