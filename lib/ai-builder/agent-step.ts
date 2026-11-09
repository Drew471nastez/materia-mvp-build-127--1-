/**
 * ===========================================================================
 *  ONE AGENT ITERATION: THE SEAM BETWEEN THE RUNNER (L2) AND THE LOOP (L3)
 * ===========================================================================
 * The durable runner (lib/website-builder/ai-site/agent-runner.ts) owns time:
 * how many iterations fit in one serverless invocation, the job's budgets,
 * cancel, the checkpoint row, the progress events and the hand over to the
 * next invocation. The loop owns what one iteration does: ONE model turn and
 * the tools it calls, ending with a new checkpoint.
 *
 *   runner                                 loop (AgentStepper.step)
 *   ──────                                 ─────────────────────────
 *   load job, claim lease
 *   for each iteration that fits:
 *     cancel? budget left? time left?  ──►  model call, tools (drafts only)
 *                                      ◄──  { checkpoint, spend, done? }
 *     save checkpoint, flush events
 *   chain the next invocation, or end the job
 *
 * A step never saves the job row and never writes events itself: it calls
 * `ctx.emit` and returns. A step that throws leaves the checkpoint as it
 * was (the iteration is run again), so tools must be safe to repeat
 * (every write carries the expected version of what it read).
 *
 * Added by L2 (round L) as a minimal extension of the L0 contract.
 */
import type { AgentCheckpoint, AgentEvent, AgentJobStatus, GenerationMode, JobBudget, RuntimePreviewError, StartOptions } from "./types"

/** An event as a step emits it: the runner numbers it (seq) and stamps it (at). */
export type AgentEventDraft = AgentEvent extends infer E ? (E extends AgentEvent ? Omit<E, "seq" | "at"> : never) : never

/** What a step knows about its job. Ids are bound by the runner; a tool never takes them from the model. */
export interface AgentJobInfo {
  id: string
  creatorId: string
  ownerUserId: string | null
  installId: string
  /** The person's words exactly as written. */
  prompt: string
  /** What the loop should read as the brief: the prompt, then their choices in plain words (start-options.ts startContext). */
  brief: string
  mode: GenerationMode | null
  options: Partial<StartOptions>
}

/** Spend so far, across every invocation of the job. */
export interface AgentUsage {
  iterations: number
  usd: number
  inputTokens: number
  outputTokens: number
  /** Working time, summed over invocations (the wall clock budget). */
  activeMs: number
}

export interface AgentStepContext {
  job: AgentJobInfo
  budget: JobBudget
  /** The spend cap that applies (maxUsd, or maxUsdOwnKey on the creator's own key). */
  usdCap: number
  usage: AgentUsage
  /** The iteration about to run, 1 based. */
  iteration: number
  /** Milliseconds this step may take before the invocation must hand over. A model call should time out inside it. */
  timeLeftMs: number
  maxOutputTokens: number
  /** Numbered, stamped and written in batches by the runner. Never throws. Plain words only, nothing private. */
  emit: (event: AgentEventDraft) => void
  /** True once the owner pressed Cancel. Cheap: read from the database at most every few seconds. Check before each model call and each tool. */
  cancelled: () => Promise<boolean>
  /** Aborted when cancel is seen or the invocation is out of time. Pass it to the provider. */
  signal: AbortSignal
  /** Errors the editor canvas saw while drawing the AI's sections (newest last, at most 20). */
  previewErrors: RuntimePreviewError[]
}

/** Real counts for the progress view, only what is known. */
export interface AgentCounts {
  pagesPlanned?: number
  pagesDone?: number
  componentsWritten?: number
}

export interface AgentStepResult {
  /** The checkpoint after this iteration: `iteration` advanced, compacted to MAX_CHECKPOINT_BYTES. */
  checkpoint: AgentCheckpoint
  /** This iteration's spend only. */
  spend: { usd: number; inputTokens: number; outputTokens: number }
  counts?: AgentCounts
  /** The agent called `finish` and it was accepted: the job ends. `partial` when it says gaps remain. */
  done?: { status: Extract<AgentJobStatus, "complete" | "partial">; summary?: string; notes?: string[] }
}

/** The loop for one job. `ownKey`: the creator's own provider key answers (the larger spend cap applies). */
export interface AgentStepper {
  ownKey: boolean
  /** A fresh checkpoint for a job that has none yet. */
  start(job: AgentJobInfo): AgentCheckpoint
  step(checkpoint: AgentCheckpoint, ctx: AgentStepContext): Promise<AgentStepResult>
}

export type AgentStepperFactory = (job: AgentJobInfo) => Promise<AgentStepper>

/**
 * Throw from a step to say what kind of failure it was. `retryable`: a
 * provider overload, a timeout, a dropped connection (the runner tries the
 * iteration again a few times). `code` picks the words the creator sees.
 */
export class AgentStepError extends Error {
  readonly retryable: boolean
  readonly code: AgentErrorCode
  constructor(message: string, opts: { retryable: boolean; code?: AgentErrorCode }) {
    super(message)
    this.name = "AgentStepError"
    this.retryable = opts.retryable
    this.code = opts.code ?? (opts.retryable ? "model_busy" : "internal")
  }
}

/**
 * Why a job stopped, as a code the editor turns into plain words and
 * recovery actions (lib/website-builder/ai-site/agent-progress.ts).
 */
export type AgentErrorCode =
  | "budget_time"
  | "budget_iterations"
  | "budget_spend"
  | "budget_repairs"
  | "model_busy"
  | "model_key"
  | "too_long"
  | "not_available"
  | "internal"
