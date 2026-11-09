import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
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
  /* Light first: a poll that finds nothing new reads a few columns, not the whole operation log. */
  const LIGHT = "id, creator_id, owner_user_id, install_id, status, step, progress, prompt, error, attempts, lease_until, seq:state->seq, pages:state->pages, notes:state->notes, findings:state->findings, credits:state->credits, files:state->files, activity:state->activity"
  const { data, error } = await site.supabase.from(JOBS_TABLE).select(LIGHT).eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const afterSeq = Math.max(0, Number(new URL(req.url).searchParams.get("after")) || 0)
  const light = data as Record<string, unknown> & { lease_until: string | null; step: string; status: string }
  const seq = Number(light.seq) || 0
  let ops: unknown = []
  if (seq > afterSeq) {
    const { data: full } = await site.supabase.from(JOBS_TABLE).select("ops:state->ops").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
    ops = (full as { ops?: unknown } | null)?.ops ?? []
  }
  const row = { ...light, plan: null, state: { seq, ops: Array.isArray(ops) ? ops : [], pages: light.pages ?? [], notes: light.notes ?? [], findings: light.findings ?? [], credits: Array.isArray(light.credits) ? light.credits : [], files: Array.isArray(light.files) ? light.files : [], activity: Array.isArray(light.activity) ? light.activity : [] } } as unknown as Parameters<typeof jobFromRow>[0] & { lease_until: string | null }
  const job = jobFromRow(row)
  if (leaseLapsed(light) && job.status !== "partial") {
    const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
    after(() => driveJob(job.id, origin))
  }
  return NextResponse.json(publicView(job, afterSeq), { headers: { "cache-control": "no-store" } })
}
