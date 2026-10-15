import { NextResponse } from "next/server"

import { publishedNotFoundPage } from "@/lib/website-builder/published-site"
import { splitSiteName } from "@/lib/markets/site-name"

/**
 * ===========================================================================
 *  THE SITE'S 404 PAGE, FOR THE 404 ANSWER TO DRAW
 * ===========================================================================
 * A missing page on a creator's site is answered by Next's one root 404
 * (app/not-found.tsx), which keeps the status a real 404 but cannot know
 * whose site it is on: a nested not-found was tried and does not work here,
 * see components/platform/not-found-body.tsx. The browser does know, so
 * that answer asks this address, on the same host, for the page the creator
 * arranged, and draws it in place.
 *
 * `/not_found` on a creator's host arrives here through the proxy's normal
 * rewrite, so no host or domain is resolved twice. The underscore means no
 * page a creator makes can ever have this address (lib/website-builder/
 * site-pages: keys are letters, digits and hyphens).
 *
 * Published content only, the same that the site's pages serve, and cached
 * at the edge like them. Not a page: nothing to index.
 */
const HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
  "X-Robots-Tag": "noindex",
}

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  /* "andrew~fr": the page in French (/fr/not_found, lib/markets/site-name.ts); "andrew", the website's default language. */
  const { name, locale } = splitSiteName((await params).username)
  const page = await publishedNotFoundPage(name, locale).catch((error: unknown) => {
    console.error("[site 404] could not draw the page", { name: error instanceof Error ? error.name : "unknown" })
    return null
  })
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404, headers: HEADERS })
  return NextResponse.json(page, { headers: HEADERS })
}
