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

/** Addresses per sitemap file. The protocol allows 50,000; smaller files are read faster. */
export const SITEMAP_CHUNK = 10_000

export interface SitemapEntry {
  url: string
  /** ISO time. Left out when nothing real is known. */
  lastModified?: string | null
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }
export const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c])

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
  return `<${tag}><loc>${xmlEscape(e.url)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}</${tag}>`
}

export function urlsetXml(entries: SitemapEntry[]): string {
  const seen = new Set<string>()
  const rows = entries.filter((e) => (seen.has(e.url) ? false : (seen.add(e.url), true))).map((e) => entryXml("url", e))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`
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

/** On a built site's host: its forms' API, previews and the shop's search results. */
export const SITE_DISALLOW = ["/api/", "/preview/", "/search$", "/search?", "/search/", "/cart$", "/cart?", "/cart/"]

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

/* ── A built site's address ───────────────────────────────────────────── */

/**
 * The one origin a built site is canonical at. A connected, active domain
 * wins, at the `www.` host the proxy sends the bare domain to; otherwise the
 * creator's storelib.com subdomain.
 */
export function siteOrigin(input: { handle: string; customDomain?: string | null; mainDomain: string }): string {
  const domain = input.customDomain?.trim().toLowerCase().replace(/\.$/, "")
  if (domain) return `https://${domain.startsWith("www.") ? domain : `www.${domain}`}`
  return `https://${input.handle.toLowerCase()}.${input.mainDomain}`
}

