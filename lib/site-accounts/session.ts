import "server-only"

import { PENDING_TTL_MS, readPending, readSession, SESSION_TTL_MS, type PendingClaims } from "./token"

/**
 * ===========================================================================
 *  THE WEBSITE'S OWN COOKIES
 * ===========================================================================
 * Three, all on the website's own host and nowhere else, so one creator's
 * website can never see another's, and storelib.com never sees any of them:
 *
 *   __Host-sl_site_session   httpOnly. The signed session (./token). Scripts
 *                            on the page cannot read it.
 *   __Host-sl_site_pending   httpOnly. Which code this browser is waiting
 *                            on, between "Continue" and the code.
 *   sl_signed_in             "1", readable by the page, and nothing else in
 *                            it. It tells the page's own code to ask the
 *                            server for the account's saved items instead of
 *                            reading the guest list, and the header to say
 *                            Account rather than Sign in. Knowing it proves
 *                            nothing: every route checks the session itself.
 *
 * THE __Host- PREFIX is what makes "this host only" a rule the browser
 * keeps rather than a habit of ours. Websites live side by side under
 * storelib.com, and some of them (the AI-built ones) serve their own
 * scripts, which may set a cookie for the whole of storelib.com. A browser
 * refuses a __Host- cookie that names a domain, so nothing another website
 * sets can be read here as this website's session. The prefix needs Secure,
 * so on http://localhost, while developing, the plain names are used.
 *
 * Both httpOnly cookies are SameSite=Lax: sent when the visitor follows a
 * link to the website, never with a form another site submits. The routes
 * that change anything also check the request's Origin
 * (lib/site-accounts/respond.ts).
 */

const SESSION_NAME = "sl_site_session"
const PENDING_NAME = "sl_site_pending"
export const HINT_COOKIE = "sl_signed_in"

export interface SiteVisitor {
  customerId: string
  creatorId: string
  host: string
  issuedAt: number
}

function isLocal(host: string): boolean {
  const bare = host.split(":")[0]
  return bare === "localhost" || bare === "127.0.0.1"
}

/** The session cookie's name on this host: __Host- prefixed wherever it can be Secure. */
export function sessionCookieName(host: string): string {
  return isLocal(host) ? SESSION_NAME : `__Host-${SESSION_NAME}`
}

export function pendingCookieName(host: string): string {
  return isLocal(host) ? PENDING_NAME : `__Host-${PENDING_NAME}`
}

export function sessionCookie(host: string) {
  return { httpOnly: true, secure: !isLocal(host), sameSite: "lax" as const, path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) }
}

export function pendingCookie(host: string) {
  return { httpOnly: true, secure: !isLocal(host), sameSite: "lax" as const, path: "/", maxAge: Math.floor(PENDING_TTL_MS / 1000) }
}

export function hintCookie(host: string) {
  return { httpOnly: false, secure: !isLocal(host), sameSite: "lax" as const, path: "/", maxAge: Math.floor(SESSION_TTL_MS / 1000) }
}

/**
 * Who is signed in to this website, from the cookie's value and the host the
 * request arrived on. A session made for another host, or for another
 * creator than the one the caller expects, is nobody. Whether the customer
 * still exists is the caller's question (lib/site-accounts/customers.ts):
 * this is the signature alone.
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
  return { customerId: claims.u, creatorId: claims.c, host: claims.h, issuedAt: claims.i }
}

/** The sign in this browser is part way through on this website, or null. */
export function pendingFrom(
  value: string | null | undefined,
  host: string | null | undefined,
  expect?: { creatorId?: string | null },
  now = Date.now(),
): PendingClaims | null {
  if (!value || !host) return null
  const claims = readPending(value, now)
  if (!claims) return null
  if (claims.h !== host.trim().toLowerCase()) return null
  if (expect?.creatorId && claims.c !== expect.creatorId) return null
  return claims
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
  const host = hostOf(request)
  return visitorFrom(cookieFrom(request, sessionCookieName(host)), host, expect)
}
