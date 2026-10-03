import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { chatSpace, markRead } from "@/lib/communities/server/chat"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; spaceId: string }> }

/** POST: the member has read this chat space up to now. Counted in the reactions window. */
export async function POST(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, spaceId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("reaction"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.reaction })
  if (limited) return limited
  const space = await chatSpace(db, gate.community, gate.viewer, spaceId)
  if (!space) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  await markRead(db, String(gate.viewer.userId), space.id)
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
