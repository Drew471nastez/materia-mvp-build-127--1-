import "server-only"

/**
 * ===========================================================================
 *  WHO MAY ASK A ONEPAGE MUSIC OR VIDEO LOOKUP, AND HOW OFTEN (round AW)
 * ===========================================================================
 * The lookups behind a OnePage button's cover and player
 * (app/api/onepage/{tiktok,soundcloud,spotify,apple-music,youtube}) answered
 * anybody, with no sign in and no limit, and each answer is up to three
 * requests from Storelib's servers (the service's oEmbed, song.link, the
 * link's own page) on Storelib's function time. Only the OnePage editor asks
 * them (components/onepage/tabs/links-tab.tsx), and it is signed in.
 *
 * So, as the link preview beside them already does (app/api/onepage/
 * link-preview): signed in, or 401; then counted per account and per caller
 * address in the shared limiter. The numbers are set against the editor at
 * its busiest: it asks once for each music button without a picture when it
 * opens, and up to five more times each for a picture that does not come,
 * four seconds apart: six each. A page of forty such buttons stays inside
 * the ten minute window; a script does not.
 */
import { NextResponse } from "next/server"

import { addressSubject, rateLimit, type RateWindow } from "@/lib/api/rate-limit"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const EMBED_LOOKUP_LIMITS: readonly RateWindow[] = [
  { limit: 300, seconds: 600 },
  { limit: 3000, seconds: 86_400 },
]

/** Null when the lookup may go ahead, otherwise the answer to send instead. */
export async function embedLookupRefusal(request: Request): Promise<NextResponse | null> {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user") return NextResponse.json({ error: "Sign in to look up this link." }, { status: 401, headers: { "Cache-Control": "no-store" } })
  return rateLimit({
    bucket: "onepage-embed",
    subjects: [`user:${who.user.id}`, addressSubject(request)],
    windows: EMBED_LOOKUP_LIMITS,
    message: "Too many link lookups in a short time. Wait a moment and try again.",
  })
}
