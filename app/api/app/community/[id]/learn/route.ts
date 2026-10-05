import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { attachCourseProgram, createProgram, reorderPrograms } from "@/lib/communities/server/learn"
import { learnBuilderFor } from "@/lib/communities/server/learn-builder"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * The builder of a community's Learn (components/community/learn/learn-builder.tsx), for whoever may manage it.
 *
 * GET  /api/app/community/<id>/learn -> LearnBuilderData
 * POST /api/app/community/<id>/learn { title }      a new program, as a draft -> { id }
 *      /api/app/community/<id>/learn { productId }  one of the creator's course products, attached -> { id }
 * PUT  /api/app/community/<id>/learn { ids }        every program, in the new order
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json(await learnBuilderFor(gate.ctx.admin, gate.community), { headers: noStore })
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
  const done =
    body.productId !== undefined
      ? await attachCourseProgram(gate.ctx.admin, { communityId: gate.community.id, creatorId: gate.ctx.creatorId, productId: body.productId, actorId: gate.ctx.userId })
      : await createProgram(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, title: body.title })
  if (done.ok === false) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ id: done.id }, { status: 201, headers: noStore })
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
  const done = await reorderPrograms(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, ids: body.ids })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
