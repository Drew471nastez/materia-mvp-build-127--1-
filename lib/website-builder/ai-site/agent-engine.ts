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
 * jobs agent jobs for everyone, AI_BUILDER_AGENT_ACCOUNTS for the accounts
 * it lists (./agent-access.ts, round M).
 * registerAgentStepper replaces the loop (tests, a scripted stepper).
 */
import type { AgentStepContext, AgentStepper, AgentStepperFactory, AgentStepResult } from "@/lib/ai-builder/agent-step"
import { agentOnForEveryone } from "./agent-access"
import type { AgentCheckpoint, StartOptions } from "@/lib/ai-builder/types"
import type { AgentDeps, AgentJobInput, ProjectStore } from "@/lib/ai-builder/agent/ports"
import { runAgentSlice } from "@/lib/ai-builder/agent/loop"
import { agentDeps } from "@/lib/ai-builder/agent/server"
import { newCheckpoint, readCheckpoint, type LoopCheckpoint } from "@/lib/ai-builder/agent/state"

/** L3's slice as one step of the runner. Pure apart from the deps it is given. */
export function sliceStepper(deps: AgentDeps, now: () => number = Date.now): AgentStepper {
  /*
    ONE CONVERSATION PER REQUEST. The runner asks for one model call per step, and a slice that starts
    from a saved checkpoint begins with ONE user turn: the brief and a digest of the work, where a tool
    result is cut to 1,200 characters. So every call of an agent job was a fresh conversation in which
    the model saw its last read_file cut short, and never its own last turn (found by
    tests/ai-builder-benchmarks.test.ts, J). The live turns are carried from step to step while this
    request lasts (the stepper is made once per request); a new request resumes from the digest, as
    L3 designed.
  */
  let carried: { iteration: number; turns: NonNullable<Parameters<typeof runAgentSlice>[3]["live"]> } | null = null
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
        ...(ctx.job.redesign && !ctx.job.edit ? { redesign: ctx.job.redesign.scope } : {}),
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
        { deadline: now() + ctx.timeLeftMs, maxIterations: 1, ...(carried && carried.iteration === cp.iteration ? { live: carried.turns } : {}) },
      )
      carried = r.status === "running" ? { iteration: (r.checkpoint as LoopCheckpoint).iteration, turns: r.live } : null
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

/**
 * A project store for an edit of one file: every other file is refused, so it stays byte for byte.
 * The pages and the Theme settings too: a one-component edit may change the settings of that
 * component's own sections (its type, the sections already placed), never add, remove or move a
 * section, add a page, or change the tokens or menus. Before this only the files were held, so
 * "make the heading calmer" could also set new fonts or add a page (found by
 * tests/ai-builder-benchmarks.test.ts, scenario G).
 */
export function scopedStore(store: ProjectStore, path: string): ProjectStore {
  const refused = `This change may only edit ${path}. Other files stay as they are.`
  const type = /^sections\/([a-z0-9_-]+)\.storelib$/.exec(path)?.[1] ?? null
  const elsewhere = `This change is about ${path} only: the pages, other sections and the Theme settings stay as they are.`
  return {
    ...store,
    writeFile: (p, text, meta) => (p === path ? store.writeFile(p, text, meta) : Promise.resolve({ ok: false, error: refused })),
    deleteFile: (p) => (p === path ? Promise.resolve({ ok: false, error: "An edit does not delete the file it changes." }) : Promise.resolve({ ok: false, error: refused })),
    async writeSettings() {
      throw new Error(elsewhere)
    },
    async writePages(pages) {
      const now = new Map((await store.listPages()).map((p) => [p.key, p.sections]))
      for (const p of pages) {
        const before = now.get(p.key)
        if (!before || before.length !== p.sections.length) throw new Error(elsewhere)
        for (const [i, s] of p.sections.entries()) {
          const was = before[i]
          if (was.id !== s.id || was.type !== s.type || (s.group ?? null) !== (was.group ?? null)) throw new Error(elsewhere)
          if (JSON.stringify(was) !== JSON.stringify(s) && s.type !== type) throw new Error(elsewhere)
        }
      }
      return store.writePages(pages)
    },
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

/**
 * The platform's global switch only (on unless AI_BUILDER_AGENT is "0", round N). Routes ask agentEnabledFor (./agent-access.ts), which
 * also reads the per-account allowlist AI_BUILDER_AGENT_ACCOUNTS.
 */
export function agentEngineEnabled(): boolean {
  return agentOnForEveryone(process.env)
}

/** Agent jobs allowed to run at once across every creator. */
export function maxLiveAgentJobs(): number {
  const n = Number(process.env.AI_BUILDER_MAX_LIVE_JOBS)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 20
}
