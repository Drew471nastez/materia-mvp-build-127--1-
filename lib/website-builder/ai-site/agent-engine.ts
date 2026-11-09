import "server-only"

/**
 * ===========================================================================
 *  WHERE THE AGENT LOOP PLUGS IN (round L)
 * ===========================================================================
 * The runner (./agent-runner.ts) drives a job whose engine is "agent" one
 * iteration at a time through an AgentStepper (lib/ai-builder/agent-step.ts):
 * it owns time (slices, chaining, the lease), the job's budgets, cancel, the
 * checkpoint row and the events. The loop is L3's (lib/ai-builder/agent/*):
 * `runAgentSlice` asked for ONE model call at a time (maxIterations 1) with
 * the runner's deadline, so the runner checks cancel, budgets and its time
 * between every call and saves the checkpoint after each.
 *
 * The loop's own events (phases, tools, files, pages, checks, spend, its
 * end) go to the runner's sink, which writes them through
 * ai_site_job_add_events (numbered by the database under the job's lock);
 * the loop's own numbering is not used. Preview errors come from the
 * runner (the canvas's error events, part 405).
 *
 * The switch is the platform's: AI_BUILDER_AGENT=1 makes new Start with AI
 * jobs agent jobs (lib/website-builder/ai-site/start.ts startEngine).
 * registerAgentStepper replaces the loop (tests, a scripted stepper).
 */
import type { AgentStepContext, AgentStepper, AgentStepperFactory, AgentStepResult } from "@/lib/ai-builder/agent-step"
import type { AgentCheckpoint, StartOptions } from "@/lib/ai-builder/types"
import type { AgentDeps, AgentJobInput, ProjectStore } from "@/lib/ai-builder/agent/ports"
import { runAgentSlice } from "@/lib/ai-builder/agent/loop"
import { agentDeps } from "@/lib/ai-builder/agent/server"
import { newCheckpoint, readCheckpoint, type LoopCheckpoint } from "@/lib/ai-builder/agent/state"

/** L3's slice as one step of the runner. Pure apart from the deps it is given. */
export function sliceStepper(deps: AgentDeps, now: () => number = Date.now): AgentStepper {
  return {
    ownKey: deps.models.ownKey,
    emitsPhases: true,
    start: () => newCheckpoint(),
    async step(saved: AgentCheckpoint, ctx: AgentStepContext): Promise<AgentStepResult> {
      const cp = readCheckpoint(saved) ?? newCheckpoint()
      const options = ctx.job.options && ctx.job.options.generation && !ctx.job.edit ? (ctx.job.options as StartOptions) : undefined
      const input: AgentJobInput = {
        jobId: ctx.job.id,
        creatorId: ctx.job.creatorId,
        installId: ctx.job.installId,
        prompt: ctx.job.prompt,
        mode: ctx.job.mode ?? options?.generation ?? "theme",
        ...(options ? { options } : {}),
        budget: ctx.budget,
        /* The loop's wall clock is the runner's working time (a job waiting between turns is not charged). */
        startedAt: now() - ctx.usage.activeMs,
        spentUsd: ctx.usage.usd,
        lastEventSeq: cp.seq,
        ...(ctx.job.edit ? { edit: true } : {}),
      }
      const r = await runAgentSlice(
        input,
        cp,
        {
          ...deps,
          store: ctx.job.edit ? scopedStore(deps.store, ctx.job.edit.path) : deps.store,
          now,
          emit: (e) => {
            const { seq: _seq, at: _at, ...draft } = e as typeof e & { seq: number; at: string }
            void _seq
            void _at
            ctx.emit(draft as Parameters<AgentStepContext["emit"]>[0])
          },
          cancelled: ctx.cancelled,
          previewErrors: async () => ctx.previewErrors.map((p) => ({ page: p.page, sectionId: p.sectionId, message: p.message })),
        },
        { deadline: now() + ctx.timeLeftMs, maxIterations: 1 },
      )
      const out = r.checkpoint as LoopCheckpoint
      const result: AgentStepResult = {
        checkpoint: out,
        spend: { usd: r.usage.usd, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens },
        calls: r.usage.calls,
        counts: { pagesDone: out.pagesTouched.length, componentsWritten: out.filesTouched.length },
      }
      if (r.status === "running" || r.status === "queued") return result
      return { ...result, done: { status: r.status, ...(r.stopped ? { stopped: r.stopped } : {}), ...(r.summary ? { summary: r.summary } : {}), ...(r.error ? { error: r.error } : {}) } }
    },
  }
}

/** A project store for an edit of one file: every other file is refused, so it stays byte for byte. */
export function scopedStore(store: ProjectStore, path: string): ProjectStore {
  const refused = `This change may only edit ${path}. Other files stay as they are.`
  return {
    ...store,
    writeFile: (p, text, meta) => (p === path ? store.writeFile(p, text, meta) : Promise.resolve({ ok: false, error: refused })),
    deleteFile: (p) => (p === path ? Promise.resolve({ ok: false, error: "An edit does not delete the file it changes." }) : Promise.resolve({ ok: false, error: refused })),
  }
}

/** The real loop for a job: its models (the creator's own key first), project store, capabilities and checks. */
const loopFactory: AgentStepperFactory = async (job) => sliceStepper(await agentDeps({ creatorId: job.creatorId, ownerUserId: job.ownerUserId, installId: job.installId }))

let registered: AgentStepperFactory = loopFactory

/** Replaces the loop (a scripted stepper in a test); null puts the real one back. */
export function registerAgentStepper(factory: AgentStepperFactory | null): void {
  registered = factory ?? loopFactory
}

export async function agentStepperFactory(): Promise<AgentStepperFactory | null> {
  return registered
}

/** Whether new Start with AI jobs should use the agent engine. */
export function agentEngineEnabled(): boolean {
  return process.env.AI_BUILDER_AGENT === "1"
}

/** Agent jobs allowed to run at once across every creator. */
export function maxLiveAgentJobs(): number {
  const n = Number(process.env.AI_BUILDER_MAX_LIVE_JOBS)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 20
}
