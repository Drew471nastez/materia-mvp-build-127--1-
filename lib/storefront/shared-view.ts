/**
 * ===========================================================================
 *  A CREATOR PAGE OR A PRODUCT PAGE: THE STRANGER'S COPY, OR SOMEBODY'S (round 48)
 * ===========================================================================
 * next.config.mjs lets the CDN hold storelib.com/<handle> and
 * /<handle>/<product> for a minute when the request carries none of the
 * cookies that make the page somebody's and no Referer from Storelib (see
 * CREATOR_PAGE_PERSONAL_COOKIES there), and answers every other request
 * `private, no-store`. That decides what is STORED. What a request is SERVED
 * is decided before that, by the address: the CDN looks up the address the
 * proxy hands on, and a signed in owner asking for /<handle> would be handed
 * the stranger's copy, without their Edit, a buyer's without their Download.
 *
 * So the proxy (proxy.ts) sends a personal request to an address of its own,
 * the same page with PERSONAL_VIEW_PARAM, which nothing stores (its answer is
 * private by the rules above, which read the same cookies and Referer), and
 * takes the parameter off a request that arrives with it but is not personal,
 * so nobody can plant a stranger's copy at the personal address. The pages
 * read only the parameters they know, so they draw the same page either way.
 *
 * The cookie names and the Referer test here and in next.config.mjs are the
 * same list; tests/pubperf-r48 holds them together.
 */
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"

export const PERSONAL_VIEW_PARAM = "_pv"

/** The cookies that make the page somebody's, beside the Supabase session's (sessionCookieNames). */
export const PERSONAL_PAGE_COOKIES = ["sl_owned", "sl_owned_hint", "sl_lang", "sl_country", "sl_team_store"] as const

/** The Supabase session cookie and its first chunk, from the project address, as next.config.mjs names them. */
export function sessionCookieNames(supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string[] {
  try {
    const key = `sb-${new URL(supabaseUrl || "").hostname.split(".")[0]}-auth-token`
    return [key, `${key}.0`]
  } catch {
    return []
  }
}

/** Storelib's own hosts, where the shared rule applies; the same pattern as next.config.mjs STORELIB_HOSTS. */
export const STORELIB_HOST = /^(?:(?:www\.)?storelib\.com|localhost|127\.0\.0\.1)$/i
const STORELIB_REFERER = /^https?:\/\/(?:(?:www\.)?storelib\.com|localhost|127\.0\.0\.1)(?::\d+)?\/.*$/

/** /<handle> or /<handle>/<product> on storelib.com: not one of Storelib's own routes, not a file, not a OnePage. */
export function isCreatorPagePath(pathname: string): boolean {
  const parts = pathname.replace(/\/+$/, "").split("/").slice(1)
  if (parts.length < 1 || parts.length > 2 || parts.some((p) => !p || p.includes("."))) return false
  if (isReservedRootSegment(parts[0])) return false
  return parts.length === 1 || parts[1] !== "links"
}

/** The request is somebody's: a cookie of theirs, or a Referer from Storelib (the way back and the community bar read it). */
export function isPersonalRequest(cookieNames: readonly string[], referer: string | null | undefined, supabaseUrl?: string): boolean {
  const personal = new Set<string>([...sessionCookieNames(supabaseUrl), ...PERSONAL_PAGE_COOKIES])
  if (cookieNames.some((n) => personal.has(n))) return true
  return !!referer && STORELIB_REFERER.test(referer)
}
