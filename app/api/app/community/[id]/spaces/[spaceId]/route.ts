import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { deleteSpace, manageLimit, updateSpace } from "@/lib/communities/server/creator"
import { checkSpace, isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; spaceId: string }> }

/**
 * PATCH  /api/app/community/<id>/spaces/<spaceId>  { name, description, icon, kind, postRole, commentsEnabled, viewAccess, archived? }
 * DELETE /api/app/community/<id>/spaces/<spaceId>  only when nothing was ever posted in it (archive it otherwise).
 */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, spaceId } = await params
  if (!isUuid(spaceId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_spaces")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const checked = checkSpace(body, { creating: false })
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  const done = await updateSpace(gate.ctx.admin, { communityId: gate.community.id, spaceId, actorId: gate.ctx.userId, input: checked.value, archived: typeof body.archived === "boolean" ? body.archived : undefined })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, spaceId } = await params
  if (!isUuid(spaceId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_spaces")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await deleteSpace(gate.ctx.admin, { communityId: gate.community.id, spaceId, actorId: gate.ctx.userId })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
