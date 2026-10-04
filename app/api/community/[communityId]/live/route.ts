import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"
import { liveTopic } from "@/lib/communities/server/realtime"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET /api/community/<id>/live -> { topic } | { topic: null }
 *
 * The community's live channel name (lib/communities/server/realtime.ts),
 * for an active member only: new posts arrive on it by id, and a post's own
 * channel (its comments, who is writing) is this name with the post's id
 * after it. Null when the server cannot make one; the page then simply
 * shows what it read.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json({ topic: liveTopic(gate.community.id) }, { headers: NO_STORE })
}
