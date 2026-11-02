import { NextResponse } from "next/server"
import { physicalCaller, physicalJson } from "@/lib/physical/auth"
import { physicalAnalytics } from "@/lib/physical/analytics-server"
import { loadSettings } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Physical sales for Analytics: `from` and `to` (milliseconds) are the
 * period the page is showing, so the card agrees with the chart above it;
 * `days` (the last 7, 30 or 90) is kept for anything that still asks that way.
 */
export async function GET(request: Request) {
  const c = await physicalCaller("store", { read: true })
  if (c instanceof NextResponse) return c
  const q = new URL(request.url).searchParams
  const settings = await loadSettings(c.db, c.creatorId)
  const from = Number(q.get("from"))
  const to = Number(q.get("to"))
  if (Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to > from) {
    return physicalJson({ analytics: await physicalAnalytics(c.db, c.creatorId, new Date(from).toISOString(), settings.lowStockDefault, new Date(to).toISOString()) })
  }
  const days = Math.min(365, Math.max(1, Number(q.get("days")) || 30))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  return physicalJson({ days, analytics: await physicalAnalytics(c.db, c.creatorId, since, settings.lowStockDefault) })
}
