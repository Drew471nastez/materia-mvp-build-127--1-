/**
 * The cover shown on a site card.
 *
 * PRIVATE. An unpublished site is not public, so this is read through the
 * signed-in user's client: a site somebody else owns comes back null under
 * RLS and this answers 404, which is the right reply to both "does not exist"
 * and "not yours".
 *
 * The card frames it with `sandbox="allow-scripts"` and NO `allow-same-origin`,
 * so the document runs on an opaque origin. That is what makes it safe to put
 * a creator's generated JavaScript on the dashboard's own domain: it cannot
 * read the session, reach the parent, or touch storage. The CSP below says the
 * same thing a second time, because one of the two being wrong should not be
 * enough.
 *
 * ---------------------------------------------------------------------------
 *  "storelib.com refused to connect."
 * ---------------------------------------------------------------------------
 * That message, in the middle of a site card, was this route's 404.
 *
 * vercel.json sets `X-Frame-Options: DENY` on every path — a sound default
 * that predates anything here being framed. A browser ignores it when the
 * response also carries `frame-ancestors`, which is why the SUCCESS path
 * worked. The failure paths did not carry it: they came from `resolveSite`,
 * which is shared by five routes and knows nothing about framing. So the
 * moment a cover could not be produced, the header nothing overrode took
 * effect and the browser replaced the card with its own error page.
 *
 * The shape of that is worth naming, because it is what made it hard to see:
 * THE WORSE THINGS WENT, THE UGLIER THE FAILURE. A card that cannot load its
 * cover should be a blank card. Instead, exactly when a site was unreadable —
 * which, while the dashboard's own query was broken, was every card — the
 * creator got a browser error with our domain in it.
 *
 * Measured in Chromium rather than reasoned about, because the interaction
 * between X-Frame-Options and frame-ancestors is a "SHOULD" in the spec:
 *
 *   RENDERED  frame-ancestors 'self' + X-Frame-Options: DENY
 *   BLOCKED   a 404 with no CSP     + X-Frame-Options: DENY
 *   RENDERED  a 404 that carries frame-ancestors 'self'
 *
 * So the rule for this route, and for any route that is meant to be framed:
 * EVERY response it can produce carries the framing policy, and every response
 * has a body worth rendering. There is one place below that builds a response
 * and nothing returns around it.
 */

import { type NextRequest, NextResponse } from "next/server"

import { resolveSite } from "@/lib/sites/resolve"
import { coverPlaceholder, siteCover } from "@/lib/sites/cover"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/** A cold cover is a full bundle. Rare, and bounded. */
export const maxDuration = 60

/**
 * `frame-ancestors 'self'` — this is meant to be framed, but only by
 * Storelib. Without it a cover could be embedded anywhere, and it is served
 * from the dashboard's own domain.
 *
 * Scripts are inline (the bundle is inlined into the document) plus the shared
 * React runtime under /sites/vendor. Nothing else executes.
 */
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  /**
   * PRIVATE, and never on a shared cache. This is an unpublished site behind a
   * session; a CDN holding it would serve one creator's draft to whoever asked
   * next.
   */
  "Cache-Control": "private, max-age=0, must-revalidate",
} as const

/**
 * The ONLY way this file answers.
 *
 * A second `new NextResponse` anywhere below is how the headers went missing
 * the first time, so there is not one — the status varies, the headers never
 * do, and a body is always a document.
 */
function cover(html: string, status = 200): NextResponse {
  return new NextResponse(html, { status, headers: HEADERS })
}

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const found = await resolveSite(siteId, "text")
  if (!found.ok) {
    const status = found.response.status
    /**
     * The status stays honest — a browser renders the body of a 404 in a frame
     * exactly as it renders a 200, so there is nothing to gain by lying about
     * it. Only the body changes: "absent" and "not yours" get the same words
     * as a site with nothing in it, so a stranger's card and an empty card are
     * byte-identical and neither confirms the other exists.
     */
    return cover(
      coverPlaceholder(status === 503 ? "Not available just now" : "Nothing here yet"),
      status,
    )
  }

  try {
    return cover(await siteCover(found.site))
  } catch {
    /**
     * `siteCover` handles the expected failures itself — a site that has never
     * built, a site that does not compile — and returns a placeholder for
     * both. Reaching here means something further down broke: storage, the
     * bundler, the database. Left to throw, that becomes a framework error
     * page with no CSP on it, which is the same bug as the 404 was.
     */
    return cover(coverPlaceholder("Not available just now"), 503)
  }
}
