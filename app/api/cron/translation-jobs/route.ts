import { NextResponse, after } from "next/server"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { askNextRun, continueJobs } from "@/lib/markets/translation-jobs"
import { runChangedStores } from "@/lib/markets/auto-translate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** No job round starts after this much of the run. */
const RUN_WINDOW_MS = 270_000

/**
 * CRON, every five minutes (vercel.json), two things side by side:
 *
 *   Translate with AI in the background (lib/markets/translation-jobs.ts):
 *   carries on every job a run let go of or was cut off from. A run that ran
 *   out of time asks for the next one here at once (POST with the job); the
 *   schedule is the net under that.
 *
 *   Translate changes automatically (lib/markets/auto-translate.ts
 *   runChangedStores): the stores whose website changed a couple of minutes
 *   ago, translated and live, so a publish is in every language in minutes.
 *
 * Behind the cron secret, like every cron.
 *
 * The chained POST is not wrapped in recordCronRun's lease, on purpose: its
 * work runs in after(), past the answer, so a cron_runs row would finish
 * before the work did and hold nothing; and being skipped behind the
 * scheduled run would only delay the job. Two runs at once are safe without
 * it: continueJobs takes each job under its own lease
 * (lib/markets/translation-jobs.ts), and runChangedStores, which only the
 * scheduled GET runs, claims each store under a lease (auto-translate.ts
 * claimStore).
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
  const [jobs, changes] = await Promise.all([continueJobs(started + RUN_WINDOW_MS), runChangedStores(started + RUN_WINDOW_MS)])
  return NextResponse.json({ ...jobs, changes })
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/translation-jobs", request, () => run(request), { maxDurationS: maxDuration })
}

export const POST = run
