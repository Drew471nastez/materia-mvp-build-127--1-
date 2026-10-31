/**
 * ===========================================================================
 *  www AND A TRAILING SLASH, IN ONE REDIRECT (round 45 leftovers)
 * ===========================================================================
 * www.storelib.com/pricing/ took two hops: Next's own trailing slash
 * redirect (308 to www.storelib.com/pricing), then the proxy's www redirect
 * (to storelib.com/pricing). Every hop is a fetch a crawler spends and a
 * place a chain can break, so next.config sets `skipTrailingSlashRedirect`
 * and the proxy answers both here, first, with one 308 to the final address.
 *
 * 308 and not 301: a 301 lets a client turn a POST into a GET, and every
 * other permanent redirect on the platform is a 308 already.
 *
 * Nothing under /api changes host (proxy.ts says why: a cron or a webhook
 * must reach its route), but its trailing slash is still dropped on the same
 * host, which is what Next did for it before.
 */

export interface OneHop {
  /** Absolute when the host changes, a path and query when it does not. */
  location: string
  status: 308
}

const isApi = (pathname: string) => pathname === "/api" || pathname.startsWith("/api/")

/** The path without its trailing slashes; "/" stays "/". */
export function withoutTrailingSlash(pathname: string): string {
  if (pathname.length <= 1 || !pathname.endsWith("/")) return pathname
  return pathname.replace(/\/+$/, "") || "/"
}

/**
 * Where a request with a trailing slash goes, or null when it has none.
 * `host` is the request's host header (a port is ignored).
 */
export function trailingSlashHop(host: string, pathname: string, search: string, mainDomain: string): OneHop | null {
  const path = withoutTrailingSlash(pathname)
  if (path === pathname) return null
  const bare = host.split(":")[0].toLowerCase()
  if (bare === `www.${mainDomain}` && !isApi(pathname)) return { location: `https://${mainDomain}${path}${search}`, status: 308 }
  return { location: `${path}${search}`, status: 308 }
}

/** www.storelib.com without a trailing slash: the apex, same path and query. */
export function wwwHop(pathname: string, search: string, mainDomain: string): OneHop {
  return { location: `https://${mainDomain}${pathname}${search}`, status: 308 }
}
