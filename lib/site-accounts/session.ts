import "server-only"

import { readSession, SESSION_TTL_MS, STATE_TTL_S } from "./token"

/**
 * ===========================================================================
 *  THE WEBSITE'S OWN COOKIES
 * ===========================================================================
 * Three, all host-only on the website's host (no Domain attribute), so one
 * creator's website can never see another's, and storelib.com never sees any
 * of them:
 *
 *   sl_site_session   httpOnly. The signed session (lib/site-accounts/token).
 *                     Scripts on the page cannot read it.
 *   sl_signed_in      "1", readable by the page, and nothing else in it. It
 *                     tells the page's own code to ask the server for the
 *                     account's saved items instead of reading the guest list.
 *                     Knowing it proves nothing: every route checks the
 *                     session itself.
 *   sl_site_state     httpOnly, and sent only to /api/site-account. The random
 *                     value a sign-in started with in this browser; a code
 *                     that comes back without it is somebody else's, which is
 *                     what stops a stranger's link signing this browser in as
 *                     them.
 */

export const SESSION_COOKIE = "sl_site_session"
export const HINT_COOKIE = "sl_signed_in"
export const STATE_COOKIE = "sl_site_state"
export const STATE_PATH = "/api/site-account"

export interface SiteVisitor {
  userId: string
  creatorId: string
  host: string
  issuedAt: number
}

function isLocal(host: string): boolean {
  const bare = host.split(":")[0]
  return bare === "localhost" || bare === "127.0.0.1"
}

export function sessionCookie(host: string) {
  return { httpOnly: true, secure: !isLocal(host), sameSite: "lax" as const, path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) }
}

export function hintCookie(host: string) {
  return { httpOnly: false, secure: !isLocal(host), sameSite: "lax" as const, path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) }
}

export function stateCookie(host: string) {
  return { httpOnly: true, secure: !isLocal(host), sameSite: "lax" as const, path: STATE_PATH, maxAge: STATE_TTL_S }
}

/**
 * Who is signed in to this website, from the cookie's value and the host the
 * request arrived on. A session made for another host, or for another
 * creator than the one the caller expects, is nobody.
 */
export function visitorFrom(
  value: string | null | undefined,
  host: string | null | undefined,
  expect?: { creatorId?: string | null },
  now = Date.now(),
): SiteVisitor | null {
  if (!value || !host) return null
  const claims = readSession(value, now)
  if (!claims) return null
  if (claims.h !== host.trim().toLowerCase()) return null
  if (expect?.creatorId && claims.c !== expect.creatorId) return null
  return { userId: claims.u, creatorId: claims.c, host: claims.h, issuedAt: claims.i }
}

/** The request's host, as the browser sent it. */
export function hostOf(request: Request): string {
  return (request.headers.get("host") || "").trim().toLowerCase()
}

/** One cookie's value from a request's Cookie header. */
export function cookieFrom(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") || ""
  for (const part of header.split(";")) {
    const i = part.indexOf("=")
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) {
      const raw = part.slice(i + 1).trim()
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw
      }
    }
  }
  return null
}

/** The visitor behind a request to one of the website's routes. */
export function visitorOfRequest(request: Request, expect?: { creatorId?: string | null }): SiteVisitor | null {
  return visitorFrom(cookieFrom(request, SESSION_COOKIE), hostOf(request), expect)
}
