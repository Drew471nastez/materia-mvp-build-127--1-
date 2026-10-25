/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE HAS NO SERVER ACTIONS, SO A CALL TO ONE IS REFUSED
 * ===========================================================================
 * Production logged, many times a day, on board.storelib.com and other sites:
 *
 *   Failed to find Server Action "cachefn" / "r2s"
 *   Invariant: Expected RSC response, got text/plain. This is a bug in Next.js.
 *   Failed to load static file for page: /500 ENOENT .../pages/500.html
 *
 * Scanners post a made up `Next-Action` header to a site's `/`. The proxy
 * rewrites it to /w/[username], a page held for 60 s (ISR); Next looks for
 * the action, finds none, answers text/plain, and its own cache handler then
 * throws on that answer, and the error page it reaches for does not exist in
 * an app-router build. Each one is a full function run ending in a 500.
 *
 * No page of a published website calls a server action: its forms post to
 * /api routes and its links are plain pages (tests/site-action-guard.test.ts
 * checks the site's files say no "use server"). So a POST that carries the
 * header is answered 404 here, in the proxy, before any lookup or render.
 * Nothing a visitor does sends it.
 */
export const SITE_ACTION_GUARD = "server-action"

export function refusesSiteAction(method: string, headers: Pick<Headers, "has">): boolean {
  return method.toUpperCase() === "POST" && headers.has("next-action")
}
