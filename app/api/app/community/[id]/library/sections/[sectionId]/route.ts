import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { deleteSection, renameSection } from "@/lib/communities/server/library"
import { isLibraryId } from "@/lib/communities/library"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string; sectionId: string }> }

/**
 * PATCH  /api/app/community/<id>/library/sections/<sectionId> { name }  renamed
 * DELETE /api/app/community/<id>/library/sections/<sectionId>           gone; its items stay, with no section
 */
export async function PATCH(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, sectionId } = await params
  if (!isLibraryId(sectionId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await renameSection(gate.ctx.admin, { communityId: gate.community.id, sectionId: sectionId.toLowerCase(), name: body.name })
  if (done.ok === false) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id, sectionId } = await params
  if (!isLibraryId(sectionId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_classroom")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const done = await deleteSection(gate.ctx.admin, { communityId: gate.community.id, sectionId: sectionId.toLowerCase() })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
