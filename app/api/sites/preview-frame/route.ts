/**
 * The shell the editor's preview runs in.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS A ROUTE AND NOT A srcdoc STRING
 * ---------------------------------------------------------------------------
 * A srcdoc document's own URL is `about:srcdoc` and its base URL is the page
 * around it, so every link in a generated site resolved against the EDITOR:
 * "#/about" meant storelib.com/sites/<id>#/about, a different document, and
 * one that denies framing like every page on that domain. Clicking a menu item
 * replaced the creator's work with "storelib.com refused to connect."
 *
 * Holding the links stopped the crash and not the cause — a hash route still
 * could not work, because location.hash in a srcdoc document cannot change
 * without leaving. Measured, same document, both shapes:
 *
 *   srcdoc   2 load events — it left.   #/about → hash stayed ""
 *   served   1 load event  — it stayed. #/about → hash=#/about
 *
 * ---------------------------------------------------------------------------
 *  IT HOLDS NO PROJECT DATA, SO IT NEEDS NO SESSION
 * ---------------------------------------------------------------------------
 * The shell is the same bytes for every creator: an import map, an empty
 * stylesheet, and the bridge. A build arrives afterwards by postMessage from
 * the editor and never touches this route. There is nothing here to authorise
 * and nothing here to leak, which is also what makes it cacheable.
 */

import { NextResponse } from "next/server"

import { previewShell } from "@/lib/sites/preview-document"

export const dynamic = "force-static"
export const runtime = "nodejs"

export async function GET() {
  return new NextResponse(previewShell(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",

      /**
       * THE SANDBOX, ENFORCED BY THE RESPONSE RATHER THAN BY AN ATTRIBUTE.
       *
       * The old objection to serving this from a URL was sound: a real URL is
       * same-origin with the editor, and `allow-scripts allow-same-origin` on
       * the iframe would hand generated code the creator's session. An
       * attribute is one token wide and one careless edit from being wrong.
       *
       * A CSP `sandbox` directive is applied by the browser to THIS RESPONSE,
       * so it holds whatever the iframe tag says. Adding allow-same-origin to
       * the attribute now grants nothing. What was a convention enforced by
       * code review is enforced by the server.
       *
       * `allow-scripts` alone: no same-origin, no top navigation, no popups,
       * no forms, no downloads.
       */
      "Content-Security-Policy": [
        "sandbox allow-scripts",
        "default-src 'none'",
        // The bundle is inlined by the editor; React comes from /sites/vendor.
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data: https://fonts.gstatic.com",
        "media-src 'self' data: blob: https:",
        "connect-src 'none'",
        // Framed by the editor and by nothing else.
        "frame-ancestors 'self'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; "),

      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",

      /**
       * Immutable for a day rather than a year: it is the same bytes for
       * everyone, but a deploy that changes the bridge should reach an open
       * editor without anybody clearing anything.
       */
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
    },
  })
}
