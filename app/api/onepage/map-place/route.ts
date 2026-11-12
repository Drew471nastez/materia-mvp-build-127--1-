import { NextResponse } from "next/server"
import { routeUser, authUnavailableResponse } from "@/lib/auth/route-user"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { redirectTarget } from "@/lib/api/public-fetch"
import { isGoogleMapsLink, isShortMapsLink, mapPlace } from "@/lib/onepage/map-place"
export const runtime = "nodejs"

/*
  GET /api/onepage/map-place?url=https://maps.app.goo.gl/...

  A SHORT GOOGLE MAPS LINK, READ ONCE FOR THE MAP BLOCK (lib/onepage/
  map-place). Google Maps' Share button makes a short link that only says
  which place it is when it is followed, so the editor asks here and keeps
  the whole link beside the short one; the page never asks again.

  - Signed in, or 401. Rate limited per person and per address.
  - Only Google's own short hosts are followed (maps.app.goo.gl,
    goo.gl/maps, g.co/kgs), one redirect at a time through the public-only
    guard (lib/api/public-fetch redirectTarget), at most four hops, and
    only to a Google Maps link. Nothing of the pages is read.

    { url: "https://www.google.com/maps/place/...", label: "Joe's Pizza" }
    422 { error } when the link does not lead to a place
*/
const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request) {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user") return NextResponse.json({ error: "Sign in to read a map link." }, { status: 401, headers: NO_STORE })
  const raw = (new URL(request.url).searchParams.get("url") || "").trim()
  if (!isShortMapsLink(raw)) return NextResponse.json({ error: "Paste a Google Maps link." }, { status: 400, headers: NO_STORE })
  const limited = await rateLimit({
    bucket: "onepage-map-place",
    subjects: [addressSubject(request), who.user.id],
    windows: [{ limit: 30, seconds: 600 }],
  })
  if (limited) return limited
  let current = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    for (let hop = 0; hop < 4; hop++) {
      const next = await redirectTarget(current, { timeoutMs: 3500 })
      if (!next) break
      current = next
      if (isGoogleMapsLink(current)) {
        const place = mapPlace(current)
        if (place && place.query) return NextResponse.json({ url: current, label: place.label }, { headers: NO_STORE })
        break
      }
      if (!isShortMapsLink(current) && !/^https:\/\/(www\.)?google\.[a-z.]+\//i.test(current)) break
    }
  } catch {
    /* the answer below */
  }
  return NextResponse.json({ error: "This link did not lead to a place. Paste the address instead." }, { status: 422, headers: NO_STORE })
}
