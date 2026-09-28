/**
 * URL Helpers for subdomain-based routing
 *
 * URL Structure:
 * - username.storelib.com         -> the WEBSITE they built
 * - storelib.com/{username}       -> Seller store homepage
 * - storelib.me/{username}        -> Seller OnePage (lib/onepage/address)
 * - username.storelib.com/p/slug  -> Product page (on seller's subdomain)
 *
 * Internal routes (still work for compatibility):
 * - /u/{username}      -> Seller store homepage (308 to /{username})
 * - /{username}/links  -> the route the OnePage renders from; on storelib.com
 *                         it answers 308 to storelib.me/{username}
 * - /l/{slug}          -> 308 to storelib.me/{slug}
 * - /p/{slug}          -> Product page
 *
 * Capacitor (native app):
 * - Always returns internal paths to avoid cross-domain navigation
 *   which would lose the native auth session stored in SharedPreferences.
 */

import { isNativeApp } from "@/lib/platform-utils"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { servingHost } from "@/lib/custom-domains/hostname"
import { getOnePageDomain, isOnePageHost, onePageUrl, onePageUrlDisplay } from "@/lib/onepage/address"

export { getOnePageDomain, isOnePageHost, onePageUrl, onePageUrlDisplay }

// Main domain from environment or default
export const getMainDomain = () => process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

// Site URL from environment (used for fallback)
const getSiteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"

/**
 * Get the canonical site URL for auth redirects
 * Always returns the correct production domain (storelib.com) regardless of which domain the user is currently on
 * This prevents OAuth redirects to old/deprecated domains
 */
export function getCanonicalSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"
}

/**
 * Get the base URL for a seller's store (subdomain format)
 * @param username - The seller's username
 * @returns Full URL like "https://username.storelib.com"
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE CREATOR PAGE IS storelib.com/<name>. THE WEBSITE IS <name>.storelib.com.
 * ═══════════════════════════════════════════════════════════════════════════
 * getWebsiteUrl already says this, at length, and these three helpers said the
 * opposite: they returned the SUBDOMAIN for the creator page, so the two
 * helpers handed out byte-identical URLs and the page's real address appeared
 * nowhere in the product. Quick access printed
 *
 *     Creator page   https://andrewrullz.storelib.com
 *     Website        andrewrullz.storelib.com
 *
 * which is one address under two names, and the creator page — the profile
 * with the products and the follow button, served by
 * app/(marketing)/[sellername] — could not be copied at all.
 *
 * The native branch of getStoreUrl was already right: it returns `/<name>`,
 * the apex path, because that is the route. Only the web branch disagreed.
 */
