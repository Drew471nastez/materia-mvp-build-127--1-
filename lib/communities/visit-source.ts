/**
 * ===========================================================================
 *  HOW A VISITOR ARRIVED AT A COMMUNITY, IN ONE WORD
 * ===========================================================================
 * Pure, so the route that records a visit (app/api/community/<id>/visit,
 * through lib/communities/server/record-view.ts) and the tests read the
 * same answer. A community's Analytics lists its visits by these words
 * (components/community/creator/analytics-section.tsx), counted once a
 * visitor a day (SQL part 184).
 *
 * The rules are Storelib Analytics' own (lib/analytics/sources.ts
 * categorizeServerSource): a link's utm_source and utm_medium win (or its
 * ?ref= when it has no utm tags), then the site that sent the visitor
 * (email, social, search, anything else a referral with its host kept),
 * then an in-app browser with no referrer, then the click id an ad or a
 * network added to the address. A community adds three of its own,
 * because most of its visitors come from Storelib itself:
 *
 *   explore    Storelib's Explore, or the list of communities
 *   storelib   any other Storelib page: the creator's page, a product, a
 *              OnePage, another community
 *   app        anything opened inside the Storelib app (round 33), whatever
 *              Storelib page it was opened from
 *
 * A move inside the same community (a post, a space, back to the home, any
 * page of the community's own domain) and the payment page a buyer returns
 * from are "direct": they say where the visitor just was, not how they came.
 */
import { categorizeServerSource, detectClientAppFromUA, hostIs, isInternalReferrer, referrerHost } from "@/lib/analytics/sources"
import { isOnePageHost } from "@/lib/onepage/address"
import { isBotAgent, parseUserAgent } from "@/lib/analytics/user-agent"

export interface VisitInput {
  /** The page the visitor was on before: the Referer the page's own request carried. */
  referer: string | null | undefined
  /** The page's own path and query ("/community/clay?utm_source=ig"). */
  path: string | null | undefined
  /** The community's address word. */
  slug: string
  mainDomain: string
  userAgent?: string | null
  /**
   * The host the page was served on (round 33). On the community's own
   * domain (club.maralind.com) a referrer from that same host is a move
   * inside the community, never a referral from itself.
   */
  pageHost?: string | null
}

