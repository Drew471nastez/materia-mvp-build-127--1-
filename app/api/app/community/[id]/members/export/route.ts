import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { audit } from "@/lib/communities/server/audit"
import { manageLimit, membersCsv } from "@/lib/communities/server/creator"
import { parseMemberQuery } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/app/community/<id>/members/export?status=&role=&tier=
 * The members as CSV, streamed a page at a time (never all in memory).
 * The owner and admins only, with emails.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "manage_members")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const query = parseMemberQuery(new URL(request.url).searchParams)
  await audit(gate.ctx.admin, { communityId: gate.community.id, actorId: gate.ctx.userId, actorKind: "member", action: "members.exported", targetType: "community", targetId: gate.community.id, detail: { status: query.status, role: query.role, tierId: query.tierId } })
  const stream = membersCsv(gate.ctx.admin, gate.community, query, { withEmail: true })
  const day = new Date().toISOString().slice(0, 10)
  return new Response(stream, {
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${gate.community.slug}-members-${day}.csv"`,
    },
  })
}
