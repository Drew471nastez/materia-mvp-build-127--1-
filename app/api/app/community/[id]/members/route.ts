import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { can } from "@/lib/communities/permissions"
import { grantComplimentary, listMembers, manageLimit, memberCounts, revokeComplimentary } from "@/lib/communities/server/creator"
import { parseMemberQuery } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ id: string }> }

/**
 * GET  /api/app/community/<id>/members?status=&role=&tier=&q=&cursor=&counts=1
 *      -> { rows, next, capped, counts? }: 50 at a time, keyset paged. Emails
 *      only for the owner and admins (manage_members).
 * POST /api/app/community/<id>/members
 *      { action: "complimentary", userId? | email?, tierId } lets somebody in without paying;
 *      { action: "end_complimentary", userId } ends that.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "remove_member")
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const query = parseMemberQuery(url.searchParams)
  const withEmail = can(gate.role, "manage_members", gate.viewer.perms)
  const [page, counts] = await Promise.all([
    listMembers(gate.ctx.admin, gate.community.id, query, { withEmail }),
    url.searchParams.get("counts") === "1" ? memberCounts(gate.ctx.admin, gate.community.id) : Promise.resolve(undefined),
  ])
  return NextResponse.json({ ...page, counts }, { headers: noStore })
}

export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_members")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const db = gate.ctx.admin
  if (body.action === "complimentary") {
    const done = await grantComplimentary(db, { community: gate.community, actorId: gate.ctx.userId, userId: body.userId, email: body.email, tierId: body.tierId })
    if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
    return NextResponse.json({ userId: done.userId }, { headers: noStore })
  }
  if (body.action === "end_complimentary") {
    const done = await revokeComplimentary(db, { community: gate.community, actorId: gate.ctx.userId, userId: body.userId })
    if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
    return NextResponse.json({ ok: true }, { headers: noStore })
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
}
