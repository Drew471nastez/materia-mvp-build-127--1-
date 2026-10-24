import { NextResponse, type NextRequest } from "next/server"
import { MARKER_TTL_MS, OWN_MARKER_COOKIE, OWN_MARKER_PARAM, consumeOwnHandoff, ownReturnPath, readOwnToken, signOwnMarker } from "@/lib/analytics/own-marker"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * THE CREATOR ARRIVING AT THEIR OWN SITE FROM THE APP.
 *
 * The app links here, on the site's own host, carrying a token that names
 * the creator (lib/analytics/own-marker). This checks the signature, leaves
 * a marker cookie on this host, and sends the browser on to the page with
 * nothing extra in the address, so the token is never what the creator sees,
 * copies or shares. From then on the tracker does not count this browser on
 * this creator's pages.
 *
 * It is the same answer either way. A token that is missing, forged, stale
 * or somebody else's leaves no cookie and still lands on the page: a visitor
 * who follows a link like this sees their site, not an error, and learns
 * nothing from it.
 *
 * The request's own address and one Set-Cookie header, rather than `nextUrl`
 * and the cookie helper: every attribute of a cookie this security-shaped is
 * then written where it can be read, and the route is a plain Request
 * handler that tests/own-marker.test.ts calls and measures directly.
 */
export async function GET(req: NextRequest) {
  const here = new URL(req.url)
  const to = ownReturnPath(here.searchParams.get("to"))
  const given = here.searchParams.get(OWN_MARKER_PARAM)
  /* Taken once on this host (own-marker consumeOwnHandoff): the same link opened again, by anyone, leaves no marker. */
  let creatorId: string | null = null
  if (readOwnToken(given, "hand")) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      creatorId = await consumeOwnHandoff(createAdminClient(), given, here.host)
    } catch {
      creatorId = readOwnToken(given, "hand")
    }
  }

  const res = NextResponse.redirect(new URL(to, here.origin), { status: 303 })
  res.headers.set("Cache-Control", "no-store")
  res.headers.set("X-Robots-Tag", "noindex")

  const marker = creatorId ? signOwnMarker(creatorId) : null
  if (marker) {
    /* No Domain, so the marker stays on this one host. HttpOnly, so a page
       a creator's own site draws cannot read it. Lax, so it arrives on a
       visit the creator navigates to. */
    const attributes = [
      `${OWN_MARKER_COOKIE}=${encodeURIComponent(marker)}`,
      `Max-Age=${Math.floor(MARKER_TTL_MS / 1000)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      ...(here.protocol === "https:" ? ["Secure"] : []),
    ]
    res.headers.append("Set-Cookie", attributes.join("; "))
  }
  return res
}
