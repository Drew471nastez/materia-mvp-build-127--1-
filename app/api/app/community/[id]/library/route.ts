import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { createItem, libraryAdmin, reorderItems, setLibraryEnabled } from "@/lib/communities/server/library"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * The admin's Library (components/community/library/library-admin.tsx), for whoever may manage Learn and the Library.
 *
 * GET   /api/app/community/<id>/library -> AdminLibraryData
 * POST  /api/app/community/<id>/library { kind: "resource", title }        a new resource, as a draft -> { id }
 *       /api/app/community/<id>/library { kind: "product", productId }     one of the creator's products -> { id }
 * PUT   /api/app/community/<id>/library { ids }       every item, in the new order
 * PATCH /api/app/community/<id>/library { enabled }   the Library on or off (whoever may change settings)
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const creatorId = gate.community.creator_id
  const data = await libraryAdmin(gate.ctx.admin, gate.community, { canSell: async () => (creatorId ? (await import("@/lib/payments/service")).checkoutReadyForCreator(creatorId) : false) })
  return NextResponse.json(data, { headers: noStore })
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
  const done = await createItem(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, kind: body.kind, title: body.title, productId: body.productId })
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
  const done = await reorderItems(gate.ctx.admin, { communityId: gate.community.id, ids: body.ids })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await setLibraryEnabled(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, enabled: body.enabled })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true, enabled: done.enabled }, { headers: noStore })
}
