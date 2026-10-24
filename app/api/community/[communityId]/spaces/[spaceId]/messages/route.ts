import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { chatSpace, listMessages, postMessage } from "@/lib/communities/server/chat"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; spaceId: string }> }

/**
 * GET ?before=<iso> | ?after=<iso> | ?ids=a,b: { messages (oldest first), hasMore }.
 * The page asks with `after` when the realtime stream says the space moved.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, spaceId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const space = await chatSpace(db, gate.community, gate.viewer, spaceId)
  if (!space) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const sp = new URL(request.url).searchParams
  const ids = (sp.get("ids") || "").split(",").filter(Boolean)
  const page = await listMessages(db, gate.community, gate.viewer, space, { before: sp.get("before"), after: sp.get("after"), ids })
  return NextResponse.json(page, { headers: NO_STORE })
}

/** POST { body, replyToId? }: { message }. 30 messages a minute per member. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, spaceId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: rateBucket("chat"),
    subjects: [memberSubject(String(gate.viewer.userId))],
    windows: RATE_LIMITS.chat,
    message: "Slow down a little. Try again in a moment.",
  })
  if (limited) return limited
  const space = await chatSpace(db, gate.community, gate.viewer, spaceId)
  if (!space) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const result = await postMessage({ db, community: gate.community, viewer: gate.viewer }, space, await readJson(request))
  if (!result.ok) return NextResponse.json({ error: result.error, ...("code" in result && result.code ? { code: result.code } : {}) }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ message: result.value }, { status: 201, headers: NO_STORE })
}
