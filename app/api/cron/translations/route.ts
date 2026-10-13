import { NextResponse } from "next/server"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { runAutoTranslate } from "@/lib/markets/auto-translate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** No store starts after this much of the run, leaving room inside maxDuration for the last one's write. */
const RUN_WINDOW_MS = 240_000

/**
 * CRON: Translate changes automatically (lib/markets/auto-translate.ts).
 * Hourly: each store with the switch on has its website's new and changed
 * text translated into its other languages, the one waiting longest first.
 * Behind the cron secret, like every cron.
 */
async function run(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const out = await runAutoTranslate(Date.now() + RUN_WINDOW_MS)
  return NextResponse.json(out)
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/translations", request, () => run(request))
}

export const POST = run
