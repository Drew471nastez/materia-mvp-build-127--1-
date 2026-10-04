/**
 * ===========================================================================
 *  ONE PAGE PER PERSON: A CREATOR'S /@handle IS THEIR CREATOR PAGE
 * ===========================================================================
 * The owner: "a creator (has a store) has ONE public page, the creator page;
 * their /@handle (and /member/<username>) redirects to it". So /@calvin is a
 * permanent redirect (308) to storelib.com/calvin, the query kept, and
 * /@handle is only ever a page for somebody without a store.
 *
 * WHY IT CANNOT LOOP. Both doors ask the same question of the same rows:
 * storelib.com/<handle> sends a person without a live store to /@handle
 * (lib/profile/storefront-gate.ts), and /@handle sends a person with one to
 * /<handle> (app/(marketing)/member/[username]/layout.tsx). Both read the
 * profile and the creator through lib/commerce/creator-page-data and decide
 * with hasActiveStorefront, so one request cannot answer "store" at one door
 * and "no store" at the other. A handle that is one of the platform's own
 * words is never sent to /<handle>, where it would not be the creator page.
 *
 * WHY THE PROXY HANDS OVER THE ADDRESS. The redirect is answered by the
 * route's layout, which sits outside its loading skeleton, so it is a real
 * 308 before any byte of the page (a redirect from inside the page would be
 * streamed after the skeleton, as a 200 and a client side hop). A layout is
 * not told the query, so the proxy writes the path and query asked for into
 * PROFILE_PATH_HEADER for /@ and /member/ requests only (the same device as
 * lib/communities/slug-move.ts), replacing whatever a visitor sent.
 *
 * Pure and browser safe: the tests read it without a server.
 */

/** The request header the proxy writes the asked for path and query into, for /@ and /member/ requests. */
export const PROFILE_PATH_HEADER = "x-storelib-profile-path"

/** Whether a path is a person's profile, under either spelling. */
export function isProfilePath(pathname: string): boolean {
  return pathname.startsWith("/@") || pathname.startsWith("/member/")
}

/** Query keys that belong to the framework's own requests, never to the page: an RSC fetch's cache buster. */
const FRAMEWORK_KEYS = ["_rsc"]

/** A handle that can stand alone as the first segment of an address. */
const HANDLE = /^[a-z0-9][a-z0-9_.-]{0,63}$/i

/**
 * Where a creator's /@handle goes: their page at /<username>, with the query
 * the visitor asked with. `asked` is the proxy's header (path and query), or
 * null, which keeps no query. Null when the name cannot be an address of its
 * own, so the caller renders the profile instead of redirecting anywhere odd.
 */
export function creatorPageTarget(username: string, asked: string | null | undefined): string | null {
  const name = (username || "").trim()
  if (!HANDLE.test(name)) return null
  const q = asked ? asked.indexOf("?") : -1
  const params = new URLSearchParams(q === -1 || !asked ? "" : asked.slice(q + 1))
  for (const key of FRAMEWORK_KEYS) params.delete(key)
  const search = params.toString()
  return `/${name}${search ? `?${search}` : ""}`
}
