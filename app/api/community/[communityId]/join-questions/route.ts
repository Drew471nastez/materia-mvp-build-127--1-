import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { communityOpen, loadCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE } from "@/lib/communities/server/feed"
import { readJoinForm } from "@/lib/communities/server/join-questions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET /api/community/<communityId>/join-questions -> { questions }
 *
 * What the join form asks (round 32, run-now part 186): the questions the
 * community's admins wrote, for anybody who can see its page. A draft,
 * archived, suspended or deleted community answers 404, like its page. The
 * answers are never read here; they go with POST join.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community || !communityOpen(community) || community.status !== "published" || community.archived_at) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const form = await readJoinForm(db, community.id)
  return NextResponse.json({ questions: form.questions }, { headers: NO_STORE })
}
