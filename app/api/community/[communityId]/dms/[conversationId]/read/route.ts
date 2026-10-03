import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { conversationOf, markConversationRead } from "@/lib/communities/server/direct"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; conversationId: string }> }

/** POST: the viewer has seen this conversation up to now. */
export async function POST(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, conversationId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: rateBucket("dmTouch"),
    subjects: [memberSubject(String(gate.viewer.userId))],
    windows: RATE_LIMITS.dmTouch,
    message: "Slow down a little. Try again in a moment.",
  })
  if (limited) return limited
  const conversation = await conversationOf(db, gate.community, gate.viewer, conversationId)
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  await markConversationRead(db, conversation, gate.viewer)
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
