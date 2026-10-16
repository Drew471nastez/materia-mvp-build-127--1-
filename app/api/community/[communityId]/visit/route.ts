import { NextResponse, type NextRequest } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { loadCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { readVisitBody, recordVisit } from "@/lib/communities/server/record-view"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * POST /api/community/<id>/visit { path, referrer, touch } -> { ok, counted }
 *
 * A page of the community is on somebody's screen (components/community/
 * public/visit-beacon.tsx, sent from the community's layout once a day per
 * browser). Counted once a visitor a day by the database
 * (lib/communities/server/record-view.ts recordVisit), with how they came,
 * their device and country, and whether they were a member. Signed out
 * visitors too, and on the community's own domain, where nobody is signed
 * in. Only from the page itself: a request another site makes is refused.
 * Nothing in the answer says anything about the visitor.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE })
  const { communityId } = await params
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const body = readVisitBody(await readJson(request))
  const outcome = await recordVisit(db, community, {
    headers: request.headers,
    browserId: request.cookies.get("materia_visitor")?.value ?? request.cookies.get("visitor_id")?.value ?? null,
    userId: await sessionUserId(),
    body,
  })
  return NextResponse.json({ ok: outcome !== "unavailable", counted: outcome === "counted" }, { headers: NO_STORE })
}
