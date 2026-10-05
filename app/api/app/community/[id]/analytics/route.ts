import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { loadAnalytics } from "@/lib/communities/server/analytics"
import { loadMoneyAndGrowth } from "@/lib/communities/server/stats"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/app/community/<id>/analytics?days=30|90 -> the daily figures and today so far, with revenue, joins by source and active members (`money`). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view_analytics")
  if (gate instanceof NextResponse) return gate
  const days = new URL(request.url).searchParams.get("days") === "90" ? 90 : 30
  const [figures, money] = await Promise.all([loadAnalytics(gate.ctx.admin, gate.community, days), loadMoneyAndGrowth(gate.ctx.admin, gate.community.id, days)])
  return NextResponse.json({ ...figures, money }, { headers: noStore })
}
