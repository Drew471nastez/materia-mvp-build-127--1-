import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { reviewsOverview } from "@/lib/reviews/manage-server"
import { loadReviewsApp } from "@/lib/reviews/app-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Storelib Reviews › Overview: the average, how many, what waits, the
 * requests sent and how many led to a review, and the latest reviews. From
 * counts, cached a minute and cleared by every change (manage-server).
 *
 *   GET → { summary, funnel, recent, ready, app: { enabled, ready } }
 */
export async function GET() {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const [overview, app] = await Promise.all([reviewsOverview(c.db, c.creatorId), loadReviewsApp(c.db, c.creatorId).catch(() => null)])
  return physicalJson({ ...overview, app: { enabled: app?.settings.enabled === true, ready: app?.ready !== false } })
}
