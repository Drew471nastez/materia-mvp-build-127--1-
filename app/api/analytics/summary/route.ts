import { NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { getMainDomain } from "@/lib/url-helpers"
import { isTimeZone } from "@/lib/orders/time-zone"
import { boundsOf, presetRange, todayIn } from "@/lib/date-range/range"
import { salesFor } from "@/lib/analytics/reports"
import { ownsProperty, parseProperty, propertyParam } from "@/lib/analytics/properties"
import { summaryHref, SUMMARY_PRESET } from "@/lib/analytics/summary"
import { reportNow } from "@/lib/analytics/report-cache"
import { countVisits, creatorProperties, foldLegacy, readLegacyOnePage, readOrders } from "@/lib/analytics/report-read"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * ONE PLACE'S LAST 30 DAYS, IN TWO NUMBERS: its visitors and its orders,
 * for the line on the Website screen and in the OnePage editor
 * (components/app/analytics-summary-line). The same counting as Analytics
 * (analytics_report's quick part, orders from `orders`), for the same
 * "Last 30 days" on the creator's clock, so the numbers match the page the
 * line links to.
 *
 * Kept a minute per person and question, here and in the browser: the
 * line is a glance, not a live counter.
 */
const CACHE_MS = 60_000
const kept = new Map<string, { at: number; answer: Record<string, unknown> }>()
const HEADERS = { "Cache-Control": `private, max-age=${CACHE_MS / 1000}`, Vary: "Cookie, Authorization" }

export async function GET(request: Request) {
  /* The store's line, for its owner or a team member given Analytics (lib/team). */
  const gate = await requireTeamPermission("analytics")
  if (gate instanceof NextResponse) return gate

  const url = new URL(request.url)
  const tz = url.searchParams.get("tz")
  const timeZone = isTimeZone(tz) ? tz : "UTC"
  const selector = parseProperty(url.searchParams.get("property"))
  /* "Now" as the Analytics page rounds it (lib/analytics/report-cache), so the line and the page it opens count the same moments. */
  const now = reportNow()
  const today = todayIn(timeZone, now)
  const key = `${gate.viewer}|${propertyParam(selector) ?? "all"}|${timeZone}|${today}`
  const hit = kept.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.answer, { headers: HEADERS })

  const admin = gate.db
  const creator = { id: gate.creatorId }
  const properties = await creatorProperties(admin, creator.id, gate.ownerUserId)
  /* Only the creator's own places: anybody else's website is nothing at all. */
  if (!ownsProperty(properties, selector)) return NextResponse.json({ error: "No such property" }, { status: 404 })

  try {
    const window = boundsOf(presetRange(SUMMARY_PRESET, today), timeZone, now)
    const q = {
      creatorId: creator.id,
      selector,
      properties,
      product: null,
      window,
      previous: null,
      timeZone,
      mainDomain: getMainDomain(),
      part: "figures" as const,
    }
    const [visits, legacy, orders] = await Promise.all([countVisits(admin, q), readLegacyOnePage(admin, q), readOrders(admin, [window], creator.id, null)])
    const wire = foldLegacy(visits.wire, legacy.legacy, q)
    const sales = salesFor(orders.rows, selector, properties.defaultWebsite).filter((o) => {
      const at = Date.parse(o.createdAt)
      return at >= window.start && at < window.end
    })
    const answer = {
      visitors: wire.cur.visitors ?? 0,
      orders: sales.length,
      href: summaryHref(selector),
      viewer: gate.viewer,
    }
    kept.set(key, { at: Date.now(), answer })
    while (kept.size > 500) kept.delete(kept.keys().next().value as string)
    return NextResponse.json(answer, { headers: HEADERS })
  } catch (error) {
    console.error("[analytics/summary]", (error as Error).message)
    return NextResponse.json({ error: "Could not read analytics" }, { status: 500 })
  }
}
