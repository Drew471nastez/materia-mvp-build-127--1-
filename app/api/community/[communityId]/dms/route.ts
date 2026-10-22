import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { listConversations, openConversation } from "@/lib/communities/server/direct"
import { listGroups } from "@/lib/communities/server/groups"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET: { ready, conversations (newest first), groups, unread }. Only the viewer's own; round 37 adds the groups they are in, counted in unread. */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const [direct, groups] = await Promise.all([listConversations(db, gate.community, gate.viewer), listGroups(db, gate.community, gate.viewer)])
  return NextResponse.json({ ...direct, groups: groups.groups, unread: direct.unread + groups.groups.filter((g) => g.unread).length }, { headers: NO_STORE })
}

/** POST { userId }: { conversation: { id, other } }, the viewer's conversation with that member, made if new. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: rateBucket("dmOpen"),
    subjects: [memberSubject(String(gate.viewer.userId))],
    windows: RATE_LIMITS.dmOpen,
    message: "You have started a lot of conversations. Try again later.",
  })
  if (limited) return limited
  const body = (await readJson(request)) as { userId?: unknown } | null
  const result = await openConversation(db, gate.community, gate.viewer, body?.userId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  return NextResponse.json({ conversation: result.value }, { headers: NO_STORE })
}
