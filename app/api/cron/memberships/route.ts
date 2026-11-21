import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { createAdminClient } from "@/lib/supabase/admin"
import { runMembershipJobs } from "@/lib/memberships/reminders"
import { realDeps, runCommunityRoleCron } from "@/lib/community-roles/engine"

/**
 * GET /api/cron/memberships
 *
 * Every fifteen minutes (vercel.json): renewal reminders, half started
 * checkouts closed, included products taken back after a failed payment's
 * grace, and creators' update emails still waiting to go
 * (lib/memberships/reminders.ts), then Discord roles and Telegram chats
 * whose access changed or whose last try is due again (lib/community-roles/engine
 * runCommunityRoleCron; nothing without their keys). Every part is keyed, so running it again,
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
    const admin = createAdminClient()
    const summary = await runMembershipJobs(admin, { budgetMs: RUN_BUDGET_MS })
    /* Its own net: Discord or Telegram failing never fails the memberships' run. */
    const communityRoles = await runCommunityRoleCron(realDeps(admin)).catch((e: unknown) => {
      console.error("[cron/memberships] community roles:", e instanceof Error ? e.message : e)
      return null
    })
    if (communityRoles && communityRoles.ran + communityRoles.rechecked > 0) console.log(`[cron/memberships] community roles: ${communityRoles.ran} run (${communityRoles.granted} granted, ${communityRoles.revoked} removed, ${communityRoles.failed} not done), ${communityRoles.rechecked} access ended`)
    const ms = Date.now() - started
    /* A line only when the run did something; an idle run every few minutes was a log line each time. Changed on purpose (the owner: lower Vercel costs). */
    const didWork = summary.reminders + summary.abandoned + summary.graceEnded + summary.emails.sent + summary.emails.skipped + summary.emails.failed > 0 || summary.emails.left
    if (didWork) console.log(
      `[cron/memberships] ${summary.available ? "ran" : "not available (part 75 has not run)"}: ${summary.reminders} reminders, ${summary.abandoned} half started closed, ${summary.graceEnded} past grace, emails ${summary.emails.sent} sent ${summary.emails.skipped} skipped ${summary.emails.failed} failed${summary.emails.left ? " (more waiting)" : ""}, ${ms}ms`,
    )
    return NextResponse.json({ ...summary, communityRoles, ms }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("[cron/memberships] the run failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Run failed" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/memberships", request, () => runJob(request), { maxDurationS: maxDuration })
}
