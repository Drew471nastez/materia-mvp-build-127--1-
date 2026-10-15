/**
 * ===========================================================================
 *  HOW A VISITOR ARRIVED AT A COMMUNITY, IN ONE WORD
 * ===========================================================================
 * Pure, so the page that records a visit (lib/communities/server/
 * record-view.ts) and the tests read the same answer. A community's
 * Analytics lists its visits by these words (components/community/creator/
 * analytics-section.tsx), counted once a visitor a day (SQL part 184).
 *
 * The rules are Storelib Analytics' own (lib/analytics/sources.ts
 * categorizeServerSource): a link's utm_source and utm_medium win, then an
 * in-app browser with no referrer, then email, social and search by the
 * site that sent the visitor, and anything else that sent them is a
 * referral, with its host kept. A community adds two of its own, because
 * most of its visitors come from Storelib itself:
 *
 *   explore    Storelib's Explore, or the list of communities
 *   storelib   any other Storelib page: the creator's page, a product, a
 *              OnePage, another community
 *
 * A move inside the same community (a post, a space, back to the home) and
 * the payment page a buyer returns from are "direct": they say where the
 * visitor just was, not how they came.
 */
import { categorizeServerSource, detectClientAppFromUA, hostIs, isInternalReferrer, referrerHost } from "@/lib/analytics/sources"
import { isOnePageHost } from "@/lib/onepage/address"
import { parseUserAgent } from "@/lib/analytics/user-agent"

export interface VisitInput {
  /** The Referer the page's request carried. */
  referer: string | null | undefined
  /** The page's own path and query ("/community/clay?utm_source=ig"). */
  path: string | null | undefined
  /** The community's address word. */
  slug: string
  mainDomain: string
  userAgent?: string | null
}

export interface VisitSource {
  /** "direct", "organic_search", "social_instagram", "email", "referral", "explore", "storelib"... */
  source: string
  /** The site that sent the visitor, for a visit from outside Storelib; null otherwise. */
  referrer: string | null
}

function queryOf(path: string | null | undefined): URLSearchParams {
  const q = (path || "").split("?")[1] ?? ""
  try {
    return new URLSearchParams(q.split("#")[0])
  } catch {
    return new URLSearchParams()
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).pathname.toLowerCase().replace(/\/+$/, "") || "/"
  } catch {
    return "/"
  }
}

const short = (v: string | null, n: number) => (v ? v.trim().slice(0, n) || null : null)

export function visitSource(input: VisitInput): VisitSource {
  const q = queryOf(input.path)
  const utmSource = short(q.get("utm_source"), 100)
  const utmMedium = short(q.get("utm_medium"), 100)
  const app = detectClientAppFromUA(input.userAgent ?? null)
  const host = referrerHost(input.referer)
  if (utmSource || utmMedium) return { source: categorizeServerSource(host || null, utmSource, utmMedium, app), referrer: host && !isInternalReferrer(host, input.mainDomain) ? host.slice(0, 120) : null }
  if (host && isInternalReferrer(host, input.mainDomain)) {
    const main = input.mainDomain.toLowerCase().replace(/^www\./, "")
    if (isOnePageHost(host)) return { source: "storelib", referrer: null }
    if (!hostIs(host, main) && host !== "localhost") return { source: "direct", referrer: null }
    const p = pathOf(input.referer || "")
    const own = `/community/${input.slug.toLowerCase()}`
    if (p === own || p.startsWith(`${own}/`)) return { source: "direct", referrer: null }
    if (p === "/explore" || p.startsWith("/explore/") || p === "/community") return { source: "explore", referrer: null }
    return { source: "storelib", referrer: null }
  }
  const source = categorizeServerSource(host || null, null, null, app)
  return { source, referrer: host && source !== "direct" ? host.slice(0, 120) : null }
}

/** "mobile", "tablet" or "desktop", from the browser's own signature; null when it says nothing. */
export function visitDevice(userAgent: string | null | undefined): "mobile" | "tablet" | "desktop" | null {
  return parseUserAgent(userAgent).device
}

/** The country the request came from (Vercel's x-vercel-ip-country), two capital letters, or null. */
export function visitCountry(headers: { get: (name: string) => string | null }): string | null {
  const raw = (headers.get("x-vercel-ip-country") || "").trim().toUpperCase()
  return /^[A-Z]{2}$/.test(raw) && raw !== "XX" && raw !== "T1" ? raw : null
}
