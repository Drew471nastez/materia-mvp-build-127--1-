import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"
import { personCard } from "@/lib/communities/server/people"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; userId: string }> }

/**
 * GET /api/community/<id>/people/<userId>/card -> { person } | 404
 *
 * The hover card on a name inside a community
 * (components/community/member/person-card.tsx). For active members of this
 * community only, about another active member of it; public facts only
 * (lib/communities/server/people.ts): never an email, a payment or a
 * private community. Rate limited per member, so it cannot be used to sweep
 * a member list.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, userId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("card"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.card })
  if (limited) return limited
  const person = await personCard(db, gate.community, gate.viewer, userId)
  if (!person) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  return NextResponse.json({ person }, { headers: NO_STORE })
}
