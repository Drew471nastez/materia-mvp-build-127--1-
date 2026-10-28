import { NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { commerceContext, countCommerce } from "@/lib/analytics/commerce-server"
import { isTimeZone } from "@/lib/orders/time-zone"
import { parseProperty } from "@/lib/analytics/properties"
import { parseMode } from "@/lib/analytics/sections"

export const dynamic = "force-dynamic"

const DAY = 86_400_000
/** The same ceiling as /api/analytics/reports, so All time is the same period on every card. */
const MAX_SPAN = 30 * 366 * DAY

/** An instant from the address: ms since 1970 or an ISO date. */
function instant(v: string | null): number | null {
  if (!v) return null
  const n = /^\d+$/.test(v) ? Number(v) : Date.parse(v)
  return Number.isFinite(n) ? n : null
}

/**
 * THE STORE'S SALES REPORTS (app/app/analytics commerce-reports): the sales
 * breakdown, sales and average order value over time, sales by channel, the
 * returning customer rate, the fulfillment rate and how long physical orders
 * take to ship, for the period asked and the one it is compared with. Every
 * amount in the store's currency. Counted by lib/analytics/commerce
 * commerceReport, payment by payment, by the rules the page's tabs use, so
 * Total sales is Revenue to the cent.
 *
 *   ?from=&to=           the period (ms)
 *   &cstart=&cend=       what it is compared with, the very instants the
 *                        chart above was asked for (lib/date-range/range
 *                        compareBounds)
 *   &compare=none        no comparison (All time)
 *   &tz=                 the seller's time zone: the chart's buckets start
 *                        at their midnight
 *   &product= &property= the same filters as every other figure
 *   &kind=               the All / Digital / Physical switch
 */
export async function GET(request: Request) {
  /* The store's sales, for its owner or a team member given Analytics (lib/team). */
  const gate = await requireTeamPermission("analytics")
  if (gate instanceof NextResponse) return gate

  const url = new URL(request.url)
  const end = Math.min(Date.now() + DAY, Number(url.searchParams.get("to")) || Date.now())
  const start = Math.max(end - MAX_SPAN, Number(url.searchParams.get("from")) || end - 30 * DAY)
  if (!(end > start)) return NextResponse.json({ error: "Bad period" }, { status: 400 })
  const length = end - start
  const tzParam = url.searchParams.get("tz")
  const timeZone = isTimeZone(tzParam) ? tzParam : "UTC"
  const cs = instant(url.searchParams.get("cstart"))
  const ce = instant(url.searchParams.get("cend"))
  const previous =
    url.searchParams.get("compare") === "none"
      ? null
      : cs !== null && ce !== null && ce > cs && ce - cs <= MAX_SPAN
        ? { start: cs, end: ce }
        : { start: start - length, end: start }

  const admin = gate.db
  const creatorId = gate.creatorId
  const selector = parseProperty(url.searchParams.get("property"))
  /* The owner's account for the OnePage, whoever is asking (lib/analytics/report-read creatorProperties). */
  const context = await commerceContext(admin, gate.ownerUserId ?? gate.userId, creatorId, selector, url.searchParams.get("product"))
  if (!context) return NextResponse.json({ error: "No such property" }, { status: 404 })

  try {
    const answer = await countCommerce(admin, {
      creatorId,
      properties: context.properties,
      selector,
      productId: context.productId,
      productTypes: context.productTypes,
      span: { start, end },
      previous,
      timeZone,
      mode: parseMode(url.searchParams.get("kind")),
    })
    /* The period's payments are for the export, not for the page. */
    const { orders: _orders, ...rest } = answer
    return NextResponse.json({ ...rest, viewer: gate.viewer }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("[analytics/commerce]", (error as Error).message)
    return NextResponse.json({ error: "Reports are not available right now." }, { status: 500 })
  }
}
