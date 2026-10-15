import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore } from "@/lib/email-campaigns/route-auth"
import { loadAnalytics } from "@/lib/communities/server/analytics"
import { loadMoneyAndGrowth } from "@/lib/communities/server/stats"
import { MAX_SPAN_MS, loadCommunityReport } from "@/lib/communities/server/analytics-report"
import { isTimeZone } from "@/lib/orders/time-zone"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** An instant from the address, or null. */
function instant(v: string | null): number | null {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/**
 * GET /api/app/community/<id>/analytics
 *
 *   ?start=&end=&tz=[&cstart=&cend=]   round 31: the period the /app date
 *                                      picker chose, in the viewer's zone,
 *                                      with the period it is compared with
 *                                      (none for All time), counted by
 *                                      lib/communities/server/analytics-report.ts
 *   ?days=30|90                        the earlier answer: the daily figures and
 *                                      today so far, with revenue, joins by source
 *                                      and active members (`money`)
 *
 * Behind view_analytics, never cached.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "view_analytics")
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const start = instant(url.searchParams.get("start"))
  const end = instant(url.searchParams.get("end"))
  if (start !== null || end !== null) {
    const tz = url.searchParams.get("tz")
    if (start === null || end === null || end <= start || end - start > MAX_SPAN_MS || !isTimeZone(tz)) {
      return NextResponse.json({ error: "bad_period", message: "That period could not be read." }, { status: 400, headers: noStore })
    }
    const cstart = instant(url.searchParams.get("cstart"))
    const cend = instant(url.searchParams.get("cend"))
    const compare = cstart !== null && cend !== null && cend > cstart && cend - cstart <= MAX_SPAN_MS ? { start: cstart, end: cend } : null
    const report = await loadCommunityReport(gate.ctx.admin, gate.community, { start, end, compare, timeZone: tz as string })
    return NextResponse.json(report, { headers: noStore })
  }
  const days = url.searchParams.get("days") === "90" ? 90 : 30
  const [figures, money] = await Promise.all([loadAnalytics(gate.ctx.admin, gate.community, days), loadMoneyAndGrowth(gate.ctx.admin, gate.community.id, days)])
  return NextResponse.json({ ...figures, money }, { headers: noStore })
}
