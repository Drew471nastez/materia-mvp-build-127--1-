import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { REACTION_TARGETS, isOneOf } from "@/lib/communities/types"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { setReaction } from "@/lib/communities/server/reactions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * POST { targetType: "post"|"comment"|"message", targetId, on: boolean }
 * Answers { on, count }: the state the member now has and the real count.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "react")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: rateBucket("reaction"),
    subjects: [memberSubject(String(gate.viewer.userId))],
    windows: RATE_LIMITS.reaction,
    message: "That is a lot of likes in a short time. Try again in a few minutes.",
  })
  if (limited) return limited
  const body = await readJson(request)
  if (!isOneOf(REACTION_TARGETS, body.targetType) || typeof body.targetId !== "string") return NextResponse.json({ error: "That is gone." }, { status: 400, headers: NO_STORE })
  const result = await setReaction({ db, community: gate.community, viewer: gate.viewer }, body.targetType, body.targetId, body.on !== false)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json(result.value, { headers: NO_STORE })
}
