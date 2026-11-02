import { NextResponse } from "next/server"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { keptDays, refreshHistory, refreshRates } from "@/lib/markets/fx-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/*
  Said here, not left to the platform's default (r48-obs); the daily read has 10s and the history 15s, or 60s the first time: recordCronRun's
  one-run-at-a-time lease is this long plus 30s, so a run the platform ends
  early never holds the job longer than one run could take.
*/
export const maxDuration = 120

/**
 * CRON: the European Central Bank's reference rates for the day
 * (lib/markets/fx-server.ts), kept for showing a website's prices in a
 * market's currency. Weekdays at 15:35 UTC, after the ECB publishes at about
 * 16:00 Frankfurt time; a run that finds the same day again changes nothing.
 * Behind the cron secret, like every cron.
 *
 * The days before are kept too, from the ECB's own history (refreshHistory):
 * every day since 1999 the first time, then the last 90 days each run, so a
 * missed run leaves no gap. Reports convert each sale at its own day's rate
 * (lib/money/report-currency); a day already kept is never rewritten.
 */
async function run(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const out = await refreshRates()
  const history = await refreshHistory(undefined, { full: (await keptDays()) < 250 })
  return NextResponse.json({ ...out, history }, { status: out.ok ? 200 : 502 })
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/fx-rates", request, () => run(request), { maxDurationS: maxDuration })
}

export const POST = run
