import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { conversationOf, listDirectMessages, sendDirectMessage } from "@/lib/communities/server/direct"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; conversationId: string }> }

/** GET ?before=<iso> | ?after=<iso>: { messages (oldest first), hasMore }. Only a conversation the viewer is in. */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, conversationId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const conversation = await conversationOf(db, gate.community, gate.viewer, conversationId)
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const sp = new URL(request.url).searchParams
  return NextResponse.json(await listDirectMessages(db, conversation, gate.viewer, { before: sp.get("before"), after: sp.get("after") }), { headers: NO_STORE })
}

/** POST { body }: { message }. 30 a minute and 500 a day per member. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, conversationId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: rateBucket("dm"),
    subjects: [memberSubject(String(gate.viewer.userId))],
    windows: RATE_LIMITS.dm,
    message: "Slow down a little. Try again in a moment.",
  })
  if (limited) return limited
  const conversation = await conversationOf(db, gate.community, gate.viewer, conversationId)
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const result = await sendDirectMessage(db, gate.community, gate.viewer, conversation, await readJson(request))
  if (!result.ok) return NextResponse.json({ error: result.error, ...("code" in result && result.code ? { code: result.code } : {}) }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ message: result.value }, { status: 201, headers: NO_STORE })
}
