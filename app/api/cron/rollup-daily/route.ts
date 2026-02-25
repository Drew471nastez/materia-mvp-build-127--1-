import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

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
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
