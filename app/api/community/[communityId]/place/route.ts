import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"
import { loadPlace } from "@/lib/communities/server/places"
import { placeFromKey, placeKey } from "@/lib/communities/client/places"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET ?p=<place>[&lesson=<id>]: the first screen of a place in this community, as data (round 15). The community's shell
 * asks this when a member moves to a place it does not hold yet, and once the first screen has painted, for every place
 * in the background. The same loader as the place's own server page (lib/communities/server/places.ts), so the two never
 * disagree. Members only (requireMember), and never another community's row: the loader checks every id against this one.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const url = new URL(request.url)
  const place = placeFromKey(url.searchParams.get("p"))
  if (!place) return NextResponse.json({ ok: false, error: "bad_place" }, { status: 400, headers: NO_STORE })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const load = await loadPlace(db, gate.community, gate.viewer, place, { lesson: url.searchParams.get("lesson") })
  if (!load.ok) return NextResponse.json({ ok: false, error: load.error }, { status: load.status, headers: NO_STORE })
  return NextResponse.json({ ok: true, key: placeKey(load.place), data: load.data }, { headers: NO_STORE })
}