export interface VisitSource {
  /** "direct", "organic_search", "social_instagram", "email", "referral", "explore", "storelib", "app"... */
  source: string
  /** The site that sent the visitor, or the name a tagged link gave itself; null for Storelib's own pages and direct visits. */
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

/** A tag a link gave itself (utm_source=ig, ref=newsletter): letters, digits, spaces and . _ - only, so nothing else is kept. */
function tagOf(v: string | null): string | null {
  const t = short(v, 100)?.toLowerCase() ?? null
  return t && /^[a-z0-9][a-z0-9._ -]*$/.test(t) ? t : null
}

/**
 * THE CLICK IDS AN AD OR A NETWORK ADDS to the address on its way out, read
 * for a visit with no referrer and no tag: an in-app browser that sent
 * nothing else still says where it came from this way.
 */
const CLICK_IDS: [param: string, source: string][] = [
  ["gclid", "paid_search"],
  ["gbraid", "paid_search"],
  ["wbraid", "paid_search"],
  ["msclkid", "paid_search"],
  ["fbclid", "social_facebook"],
  ["igshid", "social_instagram"],
  ["igsh", "social_instagram"],
  ["ttclid", "social_tiktok"],
  ["twclid", "social_x"],
  ["li_fat_id", "social_linkedin"],
]

/** Storelib's own app: the Capacitor shell's signature (capacitor.config.ts appendUserAgent). */
export function isStorelibApp(userAgent: string | null | undefined): boolean {
  return /Capacitor|StorelibApp/.test(userAgent || "")
}

export function visitSource(input: VisitInput): VisitSource {
  const q = queryOf(input.path)
  const utmSource = tagOf(q.get("utm_source"))
  const utmMedium = tagOf(q.get("utm_medium"))
  /* ?ref= is a source too (lib/orders/checkout-origin reads it the same way), when there are no utm tags. */
  const ref = utmSource || utmMedium ? null : tagOf(q.get("ref"))
  const app = detectClientAppFromUA(input.userAgent ?? null)
  const host = referrerHost(input.referer)
  const main = input.mainDomain.toLowerCase().replace(/^www\./, "")
  const page = (input.pageHost || "").toLowerCase().split(":")[0].replace(/^www\./, "")
  /* The community's own domain: neither storelib.com nor a local address. */
  const ownDomain = !!page && !hostIs(page, main) && page !== "localhost" && page !== "127.0.0.1"
  const internal = !!host && ((ownDomain && host === page) || isInternalReferrer(host, input.mainDomain))
  if (utmSource || utmMedium || ref) {
    const source = categorizeServerSource(internal ? null : host || null, utmSource ?? ref, utmMedium, app)
    const site = host && !internal ? host : (utmSource ?? ref)
    return { source, referrer: site ? site.slice(0, 120) : null }
  }
  if (host && !internal) {
    const source = categorizeServerSource(host, null, null, app)
    return { source, referrer: source === "direct" ? null : host.slice(0, 120) }
  }
  /* Inside the Storelib app every visit came through the app: Explore, a notification, another community's feed. */
  if (isStorelibApp(input.userAgent)) return { source: "app", referrer: null }
  if (host) {
    /* A page of the community's own domain, or a Storelib host that is not storelib.com (a payment page, a preview): a move, not a source. */
    if (ownDomain && host === page) return { source: "direct", referrer: null }
    if (isOnePageHost(host)) return { source: "storelib", referrer: null }
    if (!hostIs(host, main) && host !== "localhost") return { source: "direct", referrer: null }
    const p = pathOf(input.referer || "")
    const own = `/community/${input.slug.toLowerCase()}`
    if (p === own || p.startsWith(`${own}/`)) return { source: "direct", referrer: null }
    if (p === "/explore" || p.startsWith("/explore/") || p === "/community") return { source: "explore", referrer: null }
    return { source: "storelib", referrer: null }
  }
  /* No referrer: an in-app browser says which app it is, and a click id what sent it. */
  const fromApp = categorizeServerSource(null, null, null, app)
  if (fromApp !== "direct") return { source: fromApp, referrer: null }
  for (const [param, source] of CLICK_IDS) if (q.get(param)) return { source, referrer: null }
  return { source: "direct", referrer: null }
}

/**
 * A PERSON'S BROWSER, NOT A PROGRAM (round 33). A page view is counted from
 * the page's own script (components/community/public/visit-beacon.tsx), so
 * crawlers that run no script never reach it; the ones that do (link
 * previews, uptime checks, headless browsers) are told apart by their
 * signature (lib/analytics/user-agent isBotAgent). Every browser a person
 * uses, the Storelib app included, starts its signature with Mozilla/ (an
 * old Opera with Opera/); a fetcher such as WhatsApp's link preview
 * ("WhatsApp/2.23") does not.
 */
export function isPersonBrowser(userAgent: string | null | undefined): boolean {
  const ua = (userAgent || "").trim()
  if (!ua || isBotAgent(ua)) return false
  return /^(mozilla|opera)\//i.test(ua)
}

/**
 * "mobile", "tablet" or "desktop", from the browser's own signature; null
 * when it says nothing. An iPad asks for the desktop site by default and
 * signs itself as a Mac, so the page's script says whether the screen takes
 * touches (`touchPoints`, navigator.maxTouchPoints): a Mac with a touch
 * screen is an iPad.
 */
export function visitDevice(userAgent: string | null | undefined, touchPoints?: number | null): "mobile" | "tablet" | "desktop" | null {
  const device = parseUserAgent(userAgent).device
  if (device === "desktop" && /macintosh/i.test(userAgent || "") && typeof touchPoints === "number" && touchPoints > 1) return "tablet"
  return device
}

/**
 * The edge's country headers, in order: Vercel's (where Storelib runs),
 * then the names other edges give the same thing, so a move behind another
 * CDN keeps counting.
 */
export const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "cloudfront-viewer-country", "x-country-code"] as const
/** Not a country: unknown (XX, ZZ), Tor (T1), and the regions some lookups answer when they cannot tell (EU, AP, A1, A2, O1). */
const NOT_A_COUNTRY = new Set(["XX", "ZZ", "T1", "EU", "AP", "A1", "A2", "O1"])

/** The country the request came from, two capital letters, or null. */
export function visitCountry(headers: { get: (name: string) => string | null }): string | null {
  for (const name of COUNTRY_HEADERS) {
    const raw = (headers.get(name) || "").trim().toUpperCase()
    if (/^[A-Z]{2}$/.test(raw) && !NOT_A_COUNTRY.has(raw)) return raw
  }
  return null
}
