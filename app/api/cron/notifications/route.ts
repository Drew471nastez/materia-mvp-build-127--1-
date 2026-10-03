import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { runNotificationEngine } from "@/lib/notifications/engine"
import { sweepPayoutReminders } from "@/lib/notify/payout-weekly"
import { reconcileStaleAccounts } from "@/lib/payments/stripe/reconcile"
import { runNotificationWork } from "@/lib/notify/worker"
import { storelibPusher } from "@/lib/notifications/push-sender"
import { supabaseSnapshots } from "@/lib/notifications/snapshot"
import { supabaseNotificationStore } from "@/lib/notifications/supabase-store"
import { createAdminClient } from "@/lib/supabase/admin"
import { recordCronRun } from "@/lib/observability/report"

/**
 * GET /api/cron/notifications
 *
 * Every creator's notifications, worked out again from their real data
 * (lib/notifications/engine.ts): new ones written once, fixed ones resolved,
 * critical ones and milestones pushed. Hourly at :25 (vercel.json), apart
 * from the jobs at :00 and :10.
 *
 * It takes creators a batch at a time, least recently evaluated first, until
 * RUN_BUDGET_MS is spent, and leaves the rest at the front of the queue for
 * the next run. Two runs at once (a retry, a manual call) never evaluate the
 * same creator, and never write or push the same notification twice.
 *
 * Before supabase/sql/run-now/29_notification_rules.sql it answers
 * { available: false } and does nothing.
 *
 * The answer and the log are counts. Protected by CRON_SECRET.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/** Stop taking batches with time left to finish the one in hand. */
const RUN_BUDGET_MS = 240_000

/** The notification worker's share, after the evaluation, inside maxDuration. */
const NOTIFY_BUDGET_MS = 20_000

/*
 * Re-reading the oldest connected accounts from Stripe
 * (lib/payments/stripe/reconcile.ts), at most. It takes what is left of the
 * evaluation's budget as well as its own, so a short evaluation reconciles
 * more and a long one still leaves the worker its share inside maxDuration.
 * Skipped when there is almost nothing left: the next hour does it.
 */
const RECONCILE_BUDGET_MS = 20_000

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied

  const started = Date.now()
  try {
    const db = createAdminClient()
    const summary = await runNotificationEngine({
      store: supabaseNotificationStore(db),
      source: supabaseSnapshots(db),
      pusher: storelibPusher,
      deadline: started + RUN_BUDGET_MS,
    })
    /* Payouts still not set up: one email a week each (lib/notify/payout-weekly.ts), planned before the worker runs so it sends them. */
    const weekly = await sweepPayoutReminders(db, { budgetMs: 8_000 }).catch(() => null)
    console.log(`[cron/notifications] payout weekly: ${weekly ? `${weekly.checked} creators, ${weekly.emitted} planned, ${weekly.toldThisWeek} already told this week` : "failed"}`)
    /*
      The accounts Stripe has not told us about in a while, read again
      (lib/payments/stripe/reconcile.ts). The webhook is primary; this
      catches a delivery that was lost while the endpoint was unreachable,
      for a seller who never opens Payouts and so never re-reads it.
    */
    const reconcileMs = Math.min(RECONCILE_BUDGET_MS, Math.max(0, started + RUN_BUDGET_MS + RECONCILE_BUDGET_MS - Date.now()))
    const reconciled = reconcileMs > 2_000 ? await reconcileStaleAccounts({ budgetMs: reconcileMs }).catch(() => null) : null
    console.log(`[cron/notifications] payments reconcile: ${reconciled ? `${reconciled.checked} read, ${reconciled.changed} changed, ${reconciled.failed} failed${reconciled.more ? ", more waiting" : ""}` : "nothing to do"}`)
    /* The notification engine's worker too (lib/notify/worker.ts), briefly: /api/cron/notify does the bulk every five minutes. */
    const work = await runNotificationWork(NOTIFY_BUDGET_MS).catch(() => null)
    const ms = Date.now() - started
    console.log(
      `[cron/notifications] notify worker: ${work ? `${work.jobs} jobs, ${work.sent} sent` : "failed"}`,
    )
    console.log(
      `[cron/notifications] ${summary.available ? "ran" : "not available (its SQL has not run)"}: ${summary.creators} creators in ${summary.batches} batches, ${summary.inserted} new (${summary.critical} critical, ${summary.digests} digests), ${summary.resolved} resolved, ${summary.pushed} pushed, ${summary.deferred} held back, ${summary.errors} errors, ${ms}ms${summary.stoppedForTime ? ", stopped for time" : ""}`,
    )
    return NextResponse.json({ ...summary, ms }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    console.error("[cron/notifications] the run failed")
    return NextResponse.json({ error: "Run failed" }, { status: 500 })
  }
}

/* Every run written down, and a failure reported (lib/observability/report, run-now part 68). */
export async function GET(request: Request) {
  return recordCronRun("/api/cron/notifications", request, () => runJob(request))
}
