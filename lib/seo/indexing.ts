/**
 * ===========================================================================
 *  WHAT A SEARCH ENGINE IS TOLD, AND WHAT IT IS NOT
 * ===========================================================================
 * The rules every sitemap, robots.txt and robots tag in Storelib reads, in
 * one pure module so the routes and tests/sitemaps.test.ts agree:
 *
 *   A PAGE IS LISTED WHEN IT IS PUBLIC AND PUBLISHED, and not otherwise.
 *   A draft, an archived product, a site nobody published, a site whose
 *   owner switched indexing off, a preview, the editor and the app are
 *   never listed, and carry noindex where a visitor could reach them.
 *
 *   EVERY PUBLIC PAGE WITH SOMETHING ON IT IS LISTED (round 41). A OnePage
 *   is listed when it is published, shows more than a name and a photo, has
 *   no link marked sensitive, and its owner is not banned or a link farm
 *   (lib/security/spam-signals deservesIndexing). A creator page is listed
 *   once it has a published product of any kind, physical included: with
 *   none it is an empty shop. The same rules decide each page's robots tag,
 *   so the two can never disagree.
 *
 *   A LINK'S AUTHORITY IS EARNED BY PUBLISHING. An account with nothing on
 *   sale is indexed with nofollow (trustsOutboundLinks), so a farm that signs
 *   up for followed links gets none.
 *
 *   EACH HOST SPEAKS FOR ITSELF. Google treats storelib.com, every
 *   <name>.storelib.com and every connected domain as separate sites. Each
 *   serves its own robots.txt naming its own sitemap, and a sitemap lists
 *   only addresses on the host it is served from.
 *
 *   A DATE IS A REAL DATE. lastmod is a row's updated_at, or it is left
 *   out. A sitemap that says everything changed today is one Google learns
 *   to ignore.
 *
 *   IT SCALES BY CHUNKS. A sitemap may hold 50,000 addresses; Storelib's
 *   hold SITEMAP_CHUNK, and storelib.com/sitemap.xml is an index of them.
 */

import { deservesIndexing, trustsOutboundLinks, type SpamState } from "@/lib/security/spam-signals"
import { servingHost } from "@/lib/custom-domains/hostname"

/** Addresses per sitemap file. The protocol allows 50,000; smaller files are read faster. */
export const SITEMAP_CHUNK = 10_000

/** What the protocol allows one file: 50,000 addresses and 50 MB (52,428,800 bytes) uncompressed. */
export const SITEMAP_MAX_URLS = 50_000
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024

/**
 * ===========================================================================
 *  A CHUNK IS A SLICE OF THE ID SPACE, NOT AN OFFSET (round 44)
 * ===========================================================================
 * products-3-of-16.xml is every published product whose id falls in the
 * fourth sixteenth of the UUID space. The ids are random (gen_random_uuid),
 * so each slice holds count / 16 rows give or take a percent, and a slice is
 * read by seeking the primary key to its first id, then a thousand rows at a
 * time after the last id seen.
 *
 * It used to be rows 30,000 to 39,999 by offset. An offset makes the
 * database walk every row before it (the last file of five million products
 * read five million rows to serve ten thousand), and every product deleted
 * or added shifted every later file by one, so a product could be in no
 * file, or in two, depending on when each was last cached.
 *
 * The slice count is in the name, so a file never has to agree with a count
 * taken at another moment. The index names a new set when the count moves
 * past a multiple of SITEMAP_CHUNK; a name from an older index still answers
 * its slice of the same rows.
 */
export function sitemapChunks(rows: number): number {
  return Math.max(1, Math.ceil(Math.max(0, rows) / SITEMAP_CHUNK))
}

const UUID_TAIL = "-0000-0000-0000-000000000000"
/** The first id of slice k of n, or null at either end of the space. */
function sliceStart(k: number, of: number): string | null {
  if (k <= 0 || k >= of) return null
  return Math.floor((k * 2 ** 32) / of).toString(16).padStart(8, "0") + UUID_TAIL
}

