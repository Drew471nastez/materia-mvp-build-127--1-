import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { runNotificationWork } from "@/lib/notify/worker"
import { recordCronRun } from "@/lib/observability/report"

/**
 * GET /api/cron/notify
 *
 * The notification engine's worker (lib/notify/worker.ts), every five
 * minutes (vercel.json): the outbox's new events turned into jobs, then the
 * jobs that are due sent, retried or skipped, for about RUN_BUDGET_MS. What
 * does not fit waits in the tables for the next run; a reminder planned for
 * tomorrow is a row with tomorrow's run_at, not a timer.
 *
 * Two runs at once (a retry, a manual call, a request's after()) never take
 * the same event or job: both are claimed with FOR UPDATE SKIP LOCKED and a
 * lease.
 *
 * Before supabase/sql/run-now/40_notification_engine.sql it answers
 * { available: false } and does nothing. The answer and the log are counts.
 * Protected by CRON_SECRET.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Stop taking batches with time left to finish the one in hand. */
const RUN_BUDGET_MS = 45_000

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied

  const started = Date.now()
  try {
    const summary = await runNotificationWork(RUN_BUDGET_MS)
    const ms = Date.now() - started
    console.log(
      `[cron/notify] ${summary.available ? "ran" : "not available (its SQL has not run)"}: ${summary.events} events (${summary.eventErrors} errors), ${summary.planned} jobs planned, ${summary.cancelled} cancelled, ${summary.jobs} jobs run: ${summary.sent} sent, ${summary.skipped} skipped, ${summary.retried} to retry, ${summary.deferred} deferred, ${summary.failed} failed, ${ms}ms${summary.stoppedForTime ? ", stopped for time" : ""}`,
    )
    return NextResponse.json({ ...summary, ms }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    console.error("[cron/notify] the run failed")
    return NextResponse.json({ error: "Run failed" }, { status: 500 })
  }
}

/* Every run written down, and a failure reported (lib/observability/report, run-now part 68). */
export async function GET(request: Request) {
  return recordCronRun("/api/cron/notify", request, () => runJob(request))
}
