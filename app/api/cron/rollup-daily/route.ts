import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireBearerSecret } from "@/lib/api/require-secret"

/**
 * CRON: Refresh daily analytics rollups for yesterday.
 * Schedule: Run at 00:15 UTC daily.
 *
 * Calls the refresh_daily_rollup(date) Postgres function which:
 * 1. Deletes existing rollups for the target date (idempotent)
 * 2. Re-aggregates from analytics_events + orders
 * 3. Inserts fresh rollup rows per creator × product × date
 *
 * Also supports incremental rollup for "today" when called with ?date=today
 * (used by the live counters endpoint to periodically update partial day data).
 *
 * ===========================================================================
 *  IT ANSWERS GET, BECAUSE THAT IS WHAT A CRON SENDS
 * ===========================================================================
 * This exported POST and nothing else, while vercel.json has scheduled it
 * daily since it was written. A Vercel cron issues a GET, so the schedule was
 * answered 405 every day and the rollup has never run — which, unlike a
 * crash, produces no error anywhere. It looks exactly like a table that
 * happens to be empty.
 *
 * (It was also being redirected before it got that far; see the note about
 * /api in proxy.ts. Two independent reasons the same job never ran.)
 *
 * POST stays, because the live counters endpoint calls it that way.
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  try {
    const denied = requireBearerSecret(request, "CRON_SECRET")
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get("date")

    const admin = createAdminClient()

    // Determine target date(s)
    let dates: string[]
    if (dateParam === "today") {
      // Incremental rollup for current day (partial data)
      const today = new Date().toISOString().slice(0, 10)
      dates = [today]
    } else if (dateParam) {
      dates = [dateParam]
    } else {
      // Default: yesterday
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      dates = [yesterday]
    }

    const results: Array<{ date: string; rows: number | null; error?: string }> = []

    for (const date of dates) {
      const { data, error } = await admin.rpc("refresh_daily_rollup", {
        target_date: date,
      })

      results.push({
        date,
        rows: error ? null : (data as number),
        error: error?.message,
      })
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error("[cron/rollup-daily] Error:", error)
    return NextResponse.json(
      { error: "Rollup refresh failed" },
      { status: 500 },
    )
  }
}