export function getStoreUrl(username: string): string {
  if (!username) return getSiteUrl()

  // Sanitize username for URL: replace spaces with hyphens, remove special chars
  const sanitizedUsername = username
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')  // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '')  // Remove any chars that aren't alphanumeric or hyphen
    .replace(/-+/g, '-')  // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, '')  // Remove leading/trailing hyphens

  if (!sanitizedUsername) return getSiteUrl()

  // In Capacitor, use internal paths to avoid cross-domain navigation
  // which loses the native auth session (SharedPreferences are app-scoped,
  // but navigating to a subdomain reloads the page under a different origin).
  if (isNativeApp()) {
    return `/${sanitizedUsername}`
  }

  const mainDomain = getMainDomain()
  const protocol = mainDomain.includes("localhost") ? "http" : "https"

  // Handle localhost for development
  if (mainDomain.includes("localhost")) {
    // In development, use path-based routing as fallback
    return `${getSiteUrl()}/u/${sanitizedUsername}`
  }

  return `${protocol}://${mainDomain}/${sanitizedUsername}`
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ONEPAGE IS storelib.me/{handle}
 * ═══════════════════════════════════════════════════════════════════════════
 * It was `username.storelib.com/links` (a 404 once the subdomain became the
 * website), then `storelib.com/{handle}/links`, which works and is too long
 * for a bio. The address handed out now is `storelib.me/{handle}`, built by
 * lib/onepage/address onePageUrl, and both older addresses answer with a
 * permanent redirect to it (lib/onepage/host-route).
 *
 * In the native shell this is still the internal path: the app loads
 * storelib.com, and a hop to another origin loses the session it keeps.
 *
 * @param username - The seller's username (same as onepage slug in most cases)
 * @returns Full URL like "https://storelib.me/username"
 */
export function getLinksUrl(username: string): string {
  if (!username) return getSiteUrl()

  const handle = username.toLowerCase()

  /* In the native shell, a path: a cross-origin hop loses the session. */
  if (isNativeApp()) return getLinksInternalPath(handle)

  return onePageUrl(handle)
}

/**
 * Get the URL for a product on a seller's store
 * @param username - The seller's username
 * @param productSlug - The product slug
 * @returns Full URL like "https://username.storelib.com/p/product-slug"
 */
/**
 * ===========================================================================
 *  A PRODUCT IS storelib.com/<handle>/<slug>
 * ===========================================================================
 * It used to be `<handle>.storelib.com/p/<slug>`: a subdomain, a `/p/` that
 * reads as nothing, and an address too long to say out loud.
 *
 * WHY NOT storelib.com/<slug>. That slot is already the creator's page, and
 * one slot cannot mean both "handle" and "product slug" — a creator called
 * `ebook` and a product slugged `ebook` are both legitimate, and whichever
 * lost would simply stop resolving. Nesting under the handle removes the
 * collision instead of managing it.
 *
 * THE OLD ADDRESS STILL ANSWERS. app/(marketing)/p/[slug] is still the
 * implementation and still the route; it also holds the slug-history
 * redirects, so a product renamed two years ago still resolves from the link
 * somebody saved. Only what we HAND OUT changed.
 */
export function getProductUrl(username: string, productSlug: string): string {
  if (!productSlug) return getStoreUrl(username)

  const mainDomain = getMainDomain()
  const protocol = mainDomain.includes("localhost") ? "http" : "https"

  const handle = username.toLowerCase()

  if (mainDomain.includes("localhost")) {
    return handle ? `${getSiteUrl()}/${handle}/${productSlug}` : `${getSiteUrl()}/p/${productSlug}`
  }

  /** No handle to nest under: the old address is still the right answer. */
  if (!handle) return `${protocol}://${mainDomain}/p/${productSlug}`

  return `${protocol}://${mainDomain}/${handle}/${productSlug}`
}

/**
 * Get the canonical store URL for sharing/copying/displaying — always returns the
 * full subdomain URL regardless of whether running inside Capacitor.
 * Use this for copy-to-clipboard, display text, and any URL shown to the user.
 * For in-app navigation in Capacitor use getStoreUrl() or getStoreInternalPath().
 */
export function getStoreShareUrl(username: string, pageHost?: string | null): string {
  /* The creator page on a domain of its own: the domain is the address. */
  const own = onOwnDomain(pageHost)
  if (own) return `${own}/`
  if (!username) return getSiteUrl()

  const sanitizedUsername = username
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!sanitizedUsername) return getSiteUrl()

  const mainDomain = getMainDomain()

  if (mainDomain.includes("localhost")) {
    return `${getSiteUrl()}/u/${sanitizedUsername}`
  }

  return `https://${mainDomain}/${sanitizedUsername}`
}

/**
 * `https://<host>` for a creator page's own domain, or null. The host is the
 * one it is served at (www.<apex>, or a subdomain as it is), which is what
 * lib/custom-domains/store.ts hands out; a bare apex is given its www, since
 * the bare name only redirects.
 */
