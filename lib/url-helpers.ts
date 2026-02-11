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
 */

// Main domain from environment or default
const getMainDomain = () => process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

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

  const mainDomain = getMainDomain()
  const protocol = mainDomain.includes("localhost") ? "http" : "https"

  // Handle localhost for development
  if (mainDomain.includes("localhost")) {
    // In development, use path-based routing as fallback
    return `${getSiteUrl()}/u/${username}`
  }

  return `${protocol}://${username.toLowerCase()}.${mainDomain}`
}

/**
 * Get the URL for a seller's links/onepage (subdomain format)
 * @param username - The seller's username (same as onepage slug in most cases)
 * @returns Full URL like "https://username.storelib.com/links"
 */
export function getLinksUrl(username: string): string {
  if (!username) return getSiteUrl()

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
export function getProductUrl(username: string, productSlug: string): string {
  if (!productSlug) return getStoreUrl(username)

  const mainDomain = getMainDomain()
  const protocol = mainDomain.includes("localhost") ? "http" : "https"

  // Handle localhost for development
  if (mainDomain.includes("localhost")) {
    // In development, use path-based routing
    return `${getSiteUrl()}/p/${productSlug}`
  }

  if (!username) {
    // If no username, use main domain with path
    return `${protocol}://${mainDomain}/p/${productSlug}`
  }

  return `${protocol}://${username.toLowerCase()}.${mainDomain}/p/${productSlug}`
}

/**
 * Get relative path for internal navigation (used in Next.js Link components)
 * This is for navigating within the app (not for sharing external links)
 *
 * @param username - The seller's username
 * @returns Relative path like "/u/username"
 */
export function getStoreInternalPath(username: string): string {
  return `/u/${username}`
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
export function getProductInternalPath(productSlug: string): string {
  return `/p/${productSlug}`
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
