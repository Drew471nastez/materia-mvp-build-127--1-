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
import { CODED_PATH, withCoded, type CodedSection } from "@/lib/website-builder/ai-site/code"
import { createAdminClient } from "@/lib/supabase/admin"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { inlineBuildGate } from "@/lib/website-builder/ai-site/start"
import { AI_LIMIT_UNREADABLE } from "@/lib/sites/rate-limit"

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
/** Ten new websites a day, each continued a few times at most: a day of resumes ends here. */
const RESUMES_A_DAY = { limit: 40, seconds: 86_400 } as const

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  if (!isUuid(installId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteInstallCaller(installId)
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  if (!site.isOwner) return NextResponse.json({ error: "Only the store owner can start a website with AI." }, { status: 403 })
  /*
    ONLY WITHOUT THE JOBS TABLE (round AW, lib/website-builder/ai-site/start.ts
    inlineBuildGate). With the table there every Start with AI is a job: one at
    a time, counted once a build, carried on by its id. A build here is asked
    for by nothing else, and it was counted as none of that.
  */
  const gate = inlineBuildGate(await site.supabase.from(JOBS_TABLE).select("id").limit(1))
  if (gate === "jobs") return NextResponse.json({ error: "Start this website with AI from the Website page.", code: "use_job" }, { status: 409 })
  if (gate === "unknown") return NextResponse.json({ error: AI_LIMIT_UNREADABLE }, { status: 503 })
  const body = await req.json().catch(() => ({}))
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, START_PROMPT_MAX) : ""
  if (!prompt) return NextResponse.json({ error: "Describe the website first." }, { status: 400 })
  const started = Date.now()
  let job: Job = newJob({ id: randomUUID(), creatorId: site.creatorId, ownerUserId: site.ownerUserId, installId, prompt })
  /*
    A RESUME IS A CHECKPOINT THAT RESUMES. Any object used to count as one, so
    `checkpoint: {}` was charged to the looser Continue limit (40 an hour)
    while fromCheckpoint, finding no plan in it, started a whole new website:
    the three in ten minutes and ten a day of a new one never applied. Now
    only a checkpoint that carries a plan this route accepts and a step past
    planning is a resume; anything else is a new website and is counted as
    one. And resumes have a day's ceiling of their own, since a made up
    checkpoint with a real plan still writes the code and the pictures.
  */
  const carried = body?.checkpoint && typeof body.checkpoint === "object" ? fromCheckpoint(job, body.checkpoint as Record<string, unknown>) : null
  const resuming = !!carried && !!carried.plan && carried.step !== "plan"
  const limited = await rateLimit({
    bucket: resuming ? "site-generate-continue" : "site-generate",
    subjects: [`creator:${site.creatorId}`],
    windows: resuming ? [...LIMITS.siteAi, RESUMES_A_DAY] : LIMITS.siteGenerate,
    message: "You have started several AI websites in a short time. Wait a few minutes, then try again.",
  })
  if (limited) return limited

  /* The event count is carried either way, so a stream that goes on never repeats a number. */
  if (carried) job = await withStoredCode(carried, installId)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = 0
      const line = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
      /*
        Every operation once: a long wave is sent in pages, as the job route answers a poll. Round AQ: the last page
        of each save carries the checkpoint for what was just saved, so a reload of the editor (which ends this
        request) carries the build on from here instead of losing it (lib/website-builder/start-handoff.ts).
      */
      const save = async (j: Job) => {
        for (;;) {
          const view = publicView(j, sent)
          const last = !view.ops.length || view.ops.length < 400
          line(last ? { type: "job", job: view, checkpoint: j.step === "done" ? null : checkpointOf(j) } : { type: "job", job: view })
          if (last) break
          sent = view.ops[view.ops.length - 1].seq
        }
        sent = j.state.seq
      }
      try {
        const deps = await jobDeps(job, { deadline: started + BUDGET_MS, save })
        const end = await runUntil({ ...job, status: "running" }, { ...deps, signal: req.signal })
        await save(end)
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

/**
 * A checkpoint comes from the browser, so the coded files it names are believed only as far as THIS install's own
 * files say: each schema is read again from the stored file, and a file that is not there is forgotten.
 */
async function withStoredCode(job: Job, installId: string): Promise<Job> {
  const coded = job.state.coded ?? []
  if (!coded.length) return job
  const { data } = await createAdminClient().from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).in("path", coded.map((c) => c.path))
  const schemas = schemasFromSources(sourceMap((data ?? []) as { path: string; content: string; draft_content?: string | null }[]))
  const kept = coded.filter((c) => schemas[c.type]).map((c) => ({ ...c, schema: schemas[c.type] }))
  return { ...job, state: { ...job.state, coded: kept, files: kept.map((c) => c.path) } }
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
  /* The sections already coded for this site are known types on the way back in (lib/website-builder/ai-site/code.ts); a file that is not this site's is not. */
  const coded = Array.isArray(state.coded) ? (state.coded as CodedSection[]).filter((c) => c && typeof c.type === "string" && c.schema && typeof c.schema === "object" && CODED_PATH.test(String(c.path))) : []
  const schemas = withCoded(SECTION_SCHEMAS, coded)
  const plan = raw.plan ? readSitePlan(raw.plan, { caps, addable: [...ADDABLE_SECTIONS, ...coded.map((c) => c.type)], schemas, free: true }) : null
  state.coded = coded
  if (!plan || step === "plan") return { ...job, state: { ...emptyState(), seq: Number(state.seq) || 0 } }
  return { ...job, step, plan, state }
}
