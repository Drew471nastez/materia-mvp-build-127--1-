/**
 * ===========================================================================
 *  WHICH PAGE OF A SITE AN ADDRESS ASKS FOR
 * ===========================================================================
 * A built site is more than its front page: the builder has always offered
 * an About page, a Contact page and pages a creator makes themselves, each
 * stored under a `page_key`. `<name>.storelib.com/about` is that key in a
 * URL, so this is the one place that turns one into the other.
 *
 * Pure on purpose, so the rules can be tested by running them rather than by
 * reading the route that uses them.
 */

/**
 * Page keys that are not addresses on the site.
 *
 * `home` IS the site and lives at `/`. `product` is the template a product
 * is drawn with, served from /products/<slug> with an actual product in
 * hand; at `/product` it would be a product page with no product. The rest
 * are names the platform may want later, refused now rather than published
 * under and taken away afterwards.
 */
export const RESERVED_PAGE_KEYS: ReadonlySet<string> = new Set([
  "home",
  "product",
  "index",
  "collection",
  "cart",
  "search",
  "404",
  /**
   * And the addresses the platform answers on a creator's own host: the
   * shop index, the API the site's own forms post to, and the flows that go
   * to the apex because the session lives there. See PLATFORM_APEX_PATHS in
   * proxy.ts. A page made under one of these names could never be reached,
   * so it is refused when it is made rather than found missing later.
   */
  "products",
  "api",
  // `/preview/<token>` is where an unpublished site is shown; a page at
  // /preview would sit next to it and read as part of it.
  "preview",
  "checkout",
  "purchase",
  "receipt",
  "access",
])

/**
 * What a page key may look like. Same shape as `pageSlugError` in
 * lib/sites/slug.ts, which is what the editor makes a key with: lowercase
 * letters, digits and hyphens, starting with a letter or digit, up to 63
 * characters.
 */
const PAGE_KEY = /^[a-z0-9](?:[a-z0-9-]{0,62})$/

/**
 * The path segment a visitor typed, as a page key, or null when it is not
 * one. Null means 404: a segment that is not a legal key cannot name a page
 * in the database, so there is nothing to look up.
 */
export function pageKeyFromSegment(segment: string): string | null {
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    // A malformed escape is not a page key. Fall through to the shape test,
    // which refuses it.
  }
  const key = decoded.toLowerCase()
  if (!PAGE_KEY.test(key)) return null
  if (RESERVED_PAGE_KEYS.has(key)) return null
  return key
}

/**
 * What a section reads as `page.template`. "index" for the front page and
 * `page.<key>` for the rest, which is the shape `allowed_templates` is
 * written against.
 */
export function templateForPage(pageKey: string): string {
  return pageKey === "home" ? "index" : `page.${pageKey}`
}

/** "about" reads as About, "size-guide" as Size guide. */
export function pageTitleFromKey(key: string): string {
  const words = key.replace(/-/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The pages the theme ships with. Everything else is one a person made. */
export const BUILT_IN_PAGE_KEYS: ReadonlySet<string> = new Set(["home", "product", "about", "contact"])
