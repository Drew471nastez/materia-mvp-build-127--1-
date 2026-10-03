import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { attachCourse, loadClassroom, manageLimit, reorderCourses } from "@/lib/communities/server/creator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/classroom -> { attached, available }: the courses in the classroom and the creator's others.
 * POST /api/app/community/<id>/classroom { productId } attaches one of the creator's own course products.
 * PUT  /api/app/community/<id>/classroom { ids: [every attached course, in the new order] }
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json(await loadClassroom(gate.ctx.admin, gate.community.id, gate.ctx.creatorId), { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await attachCourse(gate.ctx.admin, { communityId: gate.community.id, creatorId: gate.ctx.creatorId, productId: String(body.productId ?? ""), actorId: gate.ctx.userId })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { status: 201, headers: noStore })
}

export async function PUT(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await reorderCourses(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, ids: body.ids })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
