import { POLICY_PAGES } from "./policy-pages"
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
  /**
   * The account pages every website has (lib/website-builder/account-pages):
   * /account and /account/login for a visitor's own account, and /wishlist
   * for what they saved. A page a creator made under one of these names
   * would sit behind the real one and could never be reached.
   */
  "account",
  "login",
  "wishlist",
  /* Every collection, Shopify's list-collections page. /collections/<handle> is a collection's own. */
  "collections",
  /* The page a website shows while it asks for a password (lib/site-password). */
  "password",
])

/**
 * What a page key may look like. Same shape as `pageSlugError` in
 * lib/sites/slug.ts, which is what the editor makes a key with: lowercase
 * letters, digits and hyphens, starting with a letter or digit, up to 63
 * characters.
 */
const PAGE_KEY = /^[a-z0-9](?:[a-z0-9-]{0,62})$/

/** Whether a key has that shape, exactly as given. Reserved names are the caller's question. */
export function isPageKey(key: string): boolean {
  return PAGE_KEY.test(key)
}

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
  /* The collection template is drawn as "collection" on /collections/<handle>, so the canvas says the same. */
  if (pageKey === "collection") return "collection"
  return pageKey === "home" ? "index" : `page.${pageKey}`
}

/** "about" reads as About, "size-guide" as Size guide. */
export function pageTitleFromKey(key: string): string {
  /**
   * A policy page has a NAME, not a de-hyphenated key. Left to the rule
   * below, "terms-of-service" became "Terms of service" in the switcher
   * while the footer linked to "Terms Of Service", which is two names for
   * one page and the sort of thing nobody reports and everybody notices.
   */
  const policy = POLICY_PAGES.find((p) => p.key === key)
  if (policy) return policy.title
  /* "products" is the shop; nobody calls it Products in a menu. */
  if (key === "products") return "Shop"
  if (key === NOT_FOUND_PAGE_KEY) return "Page not found"
  /* The sign in page's key is one word; its name is two. */
  if (key === "login") return "Sign in"
  if (key === "password") return "Password page"

  const words = key.replace(/-/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The page a visitor gets at an address the site does not have. Not an
 * address itself: "404" is reserved above, so `/404` is one more address
 * the site does not have, and shows this page like any other.
 */
export const NOT_FOUND_PAGE_KEY = "404"

/**
 * The pages the site has without anybody making them. The shop, the search
 * results and the 404 page are generated from the home page's chrome plus
 * one section each, and become stored pages the moment a creator edits
 * them; they stay reserved above so nobody can also make a page BY that name.
 *
 * So are the visitor's account, its sign in page, the wishlist and the
 * contact page (lib/website-builder/account-pages). Contact is the one a
 * creator could always make by hand, which is why it is not reserved: a
 * stored contact page is served as it is, and a site without one gets the
 * generated page instead of a 404.
 */
export const GENERATED_PAGE_KEYS: ReadonlySet<string> = new Set(["products", "search", "404", "account", "login", "wishlist", "contact", "password", "collections", "collection"])

/** The pages the theme ships with. Everything else is one a person made. */
export const BUILT_IN_PAGE_KEYS: ReadonlySet<string> = new Set(["home", "product", "about", "contact", "products", "search", "404", "account", "login", "wishlist", "password", "collections", "collection"])

/**
 * Where a page is served, when that is not `/<key>`: the sign in page is
 * under the account, the way every shop has it.
 */
export function pagePath(key: string): string {
  if (key === "home") return "/"
  /* The template every collection is drawn with has no address of its own; its nearest is the list of them. */
  if (key === "collection") return "/collections"
  if (key === "login") return "/account/login"
  return `/${key}`
}
