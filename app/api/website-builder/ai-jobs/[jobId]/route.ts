import { after, NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { isUuid } from "@/lib/site-blog/http"
import { jobFromRow, JOBS_TABLE, leaseLapsed } from "@/lib/website-builder/ai-site/server"
import { publicView } from "@/lib/website-builder/ai-site/job"
import { driveJob } from "@/lib/website-builder/ai-site/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** A poll that finds the runner gone takes the job over in after(), which runs as long as one step may. */
export const maxDuration = 300

type Params = { params: Promise<{ jobId: string }> }

/**
 * GET /api/website-builder/ai-jobs/[jobId]?after=<seq>
 *
 * Start with AI's progress, for the editor's progress view: the step, how far
 * along, what was left out, and the operations made since `after`, which the
 * editor replays onto its canvas (lib/website-builder/ai-site/job.ts
 * publicView). Read through the caller's own client and this creator only.
 *
 * KEEPING IT GOING. When the job is not finished and nobody holds it (the
 * runner before ran out of time and its hand over was lost), this request
 * takes it over after answering, so an open editor never waits on a job that
 * stopped.
 */
export async function GET(req: Request, { params }: Params) {
  const { jobId } = await params
  if (!isUuid(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { data, error } = await site.supabase.from(JOBS_TABLE).select("*").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const afterSeq = Math.max(0, Number(new URL(req.url).searchParams.get("after")) || 0)
  const row = data as Parameters<typeof jobFromRow>[0] & { lease_until: string | null }
  const job = jobFromRow(row)
  if (leaseLapsed(row) && job.status !== "partial") {
    const origin = new URL(req.url).origin
    after(() => driveJob(job.id, origin))
  }
  return NextResponse.json(publicView(job, afterSeq), { headers: { "cache-control": "no-store" } })
}
