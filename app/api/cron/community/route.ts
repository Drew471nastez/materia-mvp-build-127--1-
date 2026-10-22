import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { createAdminClient } from "@/lib/supabase/admin"
import { communitiesEnabled } from "@/lib/communities/flag"
import { runCommunityJobs } from "@/lib/communities/server/notify"
import { releaseDeadHolds } from "@/lib/communities/server/event-tickets"
import { publishDuePosts } from "@/lib/communities/server/scheduled-posts"
import { runDueDeletions } from "@/lib/communities/server/community-deletion"
import { runChatAutomations } from "@/lib/communities/server/chat-automations"
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
 * It also frees the seats held for ticket checkouts nobody finished
 * (lib/communities/server/event-tickets.ts releaseDeadHolds): one statement
 * per run, and nothing at all before run-now part 105. And it puts up the
 * scheduled posts that are due (lib/communities/server/scheduled-posts.ts,
 * run-now part 194), each once, as its author, within a few seconds' budget.
 * And it carries on the deletions owners scheduled for communities members
 * pay for (lib/communities/server/community-deletion.ts runDueDeletions,
 * run-now part 202, round 33): the memberships still to stop, and the
 * communities whose date has come deleted, within ten seconds.
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
    const db = createAdminClient()
    /* SCHEDULED POSTS that are due go up first (round 32), so the announcements they queue are sent by this same run. A community post, so only while communities are on; ten seconds at most. */
    const posts = on ? await publishDuePosts(db, Date.now(), 10_000).catch(() => ({ published: 0, failed: 0, available: false })) : { published: 0, failed: 0, available: false }
    const summary = await runCommunityJobs(db, on ? { budgetMs: RUN_BUDGET_MS } : { budgetMs: RUN_BUDGET_MS, kinds: PLATFORM_JOB_KINDS })
    /* SEATS HELD FOR A CHECKOUT NOBODY FINISHED go back, so a sold out event is really sold out
       (lib/communities/server/event-tickets.ts releaseDeadHolds). One statement, nothing before part 105. */
    const seatsFreed = on ? await releaseDeadHolds(db).catch(() => 0) : 0
    /* SCHEDULED DELETIONS (round 33): memberships stopped, due communities deleted; nothing before part 202. */
    const deletions = on ? await runDueDeletions(db, 10_000).catch(() => ({ available: false, checked: 0, completed: 0, stopped: 0, failed: 0 })) : { available: false, checked: 0, completed: 0, stopped: 0, failed: 0 }
    /*
      AUTOMATED CHAT MESSAGES (round 38, part 272): broadcasts that are due and days after joining add their next page of
      members, then at most 300 messages go out (150 for one community), each once; fifteen seconds at most.
    */
    const automations = on ? await runChatAutomations(db, Date.now(), 15_000).catch(() => ({ available: false, queued: 0, sent: 0, failed: 0, skipped: 0, finished: 0 })) : { available: false, queued: 0, sent: 0, failed: 0, skipped: 0, finished: 0 }
    /* A line only when the run did something; an idle run every few minutes was a log line each time. Changed on purpose (the owner: lower Vercel costs). */
    const didWork = summary.claimed + summary.scheduled + summary.failed + seatsFreed + posts.published + posts.failed + deletions.stopped + deletions.completed + deletions.failed + automations.queued + automations.sent + automations.failed > 0
    if (didWork) console.log(
      `[cron/community] ${summary.available ? "ran" : "not available (part 81 has not run)"}${on ? "" : " platform jobs only (communities off)"}: ${summary.claimed} claimed, ${summary.done} done, ${summary.continued} continued, ${summary.retried} retried, ${summary.failed} failed, ${summary.scheduled} scheduled, ${seatsFreed} held seats back, ${posts.published} scheduled posts up, ${posts.failed} failed, ${deletions.stopped} memberships stopped for a deletion, ${deletions.completed} communities deleted, ${deletions.failed} deletion steps failed, ${automations.sent} automated messages sent, ${automations.failed + automations.skipped} not sent, ${summary.ms}ms`,
    )
    return NextResponse.json(on ? { ...summary, seatsFreed, scheduledPosts: posts, deletions, automations } : { ...summary, skipped: "communities_off" }, { headers: NO_STORE })
  } catch (e) {
    console.error("[cron/community] the run failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Run failed" }, { status: 500, headers: NO_STORE })
  }
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/community", request, () => runJob(request))
}
