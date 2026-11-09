import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
import { after, NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { jobFromRow, JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { canContinue, publicView } from "@/lib/website-builder/ai-site/job"
import { driveJob, kickJob } from "@/lib/website-builder/ai-site/runner"
import { planContinue } from "@/lib/website-builder/ai-site/agent-runner"
import { recordFromRow, type AgentJobRow } from "@/lib/website-builder/ai-site/agent-view"
import { isStartKey, MAX_RUNNING_JOBS } from "@/lib/website-builder/ai-site/start"

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
 *
 * AN AGENT JOB (round L) takes a body:
 *   { action: "continue" }            Continue or Try again: from its checkpoint;
 *                                     a stop on a budget gets a bounded extension
 *                                     (agent-runner.ts planContinue).
 *   { action: "start_over", key }     a new job on the same website, same
 *                                     description, from the start; `key` makes the
 *                                     same press one job.
 * Both idempotent: the revive is one conditional update (a second press finds the
 * job live and gets its view), and start over is unique on (creator, key).
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
  if ((data as { engine?: string }).engine === "agent") return agentContinue(req, data as AgentJobRow, site.creatorId)
  const job = jobFromRow(data as Parameters<typeof jobFromRow>[0])
  /* A runner that is still at work is left to it: Continue never starts a second one. */
  const lease = (data as { lease_until: string | null }).lease_until
  const held = !!lease && Date.parse(lease) > Date.now()
  if (!canContinue(job) || held) return NextResponse.json(publicView(job, Number.MAX_SAFE_INTEGER))
  const admin = createAdminClient()
  await admin.from(JOBS_TABLE).update({ status: "running", error: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("creator_id", site.creatorId)
  const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
  after(() => driveJob(jobId, origin))
  return NextResponse.json({ ...publicView({ ...job, status: "running", error: null }, Number.MAX_SAFE_INTEGER) }, { status: 202 })
}

const BUSY = { error: "Another website is being made with AI. Wait for it to finish, then try again.", code: "ai_busy" }
const SAME_SITE = { error: "Another AI build is running on this website. Wait for it, or cancel it first.", code: "ai_busy_site" }

async function agentContinue(req: Request, row: AgentJobRow, creatorId: string): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { action?: unknown; key?: unknown } | null
  const action = body?.action === "start_over" ? "start_over" : "continue"
  const admin = createAdminClient()
  const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
  const job = recordFromRow(row)
  const live = job.status === "queued" || job.status === "running"

  /* One live AI job per creator (the create route's rule): another website's job blocks a revive here. */
  const since = new Date(Date.now() - 20 * 60_000).toISOString()
  const othersLive = async () => {
    const { count } = await admin.from(JOBS_TABLE).select("id", { count: "exact", head: true }).eq("creator_id", creatorId).in("status", ["queued", "running"]).neq("id", job.id).gte("updated_at", since)
    return (count ?? 0) >= MAX_RUNNING_JOBS
  }

  if (action === "start_over") {
    if (!isStartKey(body?.key)) return NextResponse.json({ error: "key is needed" }, { status: 400 })
    const key = body!.key as string
    const { data: same } = await admin.from(JOBS_TABLE).select("id").eq("creator_id", creatorId).eq("idempotency_key", key).maybeSingle()
    if (same) return NextResponse.json({ job: { id: (same as { id: string }).id } })
    if (live) return NextResponse.json(SAME_SITE, { status: 409 })
    if (await othersLive()) return NextResponse.json(BUSY, { status: 429 })
    const { data: made, error } = await admin
      .from(JOBS_TABLE)
      .insert({ creator_id: creatorId, owner_user_id: row.owner_user_id, install_id: job.installId, prompt: job.prompt, idempotency_key: key, status: "queued", step: "agent", engine: "agent", mode: job.mode, options: job.options, progress: 0, state: {} })
      .select("id")
      .single()
    if (error?.code === "23505") {
      const { data: again } = await admin.from(JOBS_TABLE).select("id").eq("creator_id", creatorId).eq("idempotency_key", key).maybeSingle()
      if (again) return NextResponse.json({ job: { id: (again as { id: string }).id } })
      return NextResponse.json(SAME_SITE, { status: 409 })
    }
    if (error || !made) return NextResponse.json({ error: "Could not start again. Try once more." }, { status: 500 })
    const id = (made as { id: string }).id
    after(() => kickJob(origin, id))
    return NextResponse.json({ job: { id } }, { status: 202 })
  }

  const plan = planContinue(job, Date.now())
  if (plan.kind === "refuse") return NextResponse.json({ error: plan.error, code: plan.code }, { status: plan.status })
  if (plan.kind === "live") {
    /* Already going (a second press, or the first one's answer was lost): re-driven only when its runner is gone. */
    const held = !!job.leaseUntil && Date.parse(job.leaseUntil) > Date.now()
    if (!held) after(() => driveJob(job.id, origin))
    return NextResponse.json({ ok: true, status: job.status })
  }
  if (await othersLive()) return NextResponse.json(BUSY, { status: 429 })
  const state = { ...((row.state ?? {}) as Record<string, unknown>), agent: plan.run }
  /*
    The loop's own end goes too (`final`, lib/ai-builder/agent/state.ts): a budget or a cancel the loop
    itself saw is written there, and a slice that finds it answers that end again at once, so Continue
    revived the row and the next turn ended it the same way (found by tests/ai-builder-benchmarks.test.ts, H).
  */
  const checkpoint = job.checkpoint ? { ...job.checkpoint, stopped: undefined, final: undefined } : null
  const { data: revived, error } = await admin
    .from(JOBS_TABLE)
    .update({ status: "queued", step: "agent", error: null, cancel_requested_at: null, lease_until: null, finished_at: null, budget: plan.budget, state, checkpoint, updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("creator_id", creatorId)
    .eq("attempts", job.attempts)
    .eq("status", job.status)
    .select("id")
  if (error?.code === "23505") return NextResponse.json(SAME_SITE, { status: 409 })
  if (error) return NextResponse.json({ error: "Could not continue. Try once more." }, { status: 500 })
  /* Zero rows: another press revived it first. Either way it is going now. */
  if (Array.isArray(revived) && revived.length === 1) after(() => driveJob(job.id, origin))
  return NextResponse.json({ ok: true, status: "queued", extended: plan.extended }, { status: 202 })
}
