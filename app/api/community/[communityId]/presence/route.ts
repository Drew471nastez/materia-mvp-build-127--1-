import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"
import { touchPresence } from "@/lib/communities/server/presence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * POST /api/community/<id>/presence -> { ok: true, ready: boolean }
 *
 * The heartbeat a member page sends once a minute while it is on screen
 * (components/community/member/shell-frame.tsx). It only ever marks the
 * signed in member as here now: no body is read, so nobody can mark anybody
 * else. The write happens at most once a minute per member however often
 * this is called (lib/communities/server/presence.ts touchPresence), and the
 * route is rate limited on top. ready is false until part 85 has added
 * community_members.last_seen_at, and the page then stops asking.
 */
export async function POST(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: rateBucket("presence"), subjects: [memberSubject(String(gate.viewer.userId))], windows: RATE_LIMITS.presence })
  if (limited) return limited
  const done = await touchPresence(db, gate.community.id, String(gate.viewer.userId))
  return NextResponse.json({ ok: true, ready: done.ready }, { headers: NO_STORE })
}
