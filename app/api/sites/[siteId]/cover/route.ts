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
 */

import { type NextRequest, NextResponse } from "next/server"

import { resolveSite } from "@/lib/sites/resolve"

import { } from "@/lib/sites/projects"
import { siteCover } from "@/lib/sites/cover"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/** A cold cover is a full bundle. Rare, and bounded. */
export const maxDuration = 60

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const found = await resolveSite(siteId, "text")
  if (!found.ok) return found.response
  const site = found.site

  const html = await siteCover(site)

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      /**
       * `frame-ancestors 'self'` — this is meant to be framed, but only by
       * Storelib. Without it a cover could be embedded anywhere, and it is
       * served from the dashboard's own domain.
       *
       * Scripts are inline (the bundle is inlined into the document) plus the
       * shared React runtime under /sites/vendor. Nothing else executes.
       */
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
       * PRIVATE, and never on a shared cache. This is an unpublished site
       * behind a session; a CDN holding it would serve one creator's draft to
       * whoever asked next.
       */
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  })
}
