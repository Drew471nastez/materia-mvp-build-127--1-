import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { RANGE_KEYS, periodFor, previousPeriod, type RangeKey } from "@/lib/reviews/analytics"
import { loadAnalytics } from "@/lib/reviews/dashboard-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Reviews › Analytics: the rows of a period and the one before it, for the
 * page to count (lib/reviews/analytics.ts), so a change of chart never asks
 * again.
 *
 *   GET ?range=7d|30d|90d|12m   or   ?range=custom&from=2026-01-01&to=2026-03-31
 *       → { period, previous, reviews, requests, capped }
 */
export async function GET(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const p = new URL(request.url).searchParams
  const key = ((RANGE_KEYS as readonly string[]).includes(p.get("range") ?? "") || p.get("range") === "custom" ? p.get("range") : "30d") as RangeKey
  const period = periodFor(key, Date.now(), { from: p.get("from"), to: p.get("to") })
  const previous = previousPeriod(period)
  const rows = await loadAnalytics(c.db, c.creatorId, new Date(previous.from).toISOString(), new Date(period.to).toISOString())
  return physicalJson({ range: key, period, previous, ...rows })
}