/** Slice `chunk` of `of`: ids from `lo` (inclusive) to `hi` (exclusive); null is the open end. */
export function chunkIdRange(chunk: number, of: number): { lo: string | null; hi: string | null } {
  return { lo: sliceStart(chunk, of), hi: sliceStart(chunk + 1, of) }
}

/** A file's name in an index: `products-3-of-16.xml`. */
export function chunkFileName(kind: string, chunk: number, of: number): string {
  return `${kind}-${chunk}-of-${of}.xml`
}

export interface SitemapEntry {
  url: string
  /** ISO time. Left out when nothing real is known. */
  lastModified?: string | null
  /**
   * The pictures on the page, for Google Images: a product's thumbnail and
   * gallery, a creator's avatar and cover. Whatever is given is filtered to
   * real picture addresses and cut to MAX_IMAGES_PER_URL when it is written.
   */
  images?: Array<string | null | undefined>
}

/**
 * Pictures listed per address in storelib.com's sitemaps. A product gallery
 * runs to about this; the rest of a page's pictures are found by crawling it.
 */
export const MAX_IMAGES_PER_URL = 10

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }
/** The one escaping every sitemap uses, storelib.com's and each website's (lib/website-builder/site-seo.ts). */
export const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c])

const percent = (c: string) => {
  try {
    return encodeURIComponent(c)
  } catch {
    /* A lone half of a surrogate pair: the replacement character, encoded. */
    return "%EF%BF%BD"
  }
}
/* Outside printable ASCII, the characters RFC 3986 never allows bare, and a `%` that starts no escape. */
const encodeLoose = (s: string) => s.replace(/%(?![0-9A-Fa-f]{2})|[^\x21-\x7E]|["<>\\^`{|}]/gu, percent)

/**
 * An address as a sitemap must carry it (round 44): RFC 3986, so a slug in
 * another alphabet, a space or a stray `%` is percent encoded, and a host in
 * another alphabet is written in punycode. A sitemap naming
 * storelib.com/maría/café is one Search Console reports as invalid. What is
 * already encoded stays as it is, so this can run on an address twice. The
 * XML escaping (`&` as `&amp;`) comes after it, in entryXml.
 */
export function sitemapLoc(url: string): string {
  const raw = url.trim()
  const m = /^(https?:\/\/)([^/?#]*)([\s\S]*)$/i.exec(raw)
  if (!m) return encodeLoose(raw)
  let host = m[2]
  if (/[^\x21-\x7E]/.test(host)) {
    try {
      host = new URL(`${m[1]}${host}/`).host
    } catch {
      host = encodeLoose(host)
    }
  }
  return `${m[1]}${host}${encodeLoose(m[3])}`
}

/**
 * The picture addresses a sitemap may name: absolute http(s), not a video or
 * a document, each once, at most MAX_IMAGES_PER_URL. A relative path or a
 * YouTube page would be read as a broken image, and a broken image is noise
 * in an index built to find the good ones.
 */
export function sitemapImages(urls: Array<string | null | undefined> | undefined): string[] {
  const out: string[] = []
  for (const raw of urls ?? []) {
    const url = typeof raw === "string" ? raw.trim() : ""
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url) || /\.(?:mp4|webm|mov|m4v|pdf|zip)(?:[?#]|$)/i.test(url) || out.includes(url)) continue
    out.push(url)
    if (out.length >= MAX_IMAGES_PER_URL) break
  }
  return out
}

/** A time a sitemap can carry, or nothing. */
export function lastmodOf(value: string | null | undefined): string | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** The newest of several times, or null. */
export function newestOf(...values: Array<string | null | undefined>): string | null {
  let best = -Infinity
  for (const v of values) {
    const t = v ? Date.parse(v) : NaN
    if (Number.isFinite(t) && t > best) best = t
  }
  return Number.isFinite(best) ? new Date(best).toISOString() : null
}

function entryXml(tag: "url" | "sitemap", e: SitemapEntry): string {
  const mod = lastmodOf(e.lastModified)
  /* Pictures belong to a page, never to an entry of the index. */
  const images = tag === "url" ? sitemapImages(e.images) : []
  const pictures = images.map((loc) => `<image:image><image:loc>${xmlEscape(sitemapLoc(loc))}</image:loc></image:image>`).join("")
  return `<${tag}><loc>${xmlEscape(sitemapLoc(e.url))}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}${pictures}</${tag}>`
}

export function urlsetXml(entries: SitemapEntry[]): string {
  const seen = new Set<string>()
  /* Once per address as it is written, so café and caf%C3%A9 are one entry. */
  const once = (url: string) => {
    const loc = sitemapLoc(url)
    return seen.has(loc) ? false : (seen.add(loc), true)
  }
  const rows = entries.filter((e) => once(e.url)).map((e) => entryXml("url", e))
  /* The image namespace, as each website's own sitemap declares it. */
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${rows.join("\n")}\n</urlset>\n`
}

export function sitemapIndexXml(entries: SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) => entryXml("sitemap", e)).join("\n")}\n</sitemapindex>\n`
}

export function robotsTxt(input: { disallow?: string[]; sitemaps: string[]; closed?: boolean }): string {
  const lines = ["User-agent: *"]
  if (input.closed) lines.push("Disallow: /")
  else {
    lines.push("Allow: /")
    for (const d of input.disallow ?? []) lines.push(`Disallow: ${d}`)
  }
  lines.push("")
  for (const s of input.sitemaps) lines.push(`Sitemap: ${s}`)
  return `${lines.join("\n")}\n`
}

/**
 * Where storelib.com's own crawl ends: the app, the editors, the flows that
 * belong to one signed in person, and the addresses the proxy rewrites
 * built sites onto (a site is at its own host, never under storelib.com).
 */
export const PRIVATE_ROUTES: readonly string[] = [
  "admin",
  "api",
  "app",
  "auth",
  "account",
  "access",
  "checkout",
  "cover-render",
  "creator-page",
  "dashboard",
  "downloads",
  "library",
  "native-start",
  /* Round 41: the OnePage editor's preview, a wallet's return step, the payouts sheet, a buyer's case and a buyer's review link. Each says noindex as well. */
  "onepage-preview",
  "order-help",
  "pay",
  "payouts-sheet",
  "purchase",
  "receipt",
  "review",
  "site",
  "sites",
  "store",
  "store-builder",
  /* Round 44: Stripe's return step and a team invite's join page. Both say noindex as well. */
  "stripe-done",
  "team",
  "unsubscribe",
  "upgrade",
  "w",
  "website-builder",
]

/**
 * Each route three times: the route itself (`$` ends the match), the route
 * with a query, and everything under it. A bare `Disallow: /library` is a
 * PREFIX, and would also have hidden a creator called "libraryofsound" at
 * storelib.com/libraryofsound. Round 44: the query form, because
 * `/checkout$` does not match /checkout?product=… and `/checkout/` does not
 * either, so a checkout or an unsubscribe link with its token was open.
 */
export const PLATFORM_DISALLOW = [
  ...PRIVATE_ROUTES.flatMap((r) => [`/${r}$`, `/${r}?`, `/${r}/`]),
  "/explore?sort=",
  "/explore?q=",
]

/**
 * ===========================================================================
 *  A PRIVATE PAGE SAYS SO ITSELF (round 45)
 * ===========================================================================
 * robots.txt keeps crawlers off PRIVATE_ROUTES, but robots.txt is a request
 * not to fetch, not a request not to index: a checkout link shared on a
 * forum could still be listed as a bare address, and /checkout itself said
 * `index, follow` with a canonical of its own. So every private address now
 * says noindex in its own answer, twice over:
 *
 *   the X-Robots-Tag header, written by proxy.ts for every storelib.com
 *   address this matches (privatePlatformPath), redirects and route
 *   handlers included, so a page added under one of these routes later is
 *   covered without anyone remembering;
 *
 *   the robots meta, from a layout.tsx at the top of each route
 *   (lib/seo/private-metadata.ts), which also clears any canonical.
 *
 * The flows a person passes through on the way in (logging in, a reset,
 * the steps after /signup) are the same: noindex, links followed. /signup
 * itself is not here: it is the page a search for "Storelib sign up" should
 * land on, and it is in the sitemap (app/(auth)/signup/layout.tsx).
 * tests/seo-platform-r45.test.ts walks both lists.
 */
export const AUTH_FLOW_ROUTES: readonly string[] = [
  "forgot-password",
  "login",
  "logout",
  "onboarding",
  "request",
  "reset-password",
  "sell",
  "verify-email",
  "welcome",
]

/** Steps under an indexed page that are not themselves pages to index. */
const PRIVATE_SUBPATHS: readonly string[] = ["/signup/"]

/**
 * Routes private only as themselves. /sell is the sign-up entry, but
 * /sell/<use-case> are the public landing pages (app/(marketing)/sell/[slug]),
 * which are indexed and in the sitemap.
 */
const PRIVATE_ONLY_EXACT: readonly string[] = ["sell"]

/** Whether a storelib.com path is one person's step, never a page to index. */
export function privatePlatformPath(pathname: string): boolean {
  const path = (pathname || "/").toLowerCase()
  if (PRIVATE_SUBPATHS.some((p) => path.startsWith(p))) return true
  const parts = path.split("/")
  const first = parts[1] ?? ""
  if (PRIVATE_ONLY_EXACT.includes(first) && parts.slice(2).some(Boolean)) return false
  return PRIVATE_ROUTES.includes(first) || AUTH_FLOW_ROUTES.includes(first)
}

/** The header proxy.ts writes on those answers. */
export const PRIVATE_ROBOTS_HEADER = "noindex, nofollow"

/**
 * ===========================================================================
 *  WHO CRAWLS STORELIB, AND FOR WHAT (round 45)
 * ===========================================================================
 * Two kinds of crawler read public pages, and they are decided apart:
 *
 *   SEARCH     builds a search index that sends people back to the page:
 *              Google Search, Bing (which also feeds DuckDuckGo and
 *              Copilot), ChatGPT search, Perplexity, Claude's search,
 *              Apple's Siri and Spotlight. Shutting one out takes Storelib
 *              and every creator's page out of that engine's results. These
 *              stay allowed.
 *
 *   TRAINING   collects pages to train a model; it sends no visitors back.
 *              Each operator names a separate token for it, so it can be
 *              refused without leaving search.
 *
 *   USER       a fetch one person asked an assistant to make, like opening
 *              a link. Not a crawl; the operators say robots.txt may not be
 *              applied to it. Listed so the table is complete.
 *
 * TODAY EVERY ONE OF THEM IS ALLOWED, through `User-agent: *` alone, and
 * the robots.txt this writes is the one Storelib served before this table
 * existed. To refuse a crawler, set its `allowed` to false: it then gets a
 * group of its own with `Disallow: /`. A named group REPLACES `*` for that
 * crawler (it does not add to it), which is why an allowed crawler is never
 * given a group here: it would lose PLATFORM_DISALLOW. A refused crawler's
 * group needs none, since `Disallow: /` already covers them.
 *
 * Tokens as each operator documents them (checked October 2026).
 */
export type CrawlerPurpose = "search" | "training" | "user"

export interface CrawlerPolicy {
  /** The robots.txt token. */
  token: string
  operator: string
  purpose: CrawlerPurpose
  allowed: boolean
}

export const KNOWN_CRAWLERS: readonly CrawlerPolicy[] = [
  { token: "Googlebot", operator: "Google", purpose: "search", allowed: true },
  { token: "Bingbot", operator: "Microsoft", purpose: "search", allowed: true },
  { token: "OAI-SearchBot", operator: "OpenAI", purpose: "search", allowed: true },
  { token: "PerplexityBot", operator: "Perplexity", purpose: "search", allowed: true },
  { token: "Claude-SearchBot", operator: "Anthropic", purpose: "search", allowed: true },
  { token: "Applebot", operator: "Apple", purpose: "search", allowed: true },
  { token: "DuckDuckBot", operator: "DuckDuckGo", purpose: "search", allowed: true },
  /* Training. Allowed today, by the owner's current policy; each can be refused on its own. */
  { token: "GPTBot", operator: "OpenAI", purpose: "training", allowed: true },
  { token: "Google-Extended", operator: "Google", purpose: "training", allowed: true },
  { token: "ClaudeBot", operator: "Anthropic", purpose: "training", allowed: true },
  { token: "Applebot-Extended", operator: "Apple", purpose: "training", allowed: true },
  { token: "CCBot", operator: "Common Crawl", purpose: "training", allowed: true },
  { token: "meta-externalagent", operator: "Meta", purpose: "training", allowed: true },
  /* A person's own request through an assistant. */
  { token: "ChatGPT-User", operator: "OpenAI", purpose: "user", allowed: true },
  { token: "Claude-User", operator: "Anthropic", purpose: "user", allowed: true },
  { token: "Perplexity-User", operator: "Perplexity", purpose: "user", allowed: true },
]

export interface RobotsRule {
  userAgent: string | string[]
  allow?: string | string[]
  disallow?: string | string[]
}

/**
 * The groups robots.txt adds after `*` (app/robots.ts): one `Disallow: /`
 * group naming every crawler the table refuses, and nothing while all are
 * allowed. A search crawler is never caught by a training switch: each row
 * is its own token.
 */
export function refusedCrawlerRules(crawlers: readonly CrawlerPolicy[] = KNOWN_CRAWLERS): RobotsRule[] {
  const refused = crawlers.filter((c) => !c.allowed).map((c) => c.token)
  return refused.length ? [{ userAgent: refused, disallow: "/" }] : []
}

/**
 * On a built site's host: its forms' API, previews, the shop's search results,
 * the basket, and the pages drawn for one visitor (the account, signing in
 * and the Wishlist, which also say noindex). Anchored like PLATFORM_DISALLOW,
 * so a creator's own page at /cartoons, /search-tips or /accounting stays
 * crawlable. The site's /robots.txt writes these (lib/website-builder/site-seo.ts
 * robotsTxt).
 */
export const SITE_DISALLOW = [
  "/api/", "/preview/", "/search$", "/search?", "/search/", "/cart$", "/cart?", "/cart/",
  "/account$", "/account?", "/account/", "/wishlist$", "/wishlist?", "/wishlist/",
]

/**
 * What a built site's robots.txt opens again under SITE_DISALLOW's `/api/`
 * (round 44): an imported theme's stylesheets, scripts and pictures, served
 * at /api/site-theme/assets/<install>/<version>/<name>
 * (lib/storelib-theme/compat/asset-version.ts). A crawler that may not fetch
 * a page's CSS and JS draws it unstyled, and judges it on that. The longer
 * rule wins in Google's and Bing's reading of robots.txt, so the rest of
 * /api/ stays closed.
 */
export const SITE_ALLOW = ["/api/site-theme/assets/"]

/**
 * The platform's own pages, as a connected domain answers them. proxy.ts
 * passes these paths through on EVERY host (its RESERVED_PATHS, and the
 * flows it sends home to storelib.com), so links.theirname.com/app is
 * Storelib's app and /checkout is Storelib's checkout, never a page of the
 * creator's. A domain's robots.txt keeps crawlers out of them; everything
 * else on the domain is the creator's and is open. Anchored like the lists
 * above, so a product at /applesauce or /feedback is still crawled.
 * tests/custom-domains.test.ts holds this to the proxy's own list.
 */
const CUSTOM_DOMAIN_PLATFORM_PATHS = [
  "access",
  "api",
  "app",
  "checkout",
  /* A community lives at storelib.com/community/<slug>; on a creator's domain the same path is a copy. */
  "community",
  "cover-render",
  "creators",
  "dashboard",
  "explore",
  "feed",
  "library",
  "login",
  "logout",
  "marketplace",
  "native-start",
  "onboarding",
  "order-help",
  "purchase",
  "receipt",
  /* Storelib Reviews' request links: one buyer's page, never a page to index. */
  "review",
  "sell",
  "signup",
  "wishlist",
]
export const CUSTOM_DOMAIN_DISALLOW = CUSTOM_DOMAIN_PLATFORM_PATHS.flatMap((r) => [`/${r}$`, `/${r}?`, `/${r}/`])

/* ── Which pages may be listed ─────────────────────────────────────────── */

export interface ProductRowForSeo {
  status?: string | null
  archived?: boolean | null
  slug?: string | null
}

/** A product page is listed when it is published, not archived and has an address. */
export function productIndexable(p: ProductRowForSeo, handle: string | null | undefined, spamState?: SpamState): boolean {
  if (p.status !== "published" || p.archived === true || !p.slug) return false
  /* A farm's decoy listing does not buy its handle an indexed product either. */
  return handle ? deservesIndexing({ handle, spamState }) : true
}

/**
 * A creator page: the storefront's own robots rule, word for word. It is a
 * shop, so it needs something in it: one published product, of any type
 * (round 41: physical products count; the sitemap used to count only the
 * others while the page counted all of them).
 */
export function creatorIndexable(input: { publishedProducts: number; handle: string | null | undefined; spamState?: SpamState }): boolean {
  return !!input.handle && input.publishedProducts >= 1 && deservesIndexing({ handle: input.handle, spamState: input.spamState })
}

/**
 * A OnePage (round 41): published, under a handle, and its owner is not a
 * link farm. No product is needed: a OnePage is often a creator's whole
 * presence. The page adds what only it can see (lib/onepage/page-presence):
 * it shows more than a name and a photo, and no link on it is marked
 * sensitive. The owner's ban is the caller's (lib/seo/bans.ts).
 */
export function onePageIndexable(input: {
  status: string | null | undefined
  handle: string | null | undefined
  spamState?: SpamState
}): boolean {
  return input.status === "published" && !!input.handle && deservesIndexing({ handle: input.handle, spamState: input.spamState })
}

/**
 * The robots answer for a page of an account: not indexable is noindex and
 * nofollow; indexable follows its links only when the account has earned it
 * (trustsOutboundLinks). Page level, so every link on the page is covered,
 * those inside embeds and blocks added later too.
 */
export function pageRobots(input: { indexable: boolean; publishedProducts: number; spamState?: SpamState }): { index: boolean; follow: boolean } {
  if (!input.indexable) return { index: false, follow: false }
  return { index: true, follow: trustsOutboundLinks({ publishedProducts: input.publishedProducts, spamState: input.spamState }) }
}

/**
 * The site's own "Allow search indexing" setting, read the way
 * lib/website-builder/theme-metadata.ts reads it: `false`, or a string
 * containing noindex, keeps the whole site out.
 */
export function websiteIndexable(settings: Record<string, unknown> | null | undefined): boolean {
  const v = settings?.seo_robots
  if (v === false) return false
  if (typeof v === "string" && /noindex/i.test(v)) return false
  return true
}

/**
 * A built site may be listed: its creator's own switch is on, and it is not
 * under a handle the spam rules hold back. ONE RULE for the site's own
 * robots.txt and sitemap (lib/website-builder/site-seo-data.ts siteSeo), the
 * robots tag on each of its pages, and storelib.com's websites sitemap. They
 * used to be three: the site's sitemap left a farm's handle out while its
 * pages said index and storelib.com's sitemap listed it.
 */
export function builtSiteIndexable(settings: Record<string, unknown> | null | undefined, handle: string | null | undefined, spamState?: SpamState): boolean {
  return websiteIndexable(settings) && !!handle && deservesIndexing({ handle, spamState })
}

/* ── A built site's address ───────────────────────────────────────────── */

/**
 * The one origin a built site is canonical at. A connected, active domain
 * wins, at the `www.` host the proxy sends the bare domain to; otherwise the
 * creator's storelib.com subdomain.
 */
export function siteOrigin(input: { handle: string; customDomain?: string | null; mainDomain: string }): string {
  const domain = input.customDomain?.trim().toLowerCase().replace(/\.$/, "")
  /* www for an apex; a connected subdomain (shop.theirname.com) as it is. */
  if (domain) return `https://${servingHost(domain)}`
  return `https://${input.handle.toLowerCase()}.${input.mainDomain}`
}

