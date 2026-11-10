import "server-only"

/**
 * ===========================================================================
 *  START WITH AI: ONE RUNNER, HOWEVER IT WAS WOKEN
 * ===========================================================================
 * The create route, the run route (the job calling itself) and the editor's
 * poll (when the runner before it died) all wake a job the same way:
 * `driveJob` claims it (one runner at a time), runs steps until its own
 * deadline, lets go, and if the job is not finished calls the run route
 * with a signed token so the next request carries on. Everything the steps
 * need is assembled here from the real services (`jobDeps`).
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveForCreator } from "@/lib/sites/agent/provider"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { readStoreFacts } from "../agent/store-facts-server"
import { visualCheck } from "../agent/visual-check"
import { readCapabilities } from "./capabilities"
import { jobEngine, outOfRuns, runUntil, type Job, type JobDeps } from "./job"
import { writerCoder } from "./code"
import { runAgentInvocation, type AgentRunOutcome } from "./agent-runner"
import { agentStore } from "./agent-store"
import { agentStepperFactory, maxLiveAgentJobs } from "./agent-engine"
import { PLAN_MODEL, SMALL_MODEL, WRITE_MODEL, type Models } from "./models"
import { claimJob, imageDeps, jobToken, loadJob, releaseJob, RUN_BUDGET_MS, saveJob, siteIO } from "./server"
import { nativeReviewEnabled } from "./native-review/flag"
import { nativeReviewFor } from "./native-review/server"

/** The three models, answered on the creator's own Claude key when they connected one. */
export async function jobModels(creatorId: string): Promise<Models> {
  const [plan, write, small] = await Promise.all([
    resolveForCreator(creatorId, { requested: "anthropic", tier: "strong", model: PLAN_MODEL }),
    resolveForCreator(creatorId, { requested: "anthropic", tier: "fast", model: WRITE_MODEL }),
    resolveForCreator(creatorId, { requested: "anthropic", tier: "fast", model: SMALL_MODEL }),
  ])
  return {
    plan: { provider: plan.provider, model: plan.model, effort: "medium" },
    write: { provider: write.provider, model: write.model, effort: "low" },
    small: { provider: small.provider, model: small.model, effort: "low" },
  }
}

export async function jobDeps(job: Job, opts: { deadline: number; save?: (job: Job) => Promise<void>; origin?: string }): Promise<JobDeps> {
  const admin = createAdminClient()
  const models = await jobModels(job.creatorId)
  return {
    models,
    site: siteIO(admin, job.installId, job.creatorId),
    /*
      FREE DESIGN: the site's own header, footer and custom sections, written by the code editor's section writer on
      the strongest of the three models, at medium effort (./code.ts writerCoder). The key stays on the server: the
      writer runs here, through the provider layer, and only the finished file reaches the website.
    */
    code: writerCoder(models.plan.effort === "medium" ? models.plan : { ...models.plan, effort: "medium" }, `ai-site:${job.installId}`),
    capabilities: () => readCapabilities(admin, { creatorId: job.creatorId, ownerUserId: job.ownerUserId }, readStoreFacts),
    images: imageDeps(admin, job.ownerUserId),
    visual: async (state) => {
      const report = await visualCheck({ state, sources: {}, schemas: SECTION_SCHEMAS, shots: false, timeoutMs: 40_000 })
      return report ? report.findings : null
    },
    schemas: SECTION_SCHEMAS,
    addable: [...ADDABLE_SECTIONS],
    /*
      Round R (R3): the finished draft looked at as the live site draws it, at 1440 and 390 with JavaScript off,
      and refined with typed patches (./native-review), behind AI_NATIVE_ENGINE. The site's own route draws it, so
      it needs the site's address; the strongest of the three models reviews it, inside NATIVE_REVIEW_MAX_USD.
    */
    ...(opts.origin && nativeReviewEnabled() ? { nativeReview: nativeReviewFor({ origin: opts.origin, installId: job.installId, vision: models.plan }) } : {}),
    save: opts.save ?? ((j) => saveJob(admin, j)),
    deadline: opts.deadline,
  }
}

/** Calls the run route for this job: the next request picks it up. Never throws. */
export async function kickJob(origin: string, jobId: string): Promise<boolean> {
  const token = jobToken(jobId)
  if (!token) return false
  try {
    const res = await fetch(`${origin}/api/website-builder/ai-jobs/${jobId}/run`, { method: "POST", headers: { "x-ai-job-token": token }, signal: AbortSignal.timeout(8_000) })
    return res.status === 202
  } catch {
    return false
  }
}

/**
 * An agent job's turn (round L): as many iterations of the loop as fit in this request, a checkpoint after each,
 * then the next request asked for (./agent-runner.ts). Never throws.
 */
export async function driveAgentJob(jobId: string, origin: string, started = Date.now()): Promise<AgentRunOutcome | null> {
  try {
    return await runAgentInvocation(jobId, {
      store: agentStore(createAdminClient()),
      stepperFor: await agentStepperFactory(),
      started,
      kick: () => kickJob(origin, jobId),
      maxLiveJobs: maxLiveAgentJobs(),
    })
  } catch (e) {
    console.error("[ai-agent] runner failed", { job: jobId, error: e instanceof Error ? e.message.slice(0, 200) : "" })
    return null
  }
}

/** Claims the job, runs it until this request's budget is spent, hands over. */
export async function driveJob(jobId: string, origin: string, started = Date.now()): Promise<void> {
  const admin = createAdminClient()
  const job = await loadJob(admin, jobId)
  if (job && jobEngine(job) === "agent") {
    await driveAgentJob(jobId, origin, started)
    return
  }
  if (!job || job.step === "done" || job.status === "failed") return
  /* A job that has had its share of turns stops, kept as far as it got, and says so: Continue can still take it on. */
  if (outOfRuns(job)) {
    await saveJob(admin, { ...job, status: "partial", error: "It took longer than a website should. Everything made so far is kept." })
    return
  }
  if (!(await claimJob(admin, job))) return
  let after: Job = job
  try {
    after = await runUntil({ ...job, status: "running" }, await jobDeps(job, { deadline: started + RUN_BUDGET_MS, origin }))
  } catch (e) {
    console.error("[ai-site] runner failed", { job: jobId, error: e instanceof Error ? e.message.slice(0, 200) : "" })
  } finally {
    await releaseJob(admin, jobId)
  }
  if (after.step !== "done" && after.status === "running" && !after.error) await kickJob(origin, jobId)
}
