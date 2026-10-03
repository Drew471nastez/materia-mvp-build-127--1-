import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { createAdminClient } from "@/lib/supabase/admin"
import { communitiesEnabled } from "@/lib/communities/flag"
import { runCommunityJobs } from "@/lib/communities/server/notify"
import { PLATFORM_JOB_KINDS } from "@/lib/communities/types"

/**
 * GET /api/cron/community
 *
 * Every five minutes (vercel.json): the community job queue
 * (lib/communities/server/notify.ts runCommunityJobs). Announcement and event
 * fan outs, event reminders, recounts, and the daily rollup and trending
 * score for each kind that has a handler. Jobs are claimed with a lease and
 * keyed, so two runs at once, or a run again, does nothing twice.
 *
 * With communities switched off, only the jobs that are not about a
 * community run (PLATFORM_JOB_KINDS: a creator's followers told about a new
 * product, a membership's members told about a new post), because those must
 * not wait on the communities switch; every community job stays in the queue
 * as it is, and the answer carries skipped: "communities_off". Before
 * supabase/sql/run-now/81_communities.sql it answers { available: false }.
 * Protected by CRON_SECRET.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const RUN_BUDGET_MS = 45_000
const NO_STORE = { "Cache-Control": "no-store" }

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const on = await communitiesEnabled()
  try {
    const summary = await runCommunityJobs(createAdminClient(), on ? { budgetMs: RUN_BUDGET_MS } : { budgetMs: RUN_BUDGET_MS, kinds: PLATFORM_JOB_KINDS })
    console.log(
      `[cron/community] ${summary.available ? "ran" : "not available (part 81 has not run)"}${on ? "" : " platform jobs only (communities off)"}: ${summary.claimed} claimed, ${summary.done} done, ${summary.continued} continued, ${summary.retried} retried, ${summary.failed} failed, ${summary.scheduled} scheduled, ${summary.ms}ms`,
    )
    return NextResponse.json(on ? summary : { ...summary, skipped: "communities_off" }, { headers: NO_STORE })
  } catch (e) {
    console.error("[cron/community] the run failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Run failed" }, { status: 500, headers: NO_STORE })
  }
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/community", request, () => runJob(request))
}
