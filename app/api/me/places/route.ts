import { NextResponse } from "next/server"

import { admin } from "@/lib/communities/server/db"
import { sessionUserId } from "@/lib/communities/server/feed"
import { readPlaces } from "@/lib/nav/places-server"
import { SIGNED_OUT_PLACES } from "@/lib/nav/places-shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * GET /api/me/places
 *
 * What the navigator (components/nav/place-navigator.tsx) lists for the
 * person asking: the digital products and courses they opened or bought
 * most recently, their communities, most recently visited first, and
 * whether they get Dashboard or Start creating at its foot. Answers
 * { signedIn, communitiesOn, isCreator, hasSellerAccess, communities:
 * [{ id, slug, name, logoUrl }], products: [{ id, kind: "product" |
 * "course", title, coverUrl }] } (lib/nav/places-shared.ts).
 *
 * The person comes from the session and nowhere else; signed out is a 200
 * with every list empty, because a visitor's navigator is a normal thing to
 * draw and not an error. Nothing in the answer is anybody else's: names,
 * slugs and logos of communities this person is an active member of, and
 * titles and covers of things they bought. Never cached by anything but
 * the browser tab that asked. A read only, of the person's own
 * rows, asked for when the panel is about to open (never on every page
 * load), so it is not counted against a rate limit, which would cost a
 * write per open.
 */
export async function GET() {
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json(SIGNED_OUT_PLACES, { headers: NO_STORE })
  try {
    return NextResponse.json(await readPlaces(admin(), userId), { headers: NO_STORE })
  } catch {
    /* Never a broken menu: the person is signed in, with nothing listed. */
    return NextResponse.json({ ...SIGNED_OUT_PLACES, signedIn: true }, { headers: NO_STORE })
  }
}
