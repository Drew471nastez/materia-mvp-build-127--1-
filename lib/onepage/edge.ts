/**
 * ===========================================================================
 *  storelib.me/<name> AT THE EDGE, FOR EVERYBODY (round 51)
 * ===========================================================================
 * A OnePage is the same HTML for every visitor: storelib.me reads no
 * session and writes no cookie (proxy.ts, the OnePage block), and the page
 * reads no cookie and no header but the host, which is part of the address
 * the CDN keys on (app/(marketing)/l/[slug]/page.tsx). Its views, clicks and
 * the owner's own marker are the browser's calls after load. So the CDN may
 * hold one copy per address whoever asked, as round 49 lets it hold a
 * creator page (next.config.mjs, lib/storefront/creator-page-purge).
 *
 * The same rule and lifetime: Vercel-CDN-Cache-Control (Vercel's CDN reads
 * it first and never passes it on, so a browser still asks every time), a
 * minute, served stale for five while it is drawn again, and taken down at
 * once by a change: Vercel-Cache-Tag names the page, and
 * lib/onepage/public-cache expires that tag with its data
 * (onePageChanged, onePageProductsChanged).
 *
 * A scheduled block. Round 40 kept the page out of every shared cache
 * because a five minute lifetime with ten more stale let a link set for 6:00
 * reach visitors at 6:15. A copy drawn before 6:00 carries 6:00 as its next
 * change (ScheduleRefresh), so a visitor handed it after 6:00 has the page
 * asked again by the browser at once, from the server, never the CDN (an
 * RSC request is never held): the minute is the most anybody waits.
 *
 * Never held: anything but GET and HEAD, an RSC request (a client side move
 * or ScheduleRefresh's own), and every answer on storelib.me other than a
 * OnePage (robots, sitemaps, the canvas, the API calls the page makes).
 */
export const ONEPAGE_EDGE = "public, s-maxage=60, stale-while-revalidate=300"

/** The tag every CDN copy of a OnePage carries, by the name in its address, lower case. */
export const onePageCdnTag = (name: string) => `onepage-${name.trim().toLowerCase()}`

const ONEPAGE_ROUTE = /^\/([a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?)\/links(?:\?|$)/

/**
 * The CDN headers for a request the proxy rewrites on storelib.me, or null.
 * `path` is the rewrite's destination (lib/onepage/host-route: `/<name>/links`
 * with the query), which is only ever a name already in its one spelling.
 */
export function onePageEdgeHeaders(r: { method: string; rsc: boolean; path: string }): Record<string, string> | null {
  if (r.method !== "GET" && r.method !== "HEAD") return null
  if (r.rsc) return null
  const m = ONEPAGE_ROUTE.exec(r.path)
  if (!m || m[1].includes("..")) return null
  return { "Vercel-CDN-Cache-Control": ONEPAGE_EDGE, "Vercel-Cache-Tag": onePageCdnTag(m[1]) }
}
