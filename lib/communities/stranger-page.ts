/**
 * ===========================================================================
 *  A STRANGER'S COMMUNITY PAGE, HELD BY THE CDN (round 63)
 * ===========================================================================
 * /community/<slug> and its /about are the addresses a community is shared
 * as, and they were drawn on the server for every request, by everybody, with
 * nothing held anywhere: at a million views, a million renders. A visitor
 * carrying no sign in is shown exactly what every other such visitor is shown
 * (the render reads the session and nothing else of theirs), so the proxy
 * sends that visitor to a marked address of their own (STRANGER_MARK in the
 * query) and puts on that rewrite the CDN's instructions to hold it under
 * the community's slug tag (not next.config.mjs, whose rules match the address
 * the browser asked for, before the proxy), for a minute, served for five more while it is
 * drawn again. Every staff write, a publish, a take down or a hide clears the
 * tag at once (lib/communities/server/public-cache.ts communityPublicChanged).
 *
 * WHY NOBODY'S OWN VIEW CAN BE HELD:
 *   - only a request with no sign in cookie (carriesSignIn) is marked;
 *   - a marked address that arrives from outside is sent back to the plain
 *     one (markedFromOutside) before anything renders, so a signed in visitor
 *     cannot type their way onto the shared copy and have their page kept;
 *   - only a whole page load with no query is marked: a client side move
 *     (the `rsc` header), a ?join=1, an invite or a preview is drawn per visit.
 *   - the layout passes no Referer to the visit beacon on a marked page (the
 *     page's own document.referrer says it, per visitor).
 */

/** The query key the proxy adds; never on a link. */
export const STRANGER_MARK = "_sl_pub"

/** Set on the request by the proxy when it marked it, so the layout knows its page is shared. */
export const COMMUNITY_STRANGER_HEADER = "x-sl-community-public"

/** The CDN lifetime of a stranger's community page (set by the proxy on its rewrite). */
export const COMMUNITY_STRANGER_CDN = "public, s-maxage=60, stale-while-revalidate=300"

/** The CDN tag a stranger's community page is held under; lowercase, as the address that is marked. */
export const communitySlugTag = (slug: string) => `community-page:${slug.toLowerCase()}`

const PUBLIC_PAGE = /^\/community\/([a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?)(\/about)?$/

/** The community's slug when this request is a stranger's whole page load of a community's public page, else null. */
export function communityStrangerPage(r: { method: string; pathname: string; rsc: boolean; search: URLSearchParams; signedIn: boolean }): string | null {
  if (r.method !== "GET" && r.method !== "HEAD") return null
  if (r.rsc || r.signedIn) return null
  if ([...r.search.keys()].length > 0) return null
  return PUBLIC_PAGE.exec(r.pathname)?.[1] ?? null
}

/** A marked address that arrived from outside: the address without the mark, to be sent back to; else null. */
export function markedFromOutside(url: URL): URL | null {
  if (!url.searchParams.has(STRANGER_MARK)) return null
  const plain = new URL(url.toString())
  plain.searchParams.delete(STRANGER_MARK)
  return plain
}
