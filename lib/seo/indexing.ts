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
 *   SEO SURFACE IS EARNED BY PUBLISHING. A creator page is listed once its
 *   owner has a published product and the handle is not a link farm's
 *   (lib/security/spam-signals deservesIndexing). The same rule decides the
 *   page's robots tag, so the two can never disagree.
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

import { deservesIndexing } from "@/lib/security/spam-signals"
import { servingHost } from "@/lib/custom-domains/hostname"

/** Addresses per sitemap file. The protocol allows 50,000; smaller files are read faster. */
export const SITEMAP_CHUNK = 10_000

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
  const pictures = images.map((loc) => `<image:image><image:loc>${xmlEscape(loc)}</image:loc></image:image>`).join("")
  return `<${tag}><loc>${xmlEscape(e.url)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}${pictures}</${tag}>`
}

export function urlsetXml(entries: SitemapEntry[]): string {
  const seen = new Set<string>()
  const rows = entries.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true))).map((e) => entryXml("url", e))
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
const PRIVATE_ROUTES = [
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
  "purchase",
  "receipt",
  "site",
  "sites",
  "store",
  "store-builder",
  "unsubscribe",
  "upgrade",
  "w",
  "website-builder",
]

/**
 * Each route twice: the route itself (`$` ends the match) and everything
 * under it. A bare `Disallow: /library` is a PREFIX, and would also have
 * hidden a creator called "libraryofsound" at storelib.com/libraryofsound.
 */
export const PLATFORM_DISALLOW = [
  ...PRIVATE_ROUTES.flatMap((r) => [`/${r}$`, `/${r}/`]),
  "/explore?sort=",
  "/explore?q=",
]

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
export function productIndexable(p: ProductRowForSeo, handle: string | null | undefined): boolean {
  if (p.status !== "published" || p.archived === true || !p.slug) return false
  /* A farm's decoy listing does not buy its handle an indexed product either. */
  return handle ? deservesIndexing({ publishedProducts: 1, handle }) : true
}

/** A creator page: the storefront's own robots rule, word for word. */
export function creatorIndexable(input: { publishedProducts: number; handle: string | null | undefined }): boolean {
  return !!input.handle && deservesIndexing({ publishedProducts: input.publishedProducts, handle: input.handle })
}

/**
 * A OnePage: published, and its owner passes the creator page's rule. The
 * sitemap lists a OnePage only beside a creator page it lists, so the page's
 * robots tag asks the same question; a page of outbound links is exactly what
 * a link farm signs up for.
 */
export function onePageIndexable(input: {
  status: string | null | undefined
  publishedProducts: number
  handle: string | null | undefined
}): boolean {
  return input.status === "published" && creatorIndexable(input)
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
export function builtSiteIndexable(settings: Record<string, unknown> | null | undefined, handle: string | null | undefined): boolean {
  return websiteIndexable(settings) && !!handle && deservesIndexing({ publishedProducts: 1, handle })
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

