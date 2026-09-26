import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { runNotificationEngine } from "@/lib/notifications/engine"
import { runNotificationWork } from "@/lib/notify/worker"
import { storelibPusher } from "@/lib/notifications/push-sender"
import { supabaseSnapshots } from "@/lib/notifications/snapshot"
import { supabaseNotificationStore } from "@/lib/notifications/supabase-store"
import { createAdminClient } from "@/lib/supabase/admin"

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

export async function GET(request: Request) {
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
