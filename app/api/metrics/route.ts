import { NextResponse } from "next/server"
import { getAllMetrics } from "@/lib/observability"
import { requireBearerSecret } from "@/lib/api/require-secret"

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
  /* Fails closed, including when CRON_SECRET is not configured. The
     development escape hatch stays: a local run has no secret to present. */
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied && process.env.NODE_ENV !== "development") return denied

  return NextResponse.json(getAllMetrics())
}
