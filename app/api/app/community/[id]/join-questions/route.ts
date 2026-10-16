import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { readJoinForm, saveJoinForm } from "@/lib/communities/server/join-questions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/app/community/<id>/join-questions -> { ready, questions }
 * PUT /api/app/community/<id>/join-questions { questions } -> { questions }
 *
 * Settings › Access › Questions before joining (round 32). Whoever may
 * change the community's settings (manage_settings) reads and writes them;
 * `ready` is false until run-now part 189 has made the table, and a PUT
 * then answers 503 not_ready.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json(await readJoinForm(gate.ctx.admin, gate.community.id), { headers: noStore })
}

export async function PUT(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const saved = await saveJoinForm(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, raw: body.questions })
  if (!saved.ok) return NextResponse.json({ error: saved.error, index: saved.index }, { status: saved.status, headers: noStore })
  return NextResponse.json({ questions: saved.questions }, { headers: noStore })
}
