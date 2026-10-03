import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { detachCourse, manageLimit, updateCourse } from "@/lib/communities/server/creator"
import { checkAccessRule, isUuid } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; productId: string }> }

/**
 * PATCH  /api/app/community/<id>/classroom/<productId> { access?, dripDays? } who sees the course, and how many days after joining it opens.
 * DELETE /api/app/community/<id>/classroom/<productId> takes it out of the classroom (the course product itself is untouched).
 */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, productId } = await params
  if (!isUuid(productId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await updateCourse(gate.ctx.admin, {
    communityId: gate.community.id,
    productId,
    actorId: gate.ctx.userId,
    access: body.access !== undefined ? checkAccessRule(body.access) : undefined,
    dripDays: body.dripDays,
  })
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, productId } = await params
  if (!isUuid(productId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await detachCourse(gate.ctx.admin, { communityId: gate.community.id, productId, actorId: gate.ctx.userId })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
