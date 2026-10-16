import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { communityOpen, loadCommunity, viewerContext } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"
import { readJoinForm } from "@/lib/communities/server/join-questions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET /api/community/<communityId>/join-questions -> { questions }
 *
 * What the join form asks (round 32, run-now part 186), for the signed in
 * person about to join: 401 signed out (the join button sends them to sign
 * in first), 403 when they are banned or removed, 404 for a draft,
 * archived, suspended or deleted community, like its page. The answers are
 * never read here; they go with POST join, which checks them again.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community || !communityOpen(community) || community.status !== "published" || community.archived_at) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const userId = await sessionUserId()
  if (!userId) return NextResponse.json({ error: "sign_in" }, { status: 401, headers: NO_STORE })
  const viewer = await viewerContext(db, community, userId)
  if (viewer.banned || viewer.status === "banned" || viewer.status === "removed") return NextResponse.json({ error: "banned" }, { status: 403, headers: NO_STORE })
  const form = await readJoinForm(db, community.id)
  return NextResponse.json({ questions: form.questions }, { headers: NO_STORE })
}
