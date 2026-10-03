import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { awardBadge, deleteBadge, manageLimit } from "@/lib/communities/server/creator"
import { isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; badgeId: string }> }

/**
 * POST   /api/app/community/<id>/gamification/badges/<badgeId> { userId, on } gives a member the badge, or takes it back.
 * DELETE /api/app/community/<id>/gamification/badges/<badgeId> deletes the badge (and every award of it).
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, badgeId } = await params
  if (!isUuid(badgeId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "award_points")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  if (!isUuid(body.userId)) return NextResponse.json({ error: "Pick a member." }, { status: 400, headers: noStore })
  const done = await awardBadge(gate.ctx.admin, { communityId: gate.community.id, badgeId, userId: body.userId, actorId: gate.ctx.userId, on: body.on !== false })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, badgeId } = await params
  if (!isUuid(badgeId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_gamification")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await deleteBadge(gate.ctx.admin, { communityId: gate.community.id, badgeId, actorId: gate.ctx.userId })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
