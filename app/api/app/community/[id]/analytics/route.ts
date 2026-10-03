import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { loadAnalytics } from "@/lib/communities/server/analytics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/app/community/<id>/analytics?days=30|90 -> the daily figures and today so far. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view_analytics")
  if (gate instanceof NextResponse) return gate
  const days = new URL(request.url).searchParams.get("days") === "90" ? 90 : 30
  return NextResponse.json(await loadAnalytics(gate.ctx.admin, gate.community, days), { headers: noStore })
}
