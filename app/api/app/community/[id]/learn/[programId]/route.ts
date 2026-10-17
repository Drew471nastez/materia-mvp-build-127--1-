import { NextResponse } from "next/server"
import { STORELIB_CHARGE_CURRENCY } from "@/lib/pricing/surface-currency"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { deleteProgram, updateProgram } from "@/lib/communities/server/learn"
import { isUuid } from "@/lib/courses/access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; programId: string }> }

/**
 * PATCH  /api/app/community/<id>/learn/<programId> { title?, summary?, coverUrl?, status?, mode?, level?, priceCents?, dripDays?, memberIds? }
 *        The builder's Save: only the fields sent change (lib/communities/learn.ts checkProgramInput).
 * DELETE /api/app/community/<id>/learn/<programId>
 *        Out of Learn: an attached course is only taken out; a program made here goes with its lessons, unless members bought it.
 */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, programId } = await params
  if (!isUuid(programId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  /* A program is priced in Storelib's currency, never a store's (lib/pricing/surface-currency). */
  const done = await updateProgram(gate.ctx.admin, { communityId: gate.community.id, programId, actorId: gate.ctx.userId, input: body, currency: STORELIB_CHARGE_CURRENCY })
  if (done.ok === false) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, programId } = await params
  if (!isUuid(programId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await deleteProgram(gate.ctx.admin, { communityId: gate.community.id, programId, actorId: gate.ctx.userId })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
