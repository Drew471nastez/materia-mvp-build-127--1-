/**
 * ===========================================================================
 *  WHERE A BUYER FOLLOWS THEIR ORDER: THE STORE'S OWN ADDRESS FIRST
 * ===========================================================================
 * The order page (app/checkout/physical/order/<token>) is served on every
 * host: storelib.com, a creator's website subdomain and a domain connected
 * for it (lib/checkout/site-checkout siteCheckoutRouteFor lets it through
 * on a website's host). Every email and account link to it picks the host
 * the buyer knows, in this order:
 *
 *   1. the website the order was placed on (commerce_checkouts.origin.site),
 *      while that website still serves its checkout for this creator
 *   2. this creator's own website, a connected domain before a subdomain
 *   3. storelib.com
 *
 * The token is the key; the host only changes which address bar it shows.
 * The pure half (paths, picking a candidate) lives here; the database half
 * is ./order-link-server.ts.
 */

export const ORDER_PAGE_PREFIX = "/checkout/physical/order/"
/** The order lookup on a website's host: number and email, link emailed (app/checkout/site/track). */
export const ORDER_LOOKUP_PATH = "/checkout/track"

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/

/** /checkout/physical/order/<token>, or null for a token that is not one. */
export function orderPagePath(token: string | null | undefined): string | null {
  return typeof token === "string" && TOKEN.test(token) ? `${ORDER_PAGE_PREFIX}${encodeURIComponent(token)}` : null
}

/** The host a checkout says it was placed on, bare and lowercase, or null. */
export function originSiteHost(origin: unknown): string | null {
  if (!origin || typeof origin !== "object") return null
  const o = origin as { surface?: unknown; site?: unknown }
  if (o.surface !== "website" || typeof o.site !== "string") return null
  const host = o.site.trim().toLowerCase().replace(/\.$/, "")
  return /^[a-z0-9.-]{3,253}$/.test(host) && host.includes(".") ? host : null
}
