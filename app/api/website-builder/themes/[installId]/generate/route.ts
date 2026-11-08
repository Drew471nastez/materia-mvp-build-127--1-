import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { websiteInstallCaller } from "@/lib/team/website"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { START_PROMPT_MAX } from "@/lib/website-builder/start-handoff"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { readSitePlan } from "@/lib/website-builder/agent/site-plan"
import { emptyState, newJob, publicView, runUntil, STEPS, type Job } from "@/lib/website-builder/ai-site/job"
import { jobDeps } from "@/lib/website-builder/ai-site/runner"
import { EMPTY_CAPABILITIES } from "@/lib/website-builder/ai-site/capabilities"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

type Params = { params: Promise<{ installId: string }> }

/** This request's share of the 300 seconds before it stops starting work and answers with where it got to. */
const BUDGET_MS = 250_000

/**
 * POST /api/website-builder/themes/[installId]/generate   body: { prompt, checkpoint? }
 *
 * START WITH AI BEFORE SQL PART 380 HAS RUN. The same steps as the job
 * (lib/website-builder/ai-site/job.ts), run inside this request while the
 * editor shows them land, as NDJSON lines:
 *
 *   {"type":"job","job":<publicView>}   after every step and wave
 *   {"type":"end","job":...,"checkpoint":...}
 *
 * The site is written to its drafts as it goes, as the job does. What this
 * cannot do is go on with the tab closed: the editor says so, and when the
 * request runs out of time it answers with a checkpoint (the plan and what is
 * done, never the operations) that Continue sends back. A checkpoint is the
 * caller's own website's, checked again here, and can only build what a new
 * plan could.
 */
export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  if (!isUuid(installId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteInstallCaller(installId)
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  if (!site.isOwner) return NextResponse.json({ error: "Only the store owner can start a website with AI." }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, START_PROMPT_MAX) : ""
  if (!prompt) return NextResponse.json({ error: "Describe the website first." }, { status: 400 })
  const resuming = body?.checkpoint && typeof body.checkpoint === "object"
  const limited = await rateLimit({
    bucket: resuming ? "site-generate-continue" : "site-generate",
    subjects: [`creator:${site.creatorId}`],
    windows: resuming ? LIMITS.siteAi : LIMITS.siteGenerate,
    message: "You have started several AI websites in a short time. Wait a few minutes, then try again.",
  })
  if (limited) return limited

  const started = Date.now()
  let job: Job = newJob({ id: randomUUID(), creatorId: site.creatorId, ownerUserId: site.ownerUserId, installId, prompt })
  if (resuming) job = fromCheckpoint(job, body.checkpoint)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = 0
      const line = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      const save = async (j: Job) => {
        line({ type: "job", job: publicView(j, sent) })
        sent = j.state.seq
      }
      try {
        const deps = await jobDeps(job, { deadline: started + BUDGET_MS, save })
        const end = await runUntil({ ...job, status: "running" }, { ...deps, signal: req.signal })
        line({ type: "end", job: publicView(end, sent), checkpoint: end.step === "done" ? null : checkpointOf(end) })
      } catch (e) {
        console.error("[ai-site] generate failed", { install: installId, error: e instanceof Error ? e.message.slice(0, 200) : "" })
        line({ type: "end", job: { ...publicView({ ...job, status: "failed", error: "Could not build the website." }, sent) }, checkpoint: checkpointOf(job) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } })
}

/** What Continue sends back: the plan and what is done, never the operations already applied. */
function checkpointOf(job: Job) {
  const { ops: _ops, ...state } = job.state
  void _ops
  return { step: job.step, plan: job.plan, state: { ...state, ops: [] } }
}

function fromCheckpoint(job: Job, raw: Record<string, unknown>): Job {
  const step = STEPS.includes(raw.step as Job["step"]) ? (raw.step as Job["step"]) : "plan"
  const state = { ...emptyState(), ...(raw.state && typeof raw.state === "object" ? (raw.state as object) : {}), ops: [] }
  const caps = state.caps ?? EMPTY_CAPABILITIES
  const plan = raw.plan ? readSitePlan(raw.plan, { caps, addable: [...ADDABLE_SECTIONS], schemas: SECTION_SCHEMAS }) : null
  if (!plan || step === "plan") return { ...job, state: { ...emptyState(), seq: Number(state.seq) || 0 } }
  return { ...job, step, plan, state }
}
