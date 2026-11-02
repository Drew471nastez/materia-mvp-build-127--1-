import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { isDay, dayAfter } from "@/lib/reviews/manage"
import { reviewsAnalytics } from "@/lib/reviews/manage-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DAY_MS = 86_400_000
const MAX_DAYS = 731

/**
 * Storelib Reviews › Analytics for a period, and the period before it of the
 * same length for the comparison. Added up by lib/reviews/manage, the same
 * functions the overview reads, so the numbers agree.
 *
 *   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   (both days included; the last 30 days when left out)
 */
export async function GET(request: Request) {
  const c = await shopCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const p = new URL(request.url).searchParams
  const today = new Date().toISOString().slice(0, 10)
  const to = isDay(p.get("to")) ? (p.get("to") as string) : today
  const toMs = Date.parse(dayAfter(to))
  let fromMs = isDay(p.get("from")) ? Date.parse(`${p.get("from")}T00:00:00Z`) : toMs - 30 * DAY_MS
  if (!(fromMs < toMs)) return physicalJson({ error: "The start has to be before the end." }, 400)
  if (toMs - fromMs > MAX_DAYS * DAY_MS) fromMs = toMs - MAX_DAYS * DAY_MS
  return physicalJson(await reviewsAnalytics(c.db, c.creatorId, fromMs, toMs))
}
