import { NextResponse } from "next/server"

import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { runBudgetMs, runDeadline } from "@/lib/observability/run-deadline"
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
/**
 * ONE CLOCK FOR THE RUN (lib/observability/run-deadline.ts). Each step used to
 * count its own budget from its own start (10 + 45 + 10 + 15 s, about 80 s in
 * a 60 s function), so a busy queue had the platform kill the run during the
 * deletions or the automations. Now the clock starts with the request, the run
 * ends by 52 s, the job queue stops claiming by JOBS_UNTIL_MS so the later
 * steps get a turn, and each later step takes what is left (a step with under
 * two seconds left is skipped; it resumes next run from the database).
 */
const JOBS_UNTIL_MS = 35_000
const NO_STORE = { "Cache-Control": "no-store" }

async function runJob(request: Request) {
  const run = runDeadline(runBudgetMs(maxDuration))
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const on = await communitiesEnabled()
  try {
    const db = createAdminClient()
    /* SCHEDULED POSTS that are due go up first (round 32), so the announcements they queue are sent by this same run. A community post, so only while communities are on; ten seconds at most. */
    const postsMs = on ? run.share(10_000) : 0
    const posts = postsMs > 0 ? await publishDuePosts(db, Date.now(), postsMs).catch(() => ({ published: 0, failed: 0, available: false })) : { published: 0, failed: 0, available: false }
    /* While communities are off the platform jobs are the whole run, so they may use all of it. */
    const jobsMs = on ? run.shareUntil(JOBS_UNTIL_MS, RUN_BUDGET_MS) : run.share(RUN_BUDGET_MS)
    const summary = await runCommunityJobs(db, on ? { budgetMs: jobsMs } : { budgetMs: jobsMs, kinds: PLATFORM_JOB_KINDS })
    /* SEATS HELD FOR A CHECKOUT NOBODY FINISHED go back, so a sold out event is really sold out
       (lib/communities/server/event-tickets.ts releaseDeadHolds). One statement, nothing before part 105. */
    const seatsFreed = on && run.share(10_000) > 0 ? await releaseDeadHolds(db).catch(() => 0) : 0
    /* SCHEDULED DELETIONS (round 33): memberships stopped, due communities deleted; nothing before part 202. */
    const deletionsMs = on ? run.share(10_000) : 0
    const deletions = deletionsMs > 0 ? await runDueDeletions(db, deletionsMs).catch(() => ({ available: false, checked: 0, completed: 0, stopped: 0, failed: 0 })) : { available: false, checked: 0, completed: 0, stopped: 0, failed: 0 }
    /*
      AUTOMATED CHAT MESSAGES (round 38, part 272): broadcasts that are due and days after joining add their next page of
      members, then at most 300 messages go out (150 for one community), each once; fifteen seconds at most.
    */
    const automationsMs = on ? run.share(15_000) : 0
    const automations = automationsMs > 0 ? await runChatAutomations(db, Date.now(), automationsMs).catch(() => ({ available: false, queued: 0, sent: 0, failed: 0, skipped: 0, finished: 0 })) : { available: false, queued: 0, sent: 0, failed: 0, skipped: 0, finished: 0 }
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
  return recordCronRun("/api/cron/community", request, () => runJob(request), { maxDurationS: maxDuration })
}
