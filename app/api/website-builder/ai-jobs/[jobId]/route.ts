import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
import { after, NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { isUuid } from "@/lib/site-blog/http"
import { jobFromRow, JOBS_TABLE, leaseLapsed } from "@/lib/website-builder/ai-site/server"
import { publicView } from "@/lib/website-builder/ai-site/job"
import { driveJob } from "@/lib/website-builder/ai-site/runner"
import { AGENT_VIEW_COLUMNS, agentView, EVENTS_PAGE, EVENTS_TABLE, type AgentViewRow } from "@/lib/website-builder/ai-site/agent-view"
import { MAX_CONTINUES } from "@/lib/website-builder/ai-site/agent-runner"

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
 *
 * AN AGENT JOB (engine "agent", SQL part 401) answers its progress EVENTS
 * after `after` instead (ai_site_job_events, by the (job_id, seq) index, a
 * page at a time), its phase, real counts, and a stop's plain words with
 * what can be done next (lib/website-builder/ai-site/agent-progress.ts
 * AgentJobView). The same take over when its runner is gone.
 */
export async function GET(req: Request, { params }: Params) {
  const { jobId } = await params
  if (!isUuid(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const afterParam = Math.max(0, Number(new URL(req.url).searchParams.get("after")) || 0)
  /* The engine first, on the columns part 401 adds; before it ran there is no agent job, and the old read follows. */
  const agent = await site.supabase.from(JOBS_TABLE).select(AGENT_VIEW_COLUMNS).eq("id", jobId).eq("creator_id", site.creatorId).eq("engine", "agent").maybeSingle()
  if (!agent.error && agent.data) {
    const row = agent.data as AgentViewRow & { lease_until: string | null; step: string }
    const { data: events } = await site.supabase.from(EVENTS_TABLE).select("seq, kind, payload, created_at").eq("job_id", jobId).gt("seq", afterParam).order("seq", { ascending: true }).limit(EVENTS_PAGE)
    const live = row.status === "queued" || row.status === "running"
    if (live && (!row.lease_until || Date.parse(row.lease_until) < Date.now())) {
      const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
      after(() => driveJob(jobId, origin))
    }
    return NextResponse.json(agentView(row, (events ?? []) as { seq: number; kind: string; payload: unknown; created_at: string }[], MAX_CONTINUES), { headers: { "cache-control": "no-store" } })
  }
  /* Light first: a poll that finds nothing new reads a few columns, not the whole operation log. */
  const LIGHT = "id, creator_id, owner_user_id, install_id, status, step, progress, prompt, error, attempts, lease_until, seq:state->seq, pages:state->pages, notes:state->notes, findings:state->findings, credits:state->credits"
  const { data, error } = await site.supabase.from(JOBS_TABLE).select(LIGHT).eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const afterSeq = afterParam
  const light = data as Record<string, unknown> & { lease_until: string | null; step: string; status: string }
  const seq = Number(light.seq) || 0
  let ops: unknown = []
  if (seq > afterSeq) {
    const { data: full } = await site.supabase.from(JOBS_TABLE).select("ops:state->ops").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
    ops = (full as { ops?: unknown } | null)?.ops ?? []
  }
  const row = { ...light, plan: null, state: { seq, ops: Array.isArray(ops) ? ops : [], pages: light.pages ?? [], notes: light.notes ?? [], findings: light.findings ?? [], credits: Array.isArray(light.credits) ? light.credits : [] } } as unknown as Parameters<typeof jobFromRow>[0] & { lease_until: string | null }
  const job = jobFromRow(row)
  if (leaseLapsed(light) && job.status !== "partial") {
    const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
    after(() => driveJob(job.id, origin))
  }
  return NextResponse.json(publicView(job, afterSeq), { headers: { "cache-control": "no-store" } })
}
