import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { createBadge, manageLimit } from "@/lib/communities/server/creator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/app/community/<id>/gamification/badges { name, description?, icon? } -> { badge }: a badge to give by hand. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_gamification")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const made = await createBadge(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, name: body.name, description: body.description, icon: body.icon })
  if (!made.ok) return NextResponse.json({ error: made.error, field: made.field }, { status: made.status, headers: noStore })
  return NextResponse.json({ badge: made.badge }, { status: 201, headers: noStore })
}
