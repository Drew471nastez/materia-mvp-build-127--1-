import { NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { getMainDomain } from "@/lib/url-helpers"
import { countRowSeries, reportQuestion } from "@/lib/analytics/report-answer"
import { isRowDim } from "@/lib/analytics/row-series"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * EACH ROW'S OWN LINE, FOR ONE REPORT THAT IS OPENED (app/app/analytics
 * report-detail): `dim` is the report's rows (page, link, nav, product,
 * source, social, referrer, campaign, country, device, browser), and the rest
 * of the address is the page's own question, read by the very function the
 * reports read it with (lib/analytics/report-answer reportQuestion), so the
 * store is the signed in user's (or the one their team role works in), a
 * place that is not theirs is refused, and a product that is not theirs is
 * ignored. Asked only when a report is opened, never with the page.
 *
 * The answer: the chart's bucket labels and, per row key, a number per
 * bucket (lib/analytics/row-series). Kept for the same few seconds as the
 * reports, privately.
 */
const HEADERS = { "Cache-Control": "private, max-age=15", Vary: "Cookie, Authorization" }

export async function GET(request: Request) {
  const gate = await requireTeamPermission("analytics", { read: true })
  if (gate instanceof NextResponse) return gate

  const url = new URL(request.url)
  const dim = url.searchParams.get("dim")
  if (!isRowDim(dim)) return NextResponse.json({ error: "Unknown report" }, { status: 400 })
  const asked = await reportQuestion(gate.db, gate.userId, url, getMainDomain(), { creatorId: gate.creatorId, ownerUserId: gate.ownerUserId })
  if ("error" in asked) return NextResponse.json({ error: asked.error }, { status: asked.status })
  try {
    return NextResponse.json(await countRowSeries(gate.db, asked, dim), { headers: HEADERS })
  } catch (error) {
    console.error("[analytics/rows]", (error as Error).message)
    return NextResponse.json({ error: "Could not read analytics" }, { status: 500 })
  }
}
