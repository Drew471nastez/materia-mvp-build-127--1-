import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { conversationOf, deleteDirectMessage } from "@/lib/communities/server/direct"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; conversationId: string; messageId: string }> }

/** DELETE: the author deletes their own message. */
export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, conversationId, messageId } = await params
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
  const result = await deleteDirectMessage(db, conversation, gate.viewer, messageId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
