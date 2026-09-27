/**
 * ===========================================================================
 *  A ONEPAGE IS https://storelib.me/{name}
 * ===========================================================================
 * "Nobody wants to put a long link in their bio." The address a creator
 * copies, shares, prints as a QR code and gets in an email is
 * `storelib.me/{name}`: one short host that only ever serves OnePages, with
 * the name right after it, the way Linktree's is.
 *
 * `onePageUrl` is the ONE function that builds it. lib/url-helpers
 * getLinksShareUrl, getLinksUrl and getLinksUrlDisplay are built out of it,
 * so every card, share sheet, QR code, email and sitemap that already called
 * those moved with this file.
 *
 * The page itself is still rendered by app/(marketing)/[sellername]/links
 * (which runs app/(marketing)/l/[slug]): proxy.ts rewrites
 * storelib.me/{name} to it, and sends the old addresses here
 * (lib/onepage/host-route.ts).
 *
 * A creator page on a domain of its own keeps its OnePage at
 * `<their domain>/links`; that is decided by the callers that know the
 * domain (getLinksShareUrl's pageHost), not here.
 *
 * Pure: no React, no database. Safe on the client and the server.
 */

/** The host OnePages are served on. Only this exact host is routed as one. */
export function getOnePageDomain(): string {
  return (process.env.NEXT_PUBLIC_ONEPAGE_DOMAIN || "storelib.me").trim().toLowerCase()
}

/** `https://storelib.me`, the origin every OnePage address starts with. */
export function onePageOrigin(): string {
  return `https://${getOnePageDomain()}`
}

/**
 * On a developer's machine there is no storelib.me to go to, so the address
 * is the route itself on the local site, as every other helper does there.
 */
function localSite(): string | null {
  const main = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  if (!main.includes("localhost")) return null
  return (process.env.NEXT_PUBLIC_SITE_URL || `http://${main}`).replace(/\/+$/, "")
}

/**
 * The OnePage's public address: `https://storelib.me/{name}`, in lower case.
 * An empty name is the host alone, which sends a visitor to Storelib.
 */
export function onePageUrl(name: string | null | undefined): string {
  const n = (name || "").trim().toLowerCase().replace(/^@/, "")
  const local = localSite()
  if (local) return n ? `${local}/${encodeURIComponent(n)}/links` : local
  return n ? `${onePageOrigin()}/${encodeURIComponent(n)}` : onePageOrigin()
}

/** The same address as a person reads it: `storelib.me/{name}`, no scheme. */
export function onePageUrlDisplay(name: string | null | undefined): string {
  return onePageUrl(name).replace(/^https?:\/\//, "")
}

/** Is this host the OnePage host? Exact match only, port ignored. */
export function isOnePageHost(host: string | null | undefined): boolean {
  const bare = (host || "").split(":")[0].trim().toLowerCase().replace(/\.$/, "")
  return bare !== "" && bare === getOnePageDomain()
}
