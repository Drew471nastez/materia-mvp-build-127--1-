import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { createSpace, loadSpaces, manageLimit, reorderSpaces } from "@/lib/communities/server/creator"
import { checkSpace } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/spaces -> { spaces }
 * POST /api/app/community/<id>/spaces { name, description?, icon?, kind, postRole, commentsEnabled, viewAccess } -> { space }
 * PUT  /api/app/community/<id>/spaces { ids: [every space id, in the new order] }
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_spaces")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json({ spaces: await loadSpaces(gate.ctx.admin, gate.community.id) }, { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_spaces")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const checked = checkSpace(await readJson(request), { creating: true })
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  const made = await createSpace(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, input: checked.value })
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status, headers: noStore })
  return NextResponse.json({ space: made.space }, { status: 201, headers: noStore })
}

export async function PUT(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_spaces")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await reorderSpaces(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, ids: body.ids })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
