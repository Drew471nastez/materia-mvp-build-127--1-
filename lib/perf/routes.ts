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
 * WHICH HOSTS (classifyFor). storelib.com, which is also what the iOS and
 * Android apps load; storelib.me, where OnePages live (creator pages); and
 * on a published website's own host (a subdomain or a connected domain) only
 * Storelib's own pages there, its checkout and receipt. The website's own
 * pages have their own collector (components/website-builder/site-vitals.tsx
 * and lib/perf/site-vitals-inline.ts for an imported theme), whose numbers
 * the health page reads as "Published websites". The admin, the sign in
 * pages and the marketing pages are left out on purpose.
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
  "creator-page", "order", "site", "cart", "thanks", "success", "wallet-return", "editor",
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

/** The OnePage host (storelib.me), as lib/onepage/address.ts reads it; NEXT_PUBLIC_, so the browser has it too. */
function onePageHost(): string {
  return (process.env.NEXT_PUBLIC_ONEPAGE_DOMAIN || "storelib.me").trim().toLowerCase()
}

/**
 * The area and route pattern of a page on any host, or null when the page is
 * not Storelib's to measure (see WHICH HOSTS above).
 */
export function classifyFor(hostname: string, pathname: string, onePage = onePageHost()): { area: Area; route: string } | null {
  const h = hostname.toLowerCase()
  if (isStorelibHost(h)) return classify(pathname)
  const segs = (pathname.split(/[?#]/)[0] || "/").toLowerCase().split("/").filter(Boolean)
  if (h === onePage || h === `www.${onePage}`) {
    /* storelib.me/{name} is a creator's OnePage; nothing else there is a page. */
    return segs.length === 1 && !segs[0].includes(".") ? { area: "creator", route: "/:onepage" } : null
  }
  /* A website's own host: Storelib's checkout and receipt on it, nothing else. */
  if (segs[0] === "checkout" || segs[0] === "receipt") return classify(pathname)
  return null
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
    case "receipt":
      return { area: "checkout", route: join([first, ...segs.slice(1).map(generic)]) }
    /* The buyer's side of the app: what a buyer opens the app to. */
    case "library":
    case "downloads":
    case "wishlist":
    case "onboarding":
    case "upgrade":
    case "native-start":
      return { area: "app", route: join([first, ...segs.slice(1).map(generic)]) }
  }

  /* Everything else at the root is either Storelib's own page (not measured) or a creator's. */
  if (isReservedRootSegment(first) || first.startsWith("_") || first.includes(".")) return null
  if (!second) return { area: "creator", route: "/:seller" }
  if (second === "links") return { area: "creator", route: "/:seller/links" }
  return { area: "product", route: "/:seller/:product" }
}
