import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
import { after, NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { jobFromRow, JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { canContinue, publicView } from "@/lib/website-builder/ai-site/job"
import { driveJob } from "@/lib/website-builder/ai-site/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type Params = { params: Promise<{ jobId: string }> }

/**
 * POST /api/website-builder/ai-jobs/[jobId]/continue
 *
 * The progress view's Continue: a job that stopped part way (a step failed,
 * or it was left waiting) carries on from the step it stopped at, keeping
 * everything it already made. The owner's only, and the same limit as a
 * section written with the AI.
 */
export async function POST(req: Request, { params }: Params) {
  const { jobId } = await params
  if (!isUuid(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  if (!site.isOwner) return NextResponse.json({ error: "Only the store owner can do this." }, { status: 403 })
  const limited = await rateLimit({ bucket: "site-generate-continue", subjects: [`user:${site.userId}`], windows: LIMITS.siteAi, message: "Too many tries in a short time. Wait a minute, then try again." })
  if (limited) return limited
  const { data } = await site.supabase.from(JOBS_TABLE).select("*").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const job = jobFromRow(data as Parameters<typeof jobFromRow>[0])
  /* A runner that is still at work is left to it: Continue never starts a second one. */
  const lease = (data as { lease_until: string | null }).lease_until
  const held = !!lease && Date.parse(lease) > Date.now()
  if (!canContinue(job) || held) return NextResponse.json(publicView(job, Number.MAX_SAFE_INTEGER))
  const admin = createAdminClient()
  /* The owner asked for more: the job's count of turns starts again (lib/website-builder/ai-site/job.ts MAX_JOB_RUNS). */
  await admin.from(JOBS_TABLE).update({ status: "running", error: null, attempts: 0, updated_at: new Date().toISOString() }).eq("id", jobId).eq("creator_id", site.creatorId)
  const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
  after(() => driveJob(jobId, origin))
  return NextResponse.json({ ...publicView({ ...job, status: "running", error: null }, Number.MAX_SAFE_INTEGER) }, { status: 202 })
}
