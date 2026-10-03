import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { deleteCommunity, manageLimit } from "@/lib/communities/server/creator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/app/community/<id>/delete  { confirm: "<the community's name>" }
 * The owner only. A soft delete: hidden everywhere, archived, off sale;
 * rows, posts and orders are kept. Refused while members still pay.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "delete")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await deleteCommunity(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, confirm: body.confirm })
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