function onOwnDomain(pageHost?: string | null): string | null {
  const host = (pageHost || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  if (!host || !host.includes(".")) return null
  return `https://${servingHost(host)}`
}

/**
 * Get the canonical OnePage URL for sharing, copying and displaying: always
 * the full https://storelib.me/{handle}, inside Capacitor too, or
 * <their domain>/links when the creator page has a domain of its own.
 */
export function getLinksShareUrl(username: string, pageHost?: string | null): string {
  /* The OnePage lives at /links on the creator page's own domain. */
  const own = onOwnDomain(pageHost)
  if (own) return `${own}/links`
  if (!username) return getSiteUrl()

  /* storelib.me/{handle} (lib/onepage/address), the one address handed out. */
  return onePageUrl(username)
}

/**
 * Get the canonical product URL for sharing/copying/opening in external browser —
 * always returns the full subdomain URL regardless of Capacitor.
 */
export function getProductShareUrl(username: string, productSlug: string, pageHost?: string | null): string {
  if (!productSlug) return getStoreShareUrl(username, pageHost)
  /* On the creator page's own domain a product is /<slug>: the domain already says whose. */
  const own = onOwnDomain(pageHost)
  if (own) return `${own}/${encodeURIComponent(productSlug)}`

  const mainDomain = getMainDomain()

  const handle = username.toLowerCase()

  if (mainDomain.includes("localhost")) {
    return handle ? `${getSiteUrl()}/${handle}/${productSlug}` : `${getSiteUrl()}/p/${productSlug}`
  }

  if (!handle) return `https://${mainDomain}/p/${productSlug}`

  return `https://${mainDomain}/${handle}/${productSlug}`
}

/**
 * ===========================================================================
 *  A CREATOR'S PAGE IS storelib.com/<handle>
 * ===========================================================================
 * Two addresses, two things, and neither of them carries a prefix:
 *
 *   <handle>.storelib.com   the WEBSITE they built in the website builder
 *   storelib.com/<handle>   their creator PAGE
 *
 * The bare path has rendered the creator page since app/(marketing)/[sellername]
 * was added — but nothing linked to it. Every internal link came through here
 * and said `/u/<handle>`, so the pretty address existed and no one ever saw
 * it. This is the one place that decides, so changing it moves every link on
 * the platform at once.
 *
 * `/u/<handle>` still works and always will: it is a permanent redirect now
 * (see the note in app/(marketing)/u/[username]/page), so shared links,
 * bookmarks and anything already indexed keep resolving and consolidate onto
 * the canonical address rather than splitting between two.
 *
 * @param username - The seller's username
 * @returns Relative path like "/username"
 */
export function getStoreInternalPath(username: string): string {
  return `/${username}`
}

/**
 * The ROUTE the OnePage renders from, on storelib.com: in-app navigation in
 * the native shell, the proxy's rewrite from storelib.me/{slug}, and the
 * editor's own links. Not an address to hand out: on the web it answers
 * with a 308 to storelib.me/{slug}, which onePageUrl builds.
 *
 * @param slug - The onepage slug (usually same as username)
 * @returns Relative path like "/slug/links"
 */
export function getLinksInternalPath(slug: string): string {
  return `/${slug}/links`
}

/**
 * Get relative path for product internal navigation
 * @param productSlug - The product slug
 * @returns Relative path like "/p/product-slug"
 */
export function getProductInternalPath(productSlug: string, username?: string): string {
  const handle = username?.toLowerCase()
  return handle ? `/${handle}/${productSlug}` : `/p/${productSlug}`
}

/**
 * Format a store URL for display (shorter version)
 * @param username - The seller's username
 * @returns Display string like "username.storelib.com"
 */
export function getStoreUrlDisplay(username: string): string {
  if (!username) return getMainDomain()

  const mainDomain = getMainDomain()

  // Handle localhost for development
  if (mainDomain.includes("localhost")) {
    return `${mainDomain}/u/${username}`
  }

  return `${mainDomain}/${username.toLowerCase()}`
}

/**
 * Format a OnePage URL for display: "storelib.me/username", no scheme.
 * @param username - The seller's username
 */
export function getLinksUrlDisplay(username: string): string {
  if (!username) return getOnePageDomain()
  return onePageUrlDisplay(username)
}

/**
 * Get the store URL with custom domain support
 * @param username - The seller's username
 * @param customDomain - Optional custom domain (e.g., "theirdomain.com")
 * @returns Full URL like "https://theirdomain.com" or falls back to subdomain
 */
export function getStoreUrlWithCustomDomain(username: string, customDomain?: string | null): string {
  if (customDomain) {
    // www for an apex (the bare name only redirects), a subdomain as it is
    return `https://${servingHost(customDomain.toLowerCase())}`
  }
  return getStoreUrl(username)
}

/**
 * Get the links URL with custom domain support
 * @param username - The seller's username
 * @param customDomain - Optional custom domain
 * @returns Full URL like "https://www.theirdomain.com/links" or falls back to subdomain
 */
export function getLinksUrlWithCustomDomain(username: string, customDomain?: string | null): string {
  if (customDomain) {
    return `https://${servingHost(customDomain.toLowerCase())}/links`
  }
  return getLinksUrl(username)
}

/**
 * Get the product URL with custom domain support
 * @param username - The seller's username
 * @param productSlug - The product slug
 * @param customDomain - Optional custom domain
 * @returns Full URL like "https://www.theirdomain.com/p/product-slug"
 */
export function getProductUrlWithCustomDomain(username: string, productSlug: string, customDomain?: string | null): string {
  if (customDomain) {
    return `https://${servingHost(customDomain.toLowerCase())}/p/${productSlug}`
  }
  return getProductUrl(username, productSlug)
}

/**
 * Check if the current URL is a seller subdomain
 * @param host - The current host (e.g., from window.location.host)
 * @returns The username if on a subdomain, null otherwise
 */
export function extractUsernameFromHost(host: string): string | null {
  const mainDomain = getMainDomain()
  const hostWithoutPort = host.split(":")[0]

  // Handle localhost
  if (hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1") {
    return null
  }

  // Check if it's a subdomain of the main domain
  if (!hostWithoutPort.endsWith(`.${mainDomain}`)) {
    return null
  }

  // Extract subdomain
  const subdomain = hostWithoutPort.replace(`.${mainDomain}`, "")

  // Excluded subdomains
  const excluded = ["www", "app", "api", "admin", "dashboard"]
  if (excluded.includes(subdomain.toLowerCase())) {
    return null
  }

  // Only single-level subdomains
  if (subdomain.includes(".")) {
    return null
  }

  return subdomain.toLowerCase()
}

/**
 * Check if we're on a seller page (either subdomain or /u/ path)
 * @param pathname - Current pathname
 * @param host - Current host
 * @returns true if on a seller page
 */
export function isSellerPage(pathname: string, host?: string): boolean {
  // Check subdomain
  if (host) {
    const username = extractUsernameFromHost(host)
    if (username) return true
  }

  /**
   * THE PREFIXED SPELLINGS ARE NOT THE ONLY ONES ANY MORE. A creator page is
   * `/<handle>` and a product is `/<handle>/<slug>`; `/u/` and `/p/` still
   * resolve and still have to be recognised, because a saved link redirects
   * here and a component sees whatever it is handed. Everything that decides
   * "is this a creator's surface" was still asking only about the prefixes,
   * so the marketing header and footer came back on every creator page the
   * moment their address lost its `/u/`.
   */
  return (
    pathname.startsWith("/u/") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/l/") ||
    creatorHandleFromPath(pathname) !== null ||
    productFromPath(pathname) !== null
  )
}

/**
 * A CREATOR'S PRODUCT, as against their page. Both are seller surfaces
 * (isSellerPage above) and most things treat them alike, but one carries its
 * own buy bar at the foot of the screen and the other does not, which is
 * what decides whether Storelib's phone tab bar can sit under it
 * (lib/nav/buyer-tabs.ts). Every spelling a product has: the `/p/` and `/l/`
 * prefixes a saved link still arrives on, and the bare `/<handle>/<slug>`.
 */
export function isSellerProductPath(pathname: string, host?: string): boolean {
  if (pathname.startsWith("/p/") || pathname.startsWith("/l/")) return true
  return productFromPath(pathname, host) !== null
}

/** The path split into segments, with empty ones dropped. */
function segmentsOf(pathname: string): string[] {
  return pathname.split("?")[0].split("#")[0].split("/").filter(Boolean)
}

/**
 * ===========================================================================
 *  READING THE TWO BARE ADDRESSES
 * ===========================================================================
 *   /<handle>          a creator's page
 *   /<handle>/<slug>   one of their products
 *
 * A first segment the platform owns is neither, which is what
 * `isReservedRootSegment` is for — and it is the same list the routes
 * themselves guard with and signup refuses, so these three cannot disagree
 * about what a handle is.
 *
 * On a creator's own subdomain the paths mean something else entirely, so
 * pass the host when you have it and these stay out of the way.
 */
export function creatorHandleFromPath(pathname: string, host?: string): string | null {
  if (host && extractUsernameFromHost(host)) return null
  const parts = segmentsOf(pathname)
  if (parts.length !== 1) return null
  const handle = parts[0].toLowerCase()
  if (isReservedRootSegment(handle)) return null
  return handle
}

export function productFromPath(
  pathname: string,
  host?: string,
): { handle: string; slug: string } | null {
  if (host && extractUsernameFromHost(host)) return null
  const parts = segmentsOf(pathname)
  if (parts.length !== 2) return null
  const handle = parts[0].toLowerCase()
  if (isReservedRootSegment(handle)) return null
  return { handle, slug: parts[1] }
}

/** A product page under either spelling. */
export function isProductPage(pathname: string, host?: string): boolean {
  return pathname.startsWith("/p/") || productFromPath(pathname, host) !== null
}

/**
 * Check if the current host is a custom domain (not storelib.com or its subdomains)
 * Custom domains are seller-owned domains like "materiabuilder.store"
 * @param host - The current host (e.g., from window.location.host)
 * @returns true if the host is a custom domain
 */
export function isCustomDomain(host: string): boolean {
  if (!host) return false

  const hostWithoutPort = host.split(":")[0]

  // Not a custom domain if it's localhost/development
  if (hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1") {
    return false
  }

  const mainDomain = getMainDomain()

  // Not a custom domain if it's the main domain itself
  if (hostWithoutPort === mainDomain) {
    return false
  }

  // Not a custom domain if it's a subdomain of the main domain
  if (hostWithoutPort.endsWith(`.${mainDomain}`)) {
    return false
  }

  // Everything else is a custom domain
  return true
}

/**
 * Check if we're on a links/onepage
 * @param pathname - Current pathname
 * @param host - Current host
 * @returns true if on a links page
 */
export function isLinksPage(pathname: string, host?: string): boolean {
  /* storelib.me serves nothing but OnePages: one segment is one. */
  if (host && isOnePageHost(host)) return pathname.split("/").filter(Boolean).length === 1

  // Check subdomain + /links path
  if (host) {
    const username = extractUsernameFromHost(host)
    if (username && (pathname === "/links" || pathname === "/links/")) {
      return true
    }
  }

  /* The address now: /{handle}/links, two segments with `links` as the second. */
  const parts = pathname.split("/").filter(Boolean)
  if (parts.length === 2 && parts[1].toLowerCase() === "links") return true

  // And the old path-based route, which still answers.
  return pathname.startsWith("/l/")
}

// ── Website Builder URL Helpers ────────────────────────────────
// TWO ADDRESSES, TWO THINGS.
//   <name>.storelib.com  -> the WEBSITE built in the website builder
//   storelib.com/<name>  -> the creator's PAGE: profile, products, follow

/**
 * Get the URL for a seller's website page (path-based format)
 * @param username - The seller's username
 * @returns Full URL like "https://username.storelib.com"
 */
export function getWebsiteUrl(username: string): string {
  if (!username) return getSiteUrl()

  const sanitizedUsername = username
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!sanitizedUsername) return getSiteUrl()

  if (isNativeApp()) {
    return `/w/${sanitizedUsername}`
  }

  const mainDomain = getMainDomain()

  if (mainDomain.includes("localhost")) {
    return `${getSiteUrl()}/w/${sanitizedUsername}`
  }

  /**
   * TWO ADDRESSES, TWO THINGS. `<name>.storelib.com` is the creator's
   * WEBSITE, the one built in the website builder. `storelib.com/<name>` is
   * the creator's PAGE: profile, products, follow. They were the other way
   * round, with the apex path serving the website and the subdomain
   * bouncing to it, and everything that printed "your website is at" printed
   * the page's address.
   */
  return `https://${sanitizedUsername}.${mainDomain}`
}

