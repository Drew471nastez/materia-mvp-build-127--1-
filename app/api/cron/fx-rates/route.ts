import { NextResponse } from "next/server"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { refreshRates } from "@/lib/markets/fx-server"

/**
 * CRON: the European Central Bank's reference rates for the day
 * (lib/markets/fx-server.ts), kept for showing a website's prices in a
 * market's currency. Weekdays at 15:35 UTC, after the ECB publishes at about
 * 16:00 Frankfurt time; a run that finds the same day again changes nothing.
 * Behind the cron secret, like every cron.
 */
async function run(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const out = await refreshRates()
  return NextResponse.json(out, { status: out.ok ? 200 : 502 })
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/fx-rates", request, () => run(request))
}

export const POST = run
