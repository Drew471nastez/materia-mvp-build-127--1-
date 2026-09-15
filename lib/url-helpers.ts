/**
 * URL Helpers for subdomain-based routing
 *
 * URL Structure:
 * - username.storelib.com         -> Seller store homepage
 * - username.storelib.com/links   -> Seller onepage/links page
 * - username.storelib.com/p/slug  -> Product page (on seller's subdomain)
 *
 * Internal routes (still work for compatibility):
 * - /u/{username}  -> Seller store homepage
 * - /l/{slug}      -> Seller onepage/links page
 * - /p/{slug}      -> Product page
 *
 * Capacitor (native app):
 * - Always returns internal paths to avoid cross-domain navigation
 *   which would lose the native auth session stored in SharedPreferences.
 */

import { isNativeApp } from "@/lib/platform-utils"

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

  return `${protocol}://${sanitizedUsername}.${mainDomain}`
}

/**
 * Get the URL for a seller's links/onepage (subdomain format)
 * @param username - The seller's username (same as onepage slug in most cases)
 * @returns Full URL like "https://username.storelib.com/links"
 */
export function getLinksUrl(username: string): string {
  if (!username) return getSiteUrl()

  if (isNativeApp()) {
    return `/l/${username.toLowerCase()}`
  }

  const mainDomain = getMainDomain()
  const protocol = mainDomain.includes("localhost") ? "http" : "https"

  // Handle localhost for development
  if (mainDomain.includes("localhost")) {
    // In development, use path-based routing as fallback
    return `${getSiteUrl()}/l/${username}`
  }

  return `${protocol}://${username.toLowerCase()}.${mainDomain}/links`
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
export function getStoreShareUrl(username: string): string {
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

  return `https://${sanitizedUsername}.${mainDomain}`
}

/**
 * Get the canonical links/onepage URL for sharing/copying/displaying — always
 * returns the full subdomain URL regardless of whether running inside Capacitor.
 */
export function getLinksShareUrl(username: string): string {
  if (!username) return getSiteUrl()

  const mainDomain = getMainDomain()

  if (mainDomain.includes("localhost")) {
    return `${getSiteUrl()}/l/${username.toLowerCase()}`
  }

  return `https://${username.toLowerCase()}.${mainDomain}/links`
}

/**
 * Get the canonical product URL for sharing/copying/opening in external browser —
 * always returns the full subdomain URL regardless of Capacitor.
 */
export function getProductShareUrl(username: string, productSlug: string): string {
  if (!productSlug) return getStoreShareUrl(username)

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
 * Get relative path for links page internal navigation
 * @param slug - The onepage slug (usually same as username)
 * @returns Relative path like "/l/slug"
 */
export function getLinksInternalPath(slug: string): string {
  return `/l/${slug}`
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

  return `${username.toLowerCase()}.${mainDomain}`
}

/**
 * Format a links URL for display (shorter version)
 * @param username - The seller's username
 * @returns Display string like "username.storelib.com/links"
 */
export function getLinksUrlDisplay(username: string): string {
  if (!username) return `${getMainDomain()}/links`

  const mainDomain = getMainDomain()

  // Handle localhost for development
  if (mainDomain.includes("localhost")) {
    return `${mainDomain}/l/${username}`
  }

  return `${username.toLowerCase()}.${mainDomain}/links`
}

/**
 * Get the store URL with custom domain support
 * @param username - The seller's username
 * @param customDomain - Optional custom domain (e.g., "theirdomain.com")
 * @returns Full URL like "https://theirdomain.com" or falls back to subdomain
 */
export function getStoreUrlWithCustomDomain(username: string, customDomain?: string | null): string {
  if (customDomain) {
    // Always use www as canonical host for custom domains (prevents SSL issues)
    const domain = customDomain.startsWith("www.") ? customDomain : `www.${customDomain}`
    return `https://${domain}`
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
    const domain = customDomain.startsWith("www.") ? customDomain : `www.${customDomain}`
    return `https://${domain}/links`
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
    const domain = customDomain.startsWith("www.") ? customDomain : `www.${customDomain}`
    return `https://${domain}/p/${productSlug}`
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

  // Check path-based routes
  return pathname.startsWith("/u/") || pathname.startsWith("/p/") || pathname.startsWith("/l/")
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
  // Check subdomain + /links path
  if (host) {
    const username = extractUsernameFromHost(host)
    if (username && (pathname === "/links" || pathname === "/links/")) {
      return true
    }
  }

  // Check path-based route
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
