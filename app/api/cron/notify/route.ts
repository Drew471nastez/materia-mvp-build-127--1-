import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { runNotificationWork } from "@/lib/notify/worker"
import { recordCronRun } from "@/lib/observability/report"
import { runBudgetMs, runDeadline } from "@/lib/observability/run-deadline"

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
/**
 * ONE CLOCK FOR THE RUN, FROM THE REQUEST (lib/observability/run-deadline.ts).
 * New batches are claimed until CLAIM_UNTIL_MS; the batch in hand starts no
 * job past the run's deadline less HAND_BACK_MS (the rest go back to the
 * queue for the next run); the analytics forwarding takes only what is left.
 * It used to be 45 s of claims, then a batch with no end, then at least 2 s
 * more of forwarding whatever time it was: past the 60 s limit when busy.
 */
const CLAIM_UNTIL_MS = 36_000
const HAND_BACK_MS = 4_000

async function runJob(request: Request) {
  const run = runDeadline(runBudgetMs(maxDuration))
  const started = run.started
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied

  try {
    const summary = await runNotificationWork(run.shareUntil(CLAIM_UNTIL_MS, RUN_BUDGET_MS, 0), { hardStopMs: Math.max(0, run.left() - HAND_BACK_MS) })
    /* Storelib analytics on to the stores' own tools (lib/analytics/destinations): what is due, retries included, in the time left. */
    const forwardMs = run.share(10_000)
    const forwarded = forwardMs > 0 ? await drainForwarded(forwardMs) : { taken: 0, sent: 0, retried: 0, failed: 0, skipped: 0 }
    /* Form responses' emails and webhooks that are due, then retention and loose uploads (lib/forms/delivery-server.ts). */
    const formsMs = run.share(8_000)
    const forms = formsMs > 0 ? await drainForms(formsMs) : null
    const ms = Date.now() - started
    /* A line only when the run did something; an idle run every few minutes was a log line each time. Changed on purpose (the owner: lower Vercel costs). */
    const didWork = summary.events + summary.eventErrors + summary.planned + summary.cancelled + summary.jobs > 0
    if (didWork) console.log(
      `[cron/notify] ${summary.available ? "ran" : "not available (its SQL has not run)"}: ${summary.events} events (${summary.eventErrors} errors), ${summary.planned} jobs planned, ${summary.cancelled} cancelled, ${summary.jobs} jobs run: ${summary.sent} sent, ${summary.skipped} skipped, ${summary.retried} to retry, ${summary.deferred} deferred, ${summary.failed} failed, ${ms}ms${summary.stoppedForTime ? ", stopped for time" : ""}`,
    )
    if (forms && forms.taken + forms.expired + forms.orphans > 0) console.log(`[cron/notify] forms: ${forms.delivered} delivered, ${forms.retried} to retry, ${forms.failed} failed, ${forms.expired} expired, ${forms.orphans} loose uploads removed`)
    if (forwarded.taken > 0) console.log(`[cron/notify] analytics forwarded: ${forwarded.sent} sent, ${forwarded.retried} to retry, ${forwarded.failed} failed, ${forwarded.skipped} skipped`)
    return NextResponse.json({ ...summary, analyticsForwarded: forwarded, ms }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    console.error("[cron/notify] the run failed")
    return NextResponse.json({ error: "Run failed" }, { status: 500 })
  }
}

async function drainForms(budgetMs: number) {
  try {
    const [{ runFormJobs, sweepForms }, { createAdminClient }] = await Promise.all([import("@/lib/forms/delivery-server"), import("@/lib/supabase/admin")])
    const db = createAdminClient()
    const until = Date.now() + Math.min(budgetMs, 8_000)
    const jobs = await runFormJobs(db as never, { limit: 40, until })
    const swept = jobs.available && Date.now() < until ? await sweepForms(db as never, { until }) : { expired: 0, orphans: 0 }
    return { ...jobs, ...swept }
  } catch {
    return null
  }
}

async function drainForwarded(budgetMs: number) {
  try {
    const [{ drain }, { createAdminClient }] = await Promise.all([import("@/lib/analytics/destinations/queue-server"), import("@/lib/supabase/admin")])
    return await drain(createAdminClient(), { budgetMs: Math.min(budgetMs, 10_000), limit: 100 })
  } catch {
    return { taken: 0, sent: 0, retried: 0, failed: 0, skipped: 0 }
  }
}

/* Every run written down, and a failure reported (lib/observability/report, run-now part 68). */
export async function GET(request: Request) {
  return recordCronRun("/api/cron/notify", request, () => runJob(request), { maxDurationS: maxDuration })
}
