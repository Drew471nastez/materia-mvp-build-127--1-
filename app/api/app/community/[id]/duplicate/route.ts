import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { duplicateCommunity } from "@/lib/communities/server/creator-policies"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/app/community/<id>/duplicate -> { id, slug }: a new draft with
 * this community's settings (lib/communities/server/creator.ts
 * duplicateCommunity). The owner only (transfer_ownership is the action
 * only an owner has); 402 plan_limit when the Free plan's two are made.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "transfer_ownership")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  if (gate.community.creator_id !== gate.ctx.creatorId) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore })
  const made = await duplicateCommunity(gate.ctx.admin, { source: gate.community, creatorId: gate.ctx.creatorId, userId: gate.ctx.userId })
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status, headers: noStore })
  return NextResponse.json({ id: made.community.id, slug: made.community.slug }, { status: 201, headers: noStore })
}
