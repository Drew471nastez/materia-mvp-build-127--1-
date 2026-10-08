/**
 * ===========================================================================
 *  THE APP OPENS WHERE THE PERSON LEFT IT
 * ===========================================================================
 * "App start: remember where the person was and reopen there. With nothing
 * saved: sellers go to /app, everyone else to /explore."
 *
 * The place is written on every navigation inside the native app
 * (components/platform/native-place-keeper.tsx), and only for the pages it is
 * safe to land on cold: Discover, a community, the library, the account, a
 * creator's page or product, the dashboard. Never checkout, a receipt, sign
 * in, a password reset, a download link or anything else that is one use or
 * half of a flow; on those the place stays the last safe page before them.
 * The query is dropped except for Discover's own few words, so a token, a
 * code or a payment's id is never kept. /native-start reads it on a cold
 * start (startTarget) and checks it again there.
 *
 * It replaces "open the community you used last": somebody who was last in a
 * community reopens there anyway, because that is where they were.
 *
 * Kept in localStorage, which the WebView keeps across launches with the
 * session itself, and cleared on log out (lib/native-bridge.ts), so the next
 * account on the phone never opens on the last one's page.
 */

import { isReservedRootSegment } from "@/lib/routes/reserved-segments"

export const NATIVE_LAST_PLACE_KEY = "sb-native-last-place"
const NATIVE_SCROLL_KEY = "sb-native-last-scroll"

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

/** Never a place to open on, whatever else says so. */
const NEVER = [
  "/checkout",
  "/purchase",
  "/receipt",
  "/access",
  "/downloads",
  "/login",
  "/signup",
  "/auth",
  "/welcome",
  "/reset-password",
  "/verify-email",
  "/native-start",
  "/onboarding",
  "/account/continue",
  "/unsubscribe",
  "/upgrade",
  "/api",
]

/** The query words Discover keeps (a search, a category, an order); every other key is dropped. */
const EXPLORE_KEYS = ["q", "category", "sort"]

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
/** A path segment a page could be named by: letters, digits, dashes, dots, underscores. */
const SEGMENT = /^[A-Za-z0-9._~-]{1,120}$/

/**
 * The place to keep for this address, or null when it is not one to open on.
 * `search` is the query with or without its "?".
 */
export function resumablePlace(pathname: string | null | undefined, search = ""): string | null {
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) return null
  if (pathname.length > 300 || /[\\\s%]/.test(pathname)) return null
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  if (path === "/" || NEVER.some((p) => under(path, p))) return null
  const segs = path.split("/").filter(Boolean)
  if (!segs.every((s) => SEGMENT.test(s) && s !== "." && s !== "..")) return null

  if (under(path, "/explore")) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    const kept = new URLSearchParams()
    for (const k of EXPLORE_KEYS) {
      const v = params.get(k)
      if (v && v.length <= 100) kept.set(k, v)
    }
    const q = kept.toString()
    return q ? `${path}?${q}` : path
  }
  /* A community, any page of it but the join door (an invite's landing).
     The feed's space is ?space= on a phone (lib/community/feed-space-address.ts). Keep that one word so a cold start opens the same feed, not All. */
  if (segs[0] === "community") {
    if (!segs[1] || !SLUG.test(segs[1])) return null
    if (segs[2] === "join") return null
    if (segs.length === 2) {
      const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      const space = params.get("space")
      if (space && SLUG.test(space)) return `${path}?space=${space}`
    }
    return path
  }
  if (under(path, "/account") || under(path, "/wishlist")) return path
  /* The dashboard is a seller's; only a seller is ever on it. */
  if (under(path, "/app")) return path
  /* An old product address. */
  if (segs[0] === "p" && segs.length === 2) return path
  /* A creator's page (/<handle>), one of their products (/<handle>/<slug>) or their OnePage (/<handle>/links). */
  if (!isReservedRootSegment(segs[0]) && segs.length <= 2) return path
  return null
}

/** Is this a kept place, exactly as resumablePlace would keep it? */
export function isResumablePlace(place: unknown): place is string {
  if (typeof place !== "string") return false
  const q = place.indexOf("?")
  const path = q < 0 ? place : place.slice(0, q)
  return resumablePlace(path, q < 0 ? "" : place.slice(q)) === place
}

/** A cached home that is a seller's (lib/native-bridge.ts NATIVE_HOME_ALLOWED). */
function isSellerHome(home: string | null | undefined): boolean {
  const path = (home || "").split(/[?#]/)[0]
  return ["/app", "/dashboard", "/creator-page", "/store-builder"].some((p) => under(path, p))
}

/**
 * WHERE A COLD START GOES, for somebody signed in: the kept place, else a
 * seller's dashboard, else Discover. With Discover switched off it answers
 * the library (/account/library) instead of Discover, and never a kept Discover page: /explore
 * redirects to "/" then, which the app sends back to /native-start, and the
 * two would chase each other.
 */
export function startTarget({ last, home, exploreOn = true }: { last: string | null | undefined; home: string | null | undefined; exploreOn?: boolean }): string {
  const seller = isSellerHome(home)
  const fallback = seller ? "/app" : exploreOn ? "/explore" : "/account/library"
  if (!isResumablePlace(last)) return fallback
  if (!exploreOn && under(last.split("?")[0], "/explore")) return fallback
  return last
}

/* ── The store, on the phone ─────────────────────────────────────────────── */

/** Keep this place. Only called inside the native app (native-place-keeper). */
export function rememberPlace(place: string): void {
  if (!isResumablePlace(place)) return
  try {
    if (localStorage.getItem(NATIVE_LAST_PLACE_KEY) !== place) localStorage.setItem(NATIVE_LAST_PLACE_KEY, place)
  } catch {
    /* Storage refused: the app opens on the default instead. */
  }
}

/** The kept place, checked again on the way out, or null. */
export function readLastPlace(): string | null {
  try {
    const v = localStorage.getItem(NATIVE_LAST_PLACE_KEY)
    return isResumablePlace(v) ? v : null
  } catch {
    return null
  }
}

/** Forget it: on log out, so the next account does not open on this one's page. */
export function forgetLastPlace(): void {
  try {
    localStorage.removeItem(NATIVE_LAST_PLACE_KEY)
    localStorage.removeItem(NATIVE_SCROLL_KEY)
  } catch {
    /* Nothing to forget. */
  }
}

/** Feed position for a community address, kept across a killed app. */
export function rememberPageScroll(path: string, y: number) {
  if (typeof window === "undefined") return
  const key = path.split(/[?#]/)[0]
  if (!key.startsWith("/community/")) return
  try {
    const raw = localStorage.getItem(NATIVE_SCROLL_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    all[key] = Math.max(0, Math.round(y))
    const keys = Object.keys(all)
    for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete all[k]
    localStorage.setItem(NATIVE_SCROLL_KEY, JSON.stringify(all))
  } catch {
    /* */
  }
}

export function pageScrollFor(path: string): number {
  if (typeof window === "undefined") return 0
  try {
    const raw = localStorage.getItem(NATIVE_SCROLL_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const y = all[path.split(/[?#]/)[0]]
    return typeof y === "number" && y > 0 ? y : 0
  } catch {
    return 0
  }
}
