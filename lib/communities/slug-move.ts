/**
 * ===========================================================================
 *  AN OLD COMMUNITY ADDRESS, SENT ON TO THE NEW ONE
 * ===========================================================================
 * A community's address can change (its creator renames it in Settings).
 * The address it had is kept (run-now part 94, community_slug_history), so
 * a link shared last month still opens it: loadCommunity finds the community
 * under its old address, and the community's layout answers a permanent
 * redirect (308) to the same page under the new one, the rest of the path
 * and the query kept: /community/old/post/123?c=9 is
 * /community/new/post/123?c=9.
 *
 * A layout is not told its own address, so the proxy hands it over in one
 * request header (COMMUNITY_PATH_HEADER, set for every /community/ request
 * and only those, so a visitor cannot choose it). It is only trusted when it
 * really is this community's address: anything else falls back to the
 * community's home. The answer is always a path on this site, never a host.
 *
 * Pure and browser safe, so the tests read it without a server.
 */

/** The request header the proxy writes the asked for path and query into, for /community/ pages. */
export const COMMUNITY_PATH_HEADER = "x-storelib-community-path"

/** Query keys that belong to the framework's own requests, never to the page: an RSC fetch's cache buster. */
const FRAMEWORK_KEYS = ["_rsc"]

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * Where a page asked for under `requested` goes now that the community's
 * address is `current`: the same path and query under the current address.
 * `asked` is the proxy's header (the path and query as asked for), or null.
 */
export function movedCommunityPath(requested: string, current: string, asked: string | null | undefined): string {
  const home = `/community/${current}`
  if (!asked || !asked.startsWith("/community/")) return home
  const q = asked.indexOf("?")
  const path = q === -1 ? asked : asked.slice(0, q)
  const query = q === -1 ? "" : asked.slice(q + 1)
  const rest = path.slice("/community/".length)
  const cut = rest.indexOf("/")
  const first = cut === -1 ? rest : rest.slice(0, cut)
  /* Only this community's own address: a header that names another page is not followed anywhere but home. */
  if (decoded(first).toLowerCase() !== decoded(requested).toLowerCase()) return home
  const tail = cut === -1 ? "" : rest.slice(cut)
  if (/[\\\s]/.test(tail) || tail.startsWith("//")) return home
  const params = new URLSearchParams(query)
  for (const key of FRAMEWORK_KEYS) params.delete(key)
  const search = params.toString()
  return `${home}${tail === "/" ? "" : tail}${search ? `?${search}` : ""}`
}
