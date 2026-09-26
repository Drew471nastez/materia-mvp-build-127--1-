/**
 * ===========================================================================
 *  ONE BASE URL FOR EVERYTHING THE ENGINE LINKS TO
 * ===========================================================================
 * Email links, in-app action links and unsubscribe links all start here.
 * The order is the one lib/email.tsx getStableBaseUrl already uses, so an
 * engine email and an order email point at the same host:
 *
 *   SITE_URL, NEXT_PUBLIC_SITE_URL, APP_URL, NEXT_PUBLIC_APP_URL,
 *   then https://storelib.com
 *
 * A preview deployment's own vercel.app host is never used: a link in an
 * email outlives the deployment it was sent from.
 */

const FALLBACK = "https://storelib.com"

export function baseUrl(): string {
  const candidates = [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]
  for (const raw of candidates) {
    const value = typeof raw === "string" ? raw.trim() : ""
    if (!value) continue
    try {
      const url = new URL(value)
      if (url.protocol !== "https:" && url.hostname !== "localhost") continue
      if (url.hostname.endsWith(".vercel.app")) continue
      return url.origin
    } catch {
      continue
    }
  }
  return FALLBACK
}

/**
 * An absolute URL for a path inside Storelib. Only a path is accepted: a
 * full URL from the data a job carries is not turned into a link, so a
 * notification can never point outside Storelib.
 */
export function appUrl(path: string): string {
  const clean = typeof path === "string" && path.startsWith("/") && !path.startsWith("//") ? path : "/app"
  return `${baseUrl()}${clean}`
}

/** Where a person changes what they get. */
export function preferencesUrl(): string {
  return appUrl("/app/settings?tab=notifications")
}
