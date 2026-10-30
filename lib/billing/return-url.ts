/**
 * ===========================================================================
 *  WHERE STRIPE SENDS A CREATOR BACK TO: STORELIB, AND NOWHERE ELSE
 * ===========================================================================
 * A plan checkout's success_url and cancel_url, the billing portal's
 * return_url and Connect's return_url and refresh_url are where Stripe sends
 * someone straight after a payment page. Taken from the request as sent, any
 * of them turns Storelib's Stripe pages into a way to land a creator, fresh
 * from entering a card, on a page that only looks like Storelib.
 *
 * So a requested address is kept only when it is:
 *
 *   - a path on the platform ("/app/settings/billing?success=1"), resolved
 *     against the platform origin; never "//host" or "/\host"
 *   - https on the platform's own hosts: the main domain, its www host, and
 *     the hosts APP_URL, NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_SITE_URL name
 *   - https on one of `ownHosts`, which a caller passes only after reading
 *     them from the database (a store's verified custom domains)
 *   - on a developer's machine (the platform on localhost, or a dev server),
 *     http on localhost
 *
 * Never a port on a real host, never user:pass@, never a backslash or a
 * control character. Anything else is the fallback: the same path on the
 * platform origin. Not "anything under storelib.com": that is every other
 * creator's site too.
 *
 * Pure: no server imports, so the suite drives it directly.
 */

const MAX_LENGTH = 2048

function mainDomain(): string {
  return (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").trim().toLowerCase().replace(/\.+$/, "")
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1"
}

/** `https://storelib.com`, or the local site on a developer's machine. */
export function billingPlatformOrigin(): string {
  const main = mainDomain()
  if (isLocalHost(main.split(":")[0])) return (process.env.NEXT_PUBLIC_SITE_URL || `http://${main}`).replace(/\/+$/, "")
  return `https://${main}`
}

function hostOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    const u = new URL(value)
    return u.protocol === "https:" && !u.port ? u.hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/** The hosts that are Storelib itself. */
export function platformHosts(): string[] {
  const main = mainDomain()
  const hosts = new Set<string>([main, `www.${main}`])
  for (const h of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL, process.env.NEXT_PUBLIC_SITE_URL].map(hostOf)) if (h) hosts.add(h)
  return [...hosts]
}

export interface ReturnUrlRules {
  /** Hosts the caller read from the database as this store's own (verified custom domains), lower case. */
  ownHosts?: readonly string[]
}

/** `raw` when it is an address on Storelib (or the store's own verified host), normalised, else null. */
export function trustedReturnUrl(raw: unknown, rules: ReturnUrlRules = {}): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > MAX_LENGTH) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\\s]/.test(value)) return null
  if (value.startsWith("/")) {
    if (value.startsWith("//")) return null
    try {
      const base = billingPlatformOrigin()
      const u = new URL(value, base)
      return u.origin === new URL(base).origin ? u.toString() : null
    } catch {
      return null
    }
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  const host = url.hostname.toLowerCase().replace(/\.+$/, "")
  const platformLocal = isLocalHost(mainDomain().split(":")[0]) || process.env.NODE_ENV === "development"
  if (platformLocal && isLocalHost(host) && (url.protocol === "http:" || url.protocol === "https:")) return url.toString()
  if (url.protocol !== "https:" || url.port) return null
  const own = (rules.ownHosts ?? []).map((h) => h.toLowerCase().replace(/\.+$/, ""))
  if (platformHosts().includes(host) || own.includes(host)) return url.toString()
  return null
}

/** The requested address when it passes trustedReturnUrl, else `fallbackPath` on the platform origin. */
export function billingReturnUrl(raw: unknown, fallbackPath: string, rules: ReturnUrlRules = {}): string {
  return trustedReturnUrl(raw, rules) ?? `${billingPlatformOrigin()}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`
}

/** A request's own origin when it is Storelib's, else the platform origin: for return addresses built from where the request came in. */
export function trustedRequestOrigin(requestUrl: string, rules: ReturnUrlRules = {}): string {
  try {
    const origin = new URL(requestUrl).origin
    return trustedReturnUrl(`${origin}/`, rules) ? origin : billingPlatformOrigin()
  } catch {
    return billingPlatformOrigin()
  }
}
