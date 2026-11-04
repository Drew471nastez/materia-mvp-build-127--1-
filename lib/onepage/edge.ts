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
 * The rule is next.config.mjs's storelib.me rule, not the proxy's: Next
 * takes the `rsc` header off the request the proxy is shown, so a header set
 * there was sent on a client side move too (measured on a production build,
 * scripts/check-public-delivery-r51). Never held: an RSC request (a client
 * side move, ScheduleRefresh's own), and every storelib.me address that is
 * not one name (robots, sitemaps, the canvas, the API calls the page makes).
 * Vercel's CDN stores only GET and HEAD.
 */
export const ONEPAGE_EDGE = "public, s-maxage=60, stale-while-revalidate=300"

/** The tag every CDN copy of a OnePage carries (next.config.mjs `onepage-:name`), by the name in its address, lower case. */
export const onePageCdnTag = (name: string) => `onepage-${name.trim().toLowerCase()}`
