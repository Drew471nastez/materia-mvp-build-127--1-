import { type NextRequest, NextResponse } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { missingSchema, parseDays, summarizeStats, traceDeliveries } from "@/lib/notify/admin-trace"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  THE NOTIFICATION ENGINE, FOR THE ADMIN: TRACE AND COUNTS
 * ===========================================================================
 * Read only. The admin cookie first, then the service role.
 *
 *   GET ?view=trace&q=&type=&state=   event, jobs, deliveries
 *                                     (lib/notify/admin-trace.ts)
 *   GET ?view=stats&days=7|30         public.notification_admin_stats
 *                                     (run-now part 41), summarised
 *
 * Addresses come back masked, error text too, and no job data, event
 * payload or email body is ever in the answer.
 */

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const sp = request.nextUrl.searchParams
  const db = createAdminClient()

  if (sp.get("view") === "stats") {
    const days = parseDays(sp.get("days"))
    const { data, error } = await db.rpc("notification_admin_stats", { p_days: days })
    if (error && missingSchema(error)) {
      return NextResponse.json({ unavailable: "The counts need run-now parts 40 and 41." }, { headers: NO_STORE })
    }
    if (error) return adminFailure("notification stats", error, "The counts could not be read.")
    return NextResponse.json({ stats: summarizeStats(data, days) }, { headers: NO_STORE })
  }

  try {
    const result = await traceDeliveries(db, { q: sp.get("q"), type: sp.get("type"), state: sp.get("state") })
    if (!result.ok) {
      if (result.unavailable) return NextResponse.json({ unavailable: result.reason }, { headers: NO_STORE })
      return adminFailure("notification trace", new Error(result.reason), "The trace could not be read.")
    }
    return NextResponse.json({ events: result.events, jobs: result.jobs, searched: result.searched }, { headers: NO_STORE })
  } catch (err) {
    return adminFailure("notification trace", err, "The trace could not be read.")
  }
}
