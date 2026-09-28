import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { createAdminClient } from "@/lib/supabase/admin"
import { runMembershipJobs } from "@/lib/memberships/reminders"

/**
 * GET /api/cron/memberships
 *
 * Every fifteen minutes (vercel.json): renewal reminders, half started
 * checkouts closed, included products taken back after a failed payment's
 * grace, and creators' update emails still waiting to go
 * (lib/memberships/reminders.ts). Every part is keyed, so running it again,
 * or two runs at once, sends nothing twice. Before
 * supabase/sql/run-now/75_memberships.sql it answers { available: false }.
 * Protected by CRON_SECRET.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const RUN_BUDGET_MS = 45_000

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const started = Date.now()
  try {
    const summary = await runMembershipJobs(createAdminClient(), { budgetMs: RUN_BUDGET_MS })
    const ms = Date.now() - started
    console.log(
      `[cron/memberships] ${summary.available ? "ran" : "not available (part 75 has not run)"}: ${summary.reminders} reminders, ${summary.abandoned} half started closed, ${summary.graceEnded} past grace, emails ${summary.emails.sent} sent ${summary.emails.skipped} skipped ${summary.emails.failed} failed${summary.emails.left ? " (more waiting)" : ""}, ${ms}ms`,
    )
    return NextResponse.json({ ...summary, ms }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[cron/memberships] the run failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Run failed" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/memberships", request, () => runJob(request))
}