/**
 * Get the canonical website URL for sharing — always returns the full URL
 */
export function getWebsiteShareUrl(username: string): string {
  if (!username) return getSiteUrl()

  const sanitizedUsername = username
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!sanitizedUsername) return getSiteUrl()

  const mainDomain = getMainDomain()

  if (mainDomain.includes("localhost")) {
    return `${getSiteUrl()}/w/${sanitizedUsername}`
  }

  return `https://${sanitizedUsername}.${mainDomain}`
}

/**
 * Get website URL display string
 * @param username - The seller's username
 * @returns Display string like "username.storelib.com"
 */
export function getWebsiteUrlDisplay(username: string): string {
  if (!username) return getMainDomain()

  const mainDomain = getMainDomain()

  if (mainDomain.includes("localhost")) {
    return `${mainDomain}/w/${username}`
  }

  return `${username.toLowerCase()}.${mainDomain}`
}

/**
 * Get website page URL (for sub-pages of a website)
 * @param username - The seller's username
 * @param pageSlug - The page slug
 * @returns Full URL like "https://username.storelib.com/about"
 */
export function getWebsitePageUrl(username: string, pageSlug: string): string {
  if (!pageSlug) return getWebsiteUrl(username)

  const mainDomain = getMainDomain()

  if (mainDomain.includes("localhost")) {
    return `${getSiteUrl()}/w/${username}/${pageSlug}`
  }

  if (!username) {
    return `https://${mainDomain}/${pageSlug}`
  }

  return `https://${username.toLowerCase()}.${mainDomain}/${pageSlug}`
}

