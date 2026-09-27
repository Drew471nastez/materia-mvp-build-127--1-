import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { ROLLUP } from "@/lib/analytics/events"

/**
 * CRON: Refresh daily analytics rollups for yesterday.
 * Schedule: Run at 01:00 UTC daily (vercel.json).
 *
 * Two rollups, each a Postgres function that deletes the day's rows and
 * counts them again from the raw events, so a day can be run again at any
 * time and ends the same:
 *
 *   refresh_daily_rollup(date)             analytics_daily_rollups: views and
 *                                          orders per creator and product
 *                                          (supabase/migrations/20260225_daily_rollups.sql)
 *   analytics_refresh_property_day(date)   analytics_property_daily: visitors,
 *                                          sessions, page views, clicks and
 *                                          the breakdowns per creator,
 *                                          property and UTC day, and the day
 *                                          noted in analytics_rollup_days
 *                                          (supabase/sql/run-now part 54;
 *                                          docs/analytics/events.md)
 *
 * `?date=YYYY-MM-DD` runs one day, `?date=today` today so far, and
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` every day from one to the other
 * inclusive, at most 92 a call, which is how the past is filled in the
 * first time. Today is never read from the property rollup, whatever is in
 * it: a day is complete only once it is over.
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

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 92

function daysBetween(from: string, to: string): string[] | null {
  if (!DAY.test(from) || !DAY.test(to)) return null
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  const days: string[] = []
  for (let t = start; t <= end && days.length <= MAX_DAYS; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10))
  return days.length > MAX_DAYS ? null : days
}

export async function POST(request: Request) {
  try {
    const denied = requireBearerSecret(request, "CRON_SECRET")
    if (denied) return denied

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get("date")
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const admin = createAdminClient()

    // Determine target date(s)
    let dates: string[]
    if (from || to) {
      const range = daysBetween(from ?? "", to ?? "")
      if (!range) return NextResponse.json({ error: `from and to are YYYY-MM-DD, in order, at most ${MAX_DAYS} days` }, { status: 400 })
      dates = range
    } else if (dateParam === "today") {
      // Incremental rollup for current day (partial data)
      dates = [new Date().toISOString().slice(0, 10)]
    } else if (dateParam) {
      if (!DAY.test(dateParam)) return NextResponse.json({ error: "date is YYYY-MM-DD or today" }, { status: 400 })
      dates = [dateParam]
    } else {
      // Default: yesterday
      dates = [new Date(Date.now() - 86400000).toISOString().slice(0, 10)]
    }

    const results: Array<{ date: string; rows: number | null; error?: string; properties: number | null; propertiesError?: string }> = []

    for (const date of dates) {
      const { data, error } = await admin.rpc("refresh_daily_rollup", {
        target_date: date,
      })
      /* One day at a time, so a long range never holds one long transaction. */
      const property = await admin.rpc(ROLLUP.refresh, { p_day: date })

      results.push({
        date,
        rows: error ? null : (data as number),
        error: error?.message,
        properties: property.error ? null : (property.data as number),
        propertiesError: property.error?.message,
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
