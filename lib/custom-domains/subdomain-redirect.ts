/**
 * ===========================================================================
 *  THE STORELIB ADDRESS SENDS VISITORS TO THE WEBSITE'S OWN DOMAIN
 * ===========================================================================
 * Once a website's primary domain is connected with HTTPS (Website settings
 * › Domains; `custom_domains` purpose 'website', is_primary, status
 * 'active'), a visit to `<name>.storelib.com` is sent there, path and query
 * kept, the way Shopify sends `<shop>.myshopify.com` to the primary domain.
 * One address collects the links and the search results, and a buyer never
 * sees the shop at two addresses.
 *
 * ONLY A PAGE A PERSON OPENS (GET or HEAD). Never:
 *   /api, /_next          the site's own calls and Next's files
 *   a file (/x.js, robots.txt, sitemap.xml)
 *   /checkout, /receipt   a payment under way, its thank you page and its
 *                         receipt stay on the host the cart was filled on
 *   /review/              a Storelib Reviews link already sent by email
 *   /preview/, ?preview=  the creator's own unpublished preview
 *   a framed request      the wishlist the theme frames (sl_embed), and any
 *                         page the builder draws in a frame
 *
 * 302, not 301: a browser keeps a 301 for good, so a creator who removes the
 * domain would leave visitors' browsers sending them to an address that no
 * longer answers. The pages' canonical already names the domain
 * (lib/website-builder/site-seo-data.ts siteOrigin), which is what a search
 * engine follows.
 */

const SKIP_PREFIXES = ["/api/", "/_next/", "/checkout", "/receipt", "/review/", "/preview/"]

export function sendsToDomain(req: { method: string; pathname: string; search: string; fetchDest?: string | null }): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false
  const p = req.pathname
  if (p === "/api" || SKIP_PREFIXES.some((x) => p === x.replace(/\/$/, "") || p.startsWith(x))) return false
  if (/\.[a-z0-9]{1,8}$/i.test(p)) return false
  if (req.fetchDest === "iframe") return false
  const q = new URLSearchParams(req.search.startsWith("?") ? req.search.slice(1) : req.search)
  if (q.has("preview") || q.has("sl_embed")) return false
  return true
}

/** Where the visit goes: the domain's own address, the path and query as they were. */
export function domainAddress(host: string, pathname: string, search: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `https://${host}${path}${search}`
}
