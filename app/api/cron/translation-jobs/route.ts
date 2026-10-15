import { NextResponse, after } from "next/server"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { askNextRun, continueJobs } from "@/lib/markets/translation-jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** No job round starts after this much of the run. */
const RUN_WINDOW_MS = 270_000

/**
 * CRON: Translate with AI in the background (lib/markets/translation-jobs.ts).
 * Carries on every job a run let go of or was cut off from. A run that ran
 * out of time asks for the next one here at once (POST with the job); the
 * schedule is the net under that. Behind the cron secret, like every cron.
 */
async function run(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const started = Date.now()
  let only: { creatorId: string; locale: string } | undefined
  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as { creatorId?: unknown; locale?: unknown } | null
    if (typeof body?.creatorId === "string" && typeof body.locale === "string") only = { creatorId: body.creatorId, locale: body.locale }
  }
  if (only) {
    /* Asked for by the last run: answered at once, the work done after the answer. */
    const job = only
    const origin = new URL(request.url).origin
    after(async () => {
      await continueJobs(started + RUN_WINDOW_MS, job)
      if (Date.now() >= started + RUN_WINDOW_MS - 30_000) await askNextRun(origin, job.creatorId, job.locale)
    })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json(await continueJobs(started + RUN_WINDOW_MS))
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/translation-jobs", request, () => run(request))
}

export const POST = run
