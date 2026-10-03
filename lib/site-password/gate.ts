/**
 * ===========================================================================
 *  THE PASSWORD PAGE, IN FRONT OF A WEBSITE THAT ASKS FOR ONE
 * ===========================================================================
 * A creator who turns on "Password protect" (Website Settings, Publishing)
 * gets what a Shopify store has before it opens: every page of their
 * published website shows the password page instead, until the visitor
 * types the password, or is the owner (app/api/site-password/owner).
 *
 * WHERE IT IS DECIDED: the proxy, on every page request, before the page is
 * rewritten to /w/<name>. The published pages are cached for everybody and
 * read no cookies, so the only place that sees both the visitor's pass and
 * the address is the proxy; a visitor without a pass is rewritten to
 * /w/<name>/password instead, a different page with a cache entry of its
 * own, so the website's real pages are never served to them from a cache.
 *
 * WHAT IT NEVER STANDS IN FRONT OF:
 *
 *   /password    the password page itself
 *   /preview/…   the preview link the builder makes, already a secret of
 *                its own, which is how the editor's preview is always shown
 *   /api/…       the website's own forms, each with its own checks; the
 *                password form posts to one of them
 *   files        robots.txt, sitemap.xml and anything with an extension
 *
 * This file is the pure half, so the rules are tested by running them
 * (tests/site-customer-pages.test.ts). The proxy's half, with its cache, is
 * ./proxy-gate.ts.
 */
import { passHolds } from "./pass"

/** Whether the password page stands in front of this path, on a website that asks for one. */
export function gatedPath(pathname: string): boolean {
  const path = pathname || "/"
  if (path === "/password" || path.startsWith("/password/")) return false
  if (path === "/preview" || path.startsWith("/preview/")) return false
  if (path === "/api" || path.startsWith("/api/")) return false
  if (path.startsWith("/_next/")) return false
  if (/\.[a-z0-9]{1,8}$/i.test(path)) return false
  return true
}

export interface GateAnswer {
  /** This website asks for a password right now. */
  protected: boolean
  /** And this request has no pass for it: show the password page. */
  blocked: boolean
}

export const OPEN: GateAnswer = Object.freeze({ protected: false, blocked: false })

/**
 * The decision for one request, from what the gate looked up. `version` is
 * null when the website does not ask for a password.
 */
export async function decide(input: {
  pathname: string
  creatorId: string | null
  version: number | null
  host: string
  cookie: string | null | undefined
  now?: number
}): Promise<GateAnswer> {
  if (!input.creatorId || input.version === null) return OPEN
  if (!gatedPath(input.pathname)) return { protected: true, blocked: false }
  const holds = await passHolds(input.cookie, { creatorId: input.creatorId, host: input.host, version: input.version }, input.now)
  return { protected: true, blocked: !holds }
}

/**
 * Where the password page sends the visitor once they are in: the page they
 * asked for, a path on this website, never the API, never the password page
 * itself and never somewhere else. "/" when it is none of those.
 */
export function passReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return "/"
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/"
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(raw)) return "/"
  const page = raw.split(/[?#]/)[0]
  if (!gatedPath(page)) return "/"
  return raw
}
