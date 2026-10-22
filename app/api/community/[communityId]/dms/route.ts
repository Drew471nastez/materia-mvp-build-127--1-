import { NextResponse, after } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { conversationOf, findConversation, listConversations, markDelivered, newestPage, openConversation } from "@/lib/communities/server/direct"
import { authorViews } from "@/lib/communities/server/directory"
import { listGroups } from "@/lib/communities/server/groups"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET: { ready, conversations (newest first), groups, unread }. Only the viewer's own; round 37 adds the groups they are in, counted in unread.
 * GET ?with=<userId> (round 39): { conversation: { id, other } | null, page? }, the conversation with that member when
 * there is one, and its newest page: what a Message button asks while the pointer rests on it. Nothing is made.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const withId = new URL(request.url).searchParams.get("with")
  if (withId) {
    const found = await findConversation(db, gate.community, gate.viewer, withId)
    if (!found) return NextResponse.json({ conversation: null }, { headers: NO_STORE })
    const [people, page] = await Promise.all([authorViews(db, gate.community.id, [withId]), newestPage(db, found, gate.viewer)])
    return NextResponse.json({ conversation: { id: found.id, other: people.get(withId) ?? null }, page }, { headers: NO_STORE })
  }
  const [direct, groups] = await Promise.all([listConversations(db, gate.community, gate.viewer), listGroups(db, gate.community, gate.viewer)])
  /* Round 39: what this list holds has reached the member's screen; "delivered" for its senders, after the answer has gone. */
  const userId = gate.viewer.userId
  after(() => markDelivered(db, gate.community.id, userId))
  return NextResponse.json({ ...direct, groups: groups.groups, unread: direct.unread + groups.groups.filter((g) => g.unread).length }, { headers: NO_STORE })
}

/**
 * POST { userId, page? }: { conversation: { id, other }, page? }, the viewer's conversation with that member, made if
 * new. With `page` (round 39) its newest page comes in the same answer, so a conversation opened from a profile draws
 * its messages after one round trip, not two.
 */
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
  const body = (await readJson(request)) as { userId?: unknown; page?: unknown } | null
  const result = await openConversation(db, gate.community, gate.viewer, body?.userId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: NO_STORE })
  const opened = body?.page === true ? await conversationOf(db, gate.community, gate.viewer, result.value.id) : null
  return NextResponse.json({ conversation: result.value, ...(opened ? { page: await newestPage(db, opened, gate.viewer) } : {}) }, { headers: NO_STORE })
}
