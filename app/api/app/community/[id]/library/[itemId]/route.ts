import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { deleteItem, updateItem } from "@/lib/communities/server/library"
import { isLibraryId } from "@/lib/communities/library"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; itemId: string }> }

/**
 * One Library item, for whoever may manage it.
 *
 * PATCH  /api/app/community/<id>/library/<itemId> { title?, summary?, coverUrl?, status?, sectionId?, mode?, tierIds?, level?, priceCents?, memberIds?, files?, links? }
 *        only the fields sent; the files must already be in this admin's folder of the community (uploaded through
 *        /api/community/<id>/files), the cover in Storelib's storage, the tiers and members this community's
 * DELETE /api/app/community/<id>/library/<itemId>  out of the Library (a product made for it stays, for its buyers)
 */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, itemId } = await params
  if (!isLibraryId(itemId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await updateItem(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, itemId, input: body })
  if (done.ok === false) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, itemId } = await params
  if (!isLibraryId(itemId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await deleteItem(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, itemId })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
