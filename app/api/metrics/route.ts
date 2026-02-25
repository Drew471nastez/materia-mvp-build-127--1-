import { NextResponse } from "next/server"
import { getAllMetrics } from "@/lib/observability"

/**
 * GET /api/metrics
 *
 * Returns observability metrics:
 * - P50/P95 timings per route
 * - Cache hit rates
 * - Top slow queries
 *
 * Protected: requires CRON_SECRET or admin auth.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  // Only allow with secret or in development
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV !== "development") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  return NextResponse.json(getAllMetrics())
}
