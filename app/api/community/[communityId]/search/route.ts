import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"
import { searchCommunity, searchIndex } from "@/lib/communities/server/search"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET /api/community/<id>/search?q=<text> -> { results: { q, spaces, posts, members, lessons, events } }
 * GET /api/community/<id>/search?index=1  -> { index }  (round 10: what the
 *   search knows before a key is pressed, read once when the frame is idle)
 *
 * The search field in the community's bar (components/community/member/
 * search.tsx). For active members of this community only, from the session
 * (never a user id from the address); only what this member may see
 * (lib/communities/server/search.ts); rate limited per member, so it cannot
 * be used to sweep the community. Never an email.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("search"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.search })
  if (limited) return limited
  const url = new URL(request.url)
  if (url.searchParams.get("index") === "1") {
    const index = await searchIndex(db, gate.community, gate.viewer)
    return NextResponse.json({ index }, { headers: NO_STORE })
  }
  const q = url.searchParams.get("q")
  const results = await searchCommunity(db, gate.community, gate.viewer, q)
  return NextResponse.json({ results }, { headers: NO_STORE })
}
