/**
 * ===========================================================================
 *  A CREATOR PAGE OR A PRODUCT PAGE ON STORELIB.COM (rounds 48 and 49)
 * ===========================================================================
 * storelib.com/<handle> and /<handle>/<product> are one HTML for everybody
 * (round 49, tests/cdnpages-r49): nothing in their render reads a cookie or
 * a request header, so next.config.mjs lets Vercel's CDN hold every request
 * for them, and whatever is somebody's own (Edit, Download, the buyer's
 * Contact) is asked for after the page loads.
 *
 * Round 48 held only a stranger's copy and sent everybody else's request to
 * a personal address (?_pv=1) by a rewrite in the proxy. On Vercel the CDN
 * keys its copy on the address the browser asked for, before any rewrite,
 * so signed in visitors and buyers were served the stranger's copy; it was
 * reverted (244bdca). What is left here is which addresses those are.
 *
 * The first path segment is never one of Storelib's own routes
 * (lib/routes/reserved-segments; next.config.mjs reads the same file) and
 * never a file (a dot); the second never a OnePage (links).
 */
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"

/** Storelib's own hosts, where the shared rule applies; the same pattern as next.config.mjs STORELIB_HOSTS. */
export const STORELIB_HOST = /^(?:(?:www\.)?storelib\.com|localhost|127\.0\.0\.1)$/i

/** /<handle> or /<handle>/<product> on storelib.com: not one of Storelib's own routes, not a file, not a OnePage. */
export function isCreatorPagePath(pathname: string): boolean {
  const parts = pathname.replace(/\/+$/, "").split("/").slice(1)
  if (parts.length < 1 || parts.length > 2 || parts.some((p) => !p || p.includes("."))) return false
  if (isReservedRootSegment(parts[0])) return false
  return parts.length === 1 || parts[1] !== "links"
}

/**
 * A request whose answer the CDN may hold for everybody (round 49): the same
 * test as next.config.mjs's edge rules, on storelib.com. The proxy reads no
 * session and writes no cookie for it (proxy.ts): a Set-Cookie (a renewed
 * session, the old domain cookie being retired) on an answer the CDN keeps
 * would be handed to the next visitor. The page itself reads no session; the
 * browser's own calls after load (/api/...) renew it as before.
 */
export function isEdgeHeldRequest(r: { method: string; pathname: string; rsc: boolean; search: URLSearchParams }): boolean {
  if (r.method !== "GET" && r.method !== "HEAD") return false
  if (r.rsc || r.search.has("embedded") || r.search.has("scheme")) return false
  return isCreatorPagePath(r.pathname) || /^\/explore(?:\/|$)/.test(r.pathname)
}
