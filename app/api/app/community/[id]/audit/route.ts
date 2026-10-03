import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { auditLog } from "@/lib/communities/server/moderation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/app/community/<id>/audit?cursor= -> { rows, next }: the community's log, newest first. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view_audit")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json(await auditLog(gate.ctx.admin, gate.community.id, new URL(request.url).searchParams.get("cursor")), { headers: noStore })
}
