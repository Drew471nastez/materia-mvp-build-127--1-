import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, castVote, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; pollId: string }> }

/** POST { optionIds: string[] }: the member's answer (an empty list takes it back). Answers { poll }. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, pollId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "react")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("reaction"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.reaction })
  if (limited) return limited
  const body = await readJson(request)
  const result = await castVote({ db, community: gate.community, viewer: gate.viewer }, pollId, body.optionIds)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ poll: result.value }, { headers: NO_STORE })
}
