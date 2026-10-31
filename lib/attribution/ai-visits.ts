/**
 * ===========================================================================
 *  VISITS TO STORELIB'S OWN PAGES FROM AN AI ASSISTANT, COUNTED HERE
 * ===========================================================================
 * Pure, for the browser and the server alike. storelib.com's own pages (the
 * home page, pricing, the blog, the alternatives pages) are not storefront
 * pages, so analytics_events never had them: Vercel Web Analytics counted
 * them, and the admin could not join "ChatGPT sent 120 visits to
 * /alternatives/gumroad" to the sign ups that followed. Now a visit that
 * lands on one of them with an assistant named (lib/attribution/ai-sources)
 * adds one to a daily count, platform_ai_visits (SQL part 347), by day,
 * assistant and landing path. Nothing else: no visitor, no address, no user
 * agent, no cookie. A count, never a row per person.
 *
 *   WHO SENDS IT     components/attribution/capture-platform-touch.tsx, once
 *                    per tab session per assistant and landing, only with a
 *                    yes to analytics, never in a frame, a preview or /admin
 *                    (lib/attribution/ai-visit-browser.ts).
 *   WHERE IT GOES    POST AI_VISIT_ROUTE, which always answers 204.
 *   WHICH PATHS      aiVisitPath below: Storelib's own public pages only.
 *   WHICH ASSISTANT  aiVisitSource below.
 */
import { aiSourceOfUtm, isAiSourceKey, type AiSourceKey } from "./ai-sources"
import { privatePlatformPath } from "@/lib/seo/indexing"

export const AI_VISIT_ROUTE = "/api/track/ai-visit"

/** What the admin panel says about where these numbers come from. */
export const AI_VISITS_LABEL = "Counted by Storelib, visitors who accepted analytics, where the assistant is known."

export const MAX_AI_VISIT_PATH = 200

/**
 * STORELIB'S OWN PUBLIC PAGES, by their first segment. A list of what is
 * counted rather than of what is not, because storelib.com also serves every
 * creator (storelib.com/<handle>, /p/<slug>, /c/<slug>, /community/<slug>,
 * /u/<name>): those are storefront pages, already counted in
 * analytics_events with the creator's own consent rules, and a creator's
 * page is never part of Storelib's marketing funnel. tests/ai-visits-r46
 * holds every name here to a folder under app/.
 *
 *   ""            the home page
 *   community     only the page itself; /community/<slug> is a creator's
 *   sell          only /sell/<use case>; /sell itself is the sign up step
 *                 (privatePlatformPath says so)
 */
export const MARKETING_SECTIONS: readonly string[] = [
  "",
  "alternatives",
  "blog",
  "community",
  "developers",
  "editions",
  "explore",
  "faq",
  "features",
  "help",
  "legal",
  "pricing",
  "privacy",
  "sell",
  "signup",
  "terms",
  "themes",
]

/** Sections whose own page is Storelib's but whose pages under it are a creator's. */
const SECTION_ONLY: readonly string[] = ["community"]

/** Steps under a public page that are one person's, never a landing page. */
const PRIVATE_UNDER: readonly RegExp[] = [/^\/signup\//, /^\/explore\/search(\/|$)/, /^\/help\/search(\/|$)/]

/**
 * A landing path as it is counted, or null when it is not one of Storelib's
 * own public pages. No query string and no hash (cut off, never kept),
 * lower case, no trailing slash, at most MAX_AI_VISIT_PATH characters, and
 * only the characters an address of ours uses. Refused outright: anything
 * privatePlatformPath calls private (/api, /admin, /app, /checkout, the
 * sign in steps and the rest), /_next, /preview, a file (a dot in the last
 * segment), two slashes, a dot segment, and a path that arrived with a query
 * or a hash on it when `strict` is set (the beacon sends a bare path, so a
 * query in it means it was not sent by our page).
 */
export function aiVisitPath(raw: unknown, opts: { strict?: boolean } = {}): string | null {
  if (typeof raw !== "string") return null
  let path = raw.trim()
  if (!path.startsWith("/") || path.startsWith("//")) return null
  if (opts.strict && /[?#]/.test(path)) return null
  path = path.split("#")[0].split("?")[0]
  try {
    path = decodeURIComponent(path)
  } catch {
    return null
  }
  path = path.toLowerCase()
  if (path.length > 1) path = path.replace(/\/+$/, "")
  if (!path) path = "/"
  if (path.length > MAX_AI_VISIT_PATH) return null
  if (!/^\/[a-z0-9\-_/]*$/.test(path)) return null
  if (path.includes("//")) return null
  if (privatePlatformPath(path)) return null
  if (PRIVATE_UNDER.some((re) => re.test(path))) return null
  const parts = path.split("/")
  const first = parts[1] ?? ""
  if (!MARKETING_SECTIONS.includes(first)) return null
  if (SECTION_ONLY.includes(first) && parts.length > 2) return null
  return path
}

/**
 * ===========================================================================
 *  WHICH ASSISTANT, DECIDED ON THE SERVER
 * ===========================================================================
 * The visit's own referrer (chatgpt.com) is document.referrer in the page,
 * and it never reaches the server again: the beacon is a second request,
 * from the storelib.com page to storelib.com, so its Referer header is the
 * landing page itself (Storelib's Referrer-Policy, strict-origin-when-cross-
 * origin, sends the whole address to its own origin). So:
 *
 *   1. utm_source on that landing address, read from the Referer header.
 *      ChatGPT search tags its links utm_source=chatgpt.com; when the tag
 *      names an assistant, that assistant is counted whatever the page
 *      said, the same "the tag wins" rule as aiSourceOf.
 *   2. Otherwise the page's own label, but only a key from the known list
 *      (isAiSourceKey). It is the one thing that saw the referrer; a browser
 *      or extension that strips the Referer on the second hop takes the tag
 *      away too, and the visit is still from the assistant the page saw.
 *      A word that is not on the list is never counted, so a caller cannot
 *      invent an assistant, only add one to a real one's count, and the
 *      address limit (rateLimit, bucket "ai-visit") bounds that.
 *   3. Otherwise nothing is counted.
 */
export function aiVisitSource(input: { refererUrl: URL | null; clientSource: unknown }): AiSourceKey | null {
  const tagged = aiSourceOfUtm(input.refererUrl?.searchParams.get("utm_source") ?? null)
  if (tagged) return tagged.key
  return isAiSourceKey(input.clientSource) ? input.clientSource : null
}

/** A host as compared here: lower case, no port, no trailing dot, no www. */
export function bareHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().split(":")[0].replace(/\.$/, "").replace(/^www\./, "")
}

/**
 * Whether a host is storelib.com itself, where these visits are counted.
 * Not a creator's subdomain or own domain, and not a preview deployment on
 * vercel.app, whose test visits are not Storelib's traffic. localhost only
 * outside production, for trying it.
 */
export function countedHost(host: string | null | undefined, mainDomain: string, production: boolean): boolean {
  const h = bareHost(host)
  if (!h) return false
  if (h === bareHost(mainDomain)) return true
  return !production && (h === "localhost" || h === "127.0.0.1")
}

/** The key one beacon is sent once for, per tab session. */
export function aiVisitKey(source: AiSourceKey, path: string): string {
  return `${source}|${path}`
}