/**
 * ===========================================================================
 *  AN ABSOLUTE URL POINTING AT THIS SITE IS STILL AN INTERNAL LINK
 * ===========================================================================
 * `internal` used to be `href.startsWith("/")`, and product cards do not link
 * that way: `getProductUrl` returns the full address,
 * https://storelib.com/<handle>/<slug>, because the same string is also what
 * gets copied, shared and put in metadata. So every product card on every
 * storefront failed the test, fell through to a bare <a>, and navigated by
 * FULL DOCUMENT LOAD — no prefetch, and `loading.tsx` never reached, because
 * a loading boundary only exists inside a client navigation.
 *
 * That is the reported "I click a product and nothing happens for three
 * seconds and then the page appears": nothing happens because nothing is
 * meant to happen yet, the browser is waiting on a force-dynamic page, and
 * the first thing it can paint is the finished document.
 *
 * ONLY THIS ORIGIN. A creator's subdomain and a custom domain are genuinely
 * different origins serving different pages; routing them on the client would
 * put this app's shell around somebody else's site. The main domain, with or
 * without www, is the only host this app actually serves.
 */
export function toSameOriginPath(href: string | undefined): string | null {
  if (!href) return null
  if (href.startsWith("/")) return href
  try {
    const url = new URL(href)
    const mainDomain = getMainDomain().toLowerCase()
    const host = url.hostname.toLowerCase()
    if (host !== mainDomain && host !== `www.${mainDomain}`) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}
