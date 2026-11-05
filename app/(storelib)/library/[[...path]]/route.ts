import { NextResponse, type NextRequest } from "next/server"
import { legacyLibraryTarget, LIBRARY_HOME } from "@/lib/library/paths"

export const dynamic = "force-dynamic"

/**
 * THE LIBRARY MOVED INTO THE PROFILE (/account/library). Every address it
 * used to have is still in emails, receipts, bookmarks, the native app's
 * history and other people's links, so each one answers with where it went
 * (lib/library/paths.ts legacyLibraryTarget), keeping its query string:
 * /library?purchase=success&highlight=<id> lands on the same banner, and
 * /library/reviews?product=<id> on the same composer.
 *
 * A temporary redirect, so a browser asks again next time rather than
 * remembering the answer for good.
 */
function moved(request: NextRequest) {
  const url = request.nextUrl.clone()
  url.pathname = legacyLibraryTarget(url.pathname) ?? LIBRARY_HOME
  return NextResponse.redirect(url, 307)
}

export const GET = moved
export const HEAD = moved
