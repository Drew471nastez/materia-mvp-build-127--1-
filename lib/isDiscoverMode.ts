/**
 * Single source of truth for "Discover mode".
 *
 * Returns true when the UI should behave as part of the Explore / Discover
 * experience (show platform header, hide seller-specific chrome, etc.).
 *
 * Rules:
 *  1. Capacitor native app + pathname matches a discover-related route  => true
 *  2. Query param `layout=discover` is present (backwards compat)       => true
 *  3. Query param `recommended` is present (backwards compat)           => true
 *  4. Everything else                                                   => false
 *
 * This is intentionally a pure function of (pathname, searchParams, isNative)
 * so it can be called from any React component or hook.
 */

import { isNativeApp } from "@/lib/platform-utils"

/** Routes that belong to the Discover experience inside the native app. */
const DISCOVER_PATH_PREFIXES = [
  "/explore",
  "/store/",
  "/product/",
  "/p/",
  "/s/",
  "/u/",
  "/l/",
  "/feed",
] as const

function pathnameIsDiscoverRoute(pathname: string): boolean {
  if (pathname === "/explore") return true
  return DISCOVER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/**
 * Determine whether the current context is "Discover mode".
 *
 * @param pathname     - `usePathname()` value
 * @param searchParams - `useSearchParams()` value (or URLSearchParams)
 * @param options.isSubdomain - true when on a seller subdomain (e.g. seller.storelib.com).
 *        On subdomains the pathname is "/" or "/products/..." etc., not "/u/seller",
 *        so we need this flag to recognise the page as part of the discover flow.
 */
export function isDiscoverMode(
  pathname: string,
  searchParams: { get(key: string): string | null; has(key: string): boolean },
  options?: { isSubdomain?: boolean },
): boolean {
  // Backwards compat: query-param based discover layout (works on web & app)
  if (searchParams.get("layout") === "discover" || searchParams.has("recommended")) {
    return true
  }

  // Native app + discover-related route OR seller subdomain => always discover mode
  if (isNativeApp() && (pathnameIsDiscoverRoute(pathname) || options?.isSubdomain)) {
    return true
  }

  return false
}
