import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { givePoints, manageLimit } from "@/lib/communities/server/creator"
import { checkPoints, isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/app/community/<id>/gamification/points { userId, points, note? } -> { level }: points by hand, positive or negative, logged. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "award_points")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  if (!isUuid(body.userId)) return NextResponse.json({ error: "Pick a member.", field: "user" }, { status: 400, headers: noStore })
  const points = checkPoints(body.points)
  if (!points.ok) return NextResponse.json({ error: points.error, field: points.field }, { status: 400, headers: noStore })
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null
  const done = await givePoints(gate.ctx.admin, { communityId: gate.community.id, userId: body.userId, actorId: gate.ctx.userId, points: points.value, note })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ level: done.level }, { headers: noStore })
}
