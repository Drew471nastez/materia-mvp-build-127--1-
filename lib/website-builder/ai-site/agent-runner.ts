/**
 * ===========================================================================
 *  AN AGENT JOB ON VERCEL: ONE INVOCATION'S SLICE (round L, L2)
 * ===========================================================================
 * A multi minute agent build cannot live in one serverless request (300 s),
 * so each request runs a SLICE: as many iterations of the loop as fit, a
 * checkpoint saved after each one, then it hands over to the next request
 * (the run route, signed with the job's HMAC token, on storelib.com itself)
 * or ends the job.
 *
 *   claim     the lease (one runner per job; a second kick finds it held).
 *             Every write of the row after that is FENCED on `attempts`,
 *             which the claim raised: a runner whose lease lapsed and was
 *             taken over finds its writes refused and stops.
 *   iterate   before each: cancel asked?  budget left (iterations, spend,
 *             working time, repair cycles)?  time left in this request for
 *             one more model call (callReserveMs)?  Then one step of the
 *             loop (lib/ai-builder/agent-step.ts), its spend added, its
 *             checkpoint saved, its events written in batches.
 *   hand over the lease let go and the next request asked for. If that ask
 *             is lost, the editor's poll or the five minute cron finds the lapsed
 *             lease and asks again (api/cron/ai-jobs).
 *   end       complete / partial (a budget hit, or done with gaps; what was
 *             made stays as drafts) / failed (nothing made) / cancelled,
 *             each with plain words and what can be done next.
 *
 * Pure: the database is an AgentStore and time is `now`, so the tests run
 * whole jobs with a fake clock, crashes and duplicate kicks.
 */
import type { AgentCounts, AgentErrorCode, AgentEventDraft, AgentJobInfo, AgentStepper, AgentStepperFactory, AgentUsage } from "@/lib/ai-builder/agent-step"
import { AgentStepError } from "@/lib/ai-builder/agent-step"
import { DEFAULT_JOB_BUDGET, MAX_CHECKPOINT_BYTES, type AgentCheckpoint, type AgentEvent, type AgentJobStatus, type AgentPhase, type BudgetStop, type GenerationMode, type JobBudget, type RuntimePreviewError, type StartOptions } from "@/lib/ai-builder/types"
import { PHASE_LABEL, stopCode, stopReason } from "./agent-progress"

/* ── the job as the runner sees it ─────────────────────────────────────── */

/** The runner's own bookkeeping, kept in ai_site_jobs.state.agent. */
export interface AgentRunState {
  usage: AgentUsage
  counts: AgentCounts
  errorCode: AgentErrorCode | null
  /** Retryable failures in a row. */
  failures: number
  /** Invocations that claimed the job and saved no new iteration (a crash loop shows here). */
  stalls: number
  /** The iteration the last claim found. */
  claimedAt: number | null
  continues: number
  /** When the job was last started or continued, ISO. The elapsed cap counts from here. */
  resumedAt: string | null
  summary: string | null
  notes: string[]
}

export function emptyRunState(): AgentRunState {
  return { usage: { iterations: 0, usd: 0, inputTokens: 0, outputTokens: 0, activeMs: 0 }, counts: {}, errorCode: null, failures: 0, stalls: 0, claimedAt: null, continues: 0, resumedAt: null, summary: null, notes: [] }
}

export interface AgentJobRecord {
  id: string
  creatorId: string
  ownerUserId: string | null
  installId: string
  prompt: string
  mode: GenerationMode | null
  options: Partial<StartOptions>
  status: AgentJobStatus
  phase: AgentPhase | null
  iteration: number
  checkpoint: AgentCheckpoint | null
  budget: Partial<JobBudget> | null
  cancelRequestedAt: string | null
  lastEventSeq: number
  attempts: number
  leaseUntil: string | null
  createdAt: string
  run: AgentRunState
}

export interface AgentJobPatch {
  status?: AgentJobStatus
  step?: "agent" | "done"
  phase?: AgentPhase | null
  iteration?: number
  checkpoint?: AgentCheckpoint | null
  run?: AgentRunState
  costUsd?: number
  error?: string | null
  lastEventSeq?: number
  /** ISO, or null to let go. */
  leaseUntil?: string | null
  finished?: boolean
}

export interface EventRow {
  seq: number
  kind: AgentEvent["kind"]
  payload: Record<string, unknown>
  at: string
}

/** The database, for the runner. lib/website-builder/ai-site/agent-store.ts is the Supabase one. */
export interface AgentStore {
  load(id: string): Promise<AgentJobRecord | null>
  /** Takes the lease when nobody holds it (raises `attempts`). True when this runner has it. */
  claim(job: AgentJobRecord, now: number, leaseMs: number): Promise<boolean>
  /** Writes only while `attempts` still equals `fence` (this runner's claim). False when the job was taken over. */
  save(id: string, fence: number, patch: AgentJobPatch, now: number): Promise<boolean>
  /** One insert for the batch. `conflict` when a seq is taken (another writer). */
  appendEvents(jobId: string, creatorId: string, rows: EventRow[]): Promise<{ ok: boolean; conflict?: boolean }>
  /** The highest seq written for the job (0 for none). */
  lastSeq(jobId: string): Promise<number>
  /** The two things the owner can change while the job runs. */
  flags(jobId: string): Promise<{ cancelRequested: boolean; previewErrors: RuntimePreviewError[] }>
  /** Jobs whose lease is held right now, every creator. */
  liveCount(now: number): Promise<number>
  /** Holds the job off for a while without running it (waiting for a free slot). */
  park(id: string, until: number): Promise<void>
}

/* ── limits ────────────────────────────────────────────────────────────── */

/** How long one runner holds a job: a little over one request's own deadline (server.ts LEASE_MS). */
export const AGENT_LEASE_MS = 295_000
/** Retryable step failures in a row before the job stops. */
export const MAX_FAILURES = 3
/** Invocations in a row that make no progress before the job stops (a crash loop). */
export const MAX_STALLS = 3
/** Real time from start (or the last Continue) after which a job is given up on, however little it worked. */
export const MAX_ELAPSED_MS = 2 * 60 * 60_000
/** Continues a creator may press on one job. Each grants a fresh share of the budget. */
export const MAX_CONTINUES = 3
/** Agent jobs running at once, every creator (AI_BUILDER_MAX_LIVE_JOBS overrides). */
export const DEFAULT_MAX_LIVE_JOBS = 20
/** How long a job waiting for a free slot is left before it is tried again. */
export const WAIT_FOR_SLOT_MS = 60_000
/** How often a step's cancel check reads the database at most. */
export const CANCEL_CHECK_MS = 3_000
/** Events per job: past the first, tool lines are dropped; past the second, everything but the end. */
export const EVENTS_SOFT_CAP = 400
export const EVENTS_HARD_CAP = 600
/** An event batch is written when it has this many, or this long after the last write. */
export const EVENT_BATCH = 8
export const EVENT_FLUSH_MS = 1_500

export function jobBudget(job: Pick<AgentJobRecord, "budget">): JobBudget {
  const b = { ...DEFAULT_JOB_BUDGET }
  for (const [k, v] of Object.entries(job.budget ?? {})) if (typeof v === "number" && Number.isFinite(v) && v >= 0 && k in b) (b as Record<string, number>)[k] = v
  return b
}

/* ── events: numbered, batched, capped ─────────────────────────────────── */

const MAX_TEXT = 280
const MAX_PAYLOAD = 7_000

function trimPayload(e: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(e)) {
    if (k === "kind" || k === "seq" || k === "at") continue
    if (typeof v === "string") out[k] = v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT - 1)}…` : v
    else if (Array.isArray(v)) out[k] = v.slice(0, 20).map((x) => (typeof x === "string" ? x.slice(0, 120) : x))
    else out[k] = v
  }
  if (JSON.stringify(out).length > MAX_PAYLOAD) return { text: "(too long to show)" }
  return out
}

/** Whether an event is kept once the job has written `seq` events. */
export function keepEvent(kind: AgentEvent["kind"], seq: number): boolean {
  if (kind === "finished" || kind === "error") return true
  if (seq >= EVENTS_HARD_CAP) return false
  if (seq >= EVENTS_SOFT_CAP) return kind !== "tool" && kind !== "spend" && kind !== "note"
  return true
}

/**
 * The job's progress events: each numbered once (seq, monotonic, never
 * reused), written in batches so a busy iteration is a few inserts, not one
 * per tool. Only the runner that holds the lease writes, so numbering in
 * memory is safe; a clash on (job_id, seq) (a runner that lost its lease)
 * renumbers after the newest and tries once more.
 */
export class EventSink {
  private pending: EventRow[] = []
  private chain: Promise<void> = Promise.resolve()
  private lastFlush: number
  seq: number

  constructor(
    private store: AgentStore,
    private jobId: string,
    private creatorId: string,
    startSeq: number,
    private now: () => number,
    /** Whether this runner still holds the job: asked only on a clash, so a runner that lost it never renumbers into another's stream. */
    private owns: () => Promise<boolean> = async () => true,
  ) {
    this.seq = startSeq
    this.lastFlush = now()
  }

  /** Set once the runner lost the job: nothing more is written. */
  closed = false

  emit(draft: AgentEventDraft): void {
    try {
      if (this.closed) return
      const kind = draft.kind
      if (!keepEvent(kind, this.seq + 1)) return
      const at = new Date(this.now()).toISOString()
      this.pending.push({ seq: ++this.seq, kind, payload: trimPayload(draft as unknown as Record<string, unknown>), at })
      if (this.pending.length >= EVENT_BATCH || this.now() - this.lastFlush >= EVENT_FLUSH_MS) void this.flush()
    } catch {
      /* progress is never worth failing a build over */
    }
  }

  /** Writes what is pending. Resolves after every earlier flush too. Never throws. */
  flush(): Promise<void> {
    const rows = this.pending
    this.pending = []
    this.lastFlush = this.now()
    if (!rows.length) return this.chain
    this.chain = this.chain.then(async () => {
      try {
        if (this.closed) return
        const r = await this.store.appendEvents(this.jobId, this.creatorId, rows)
        if (r.ok || !r.conflict) return
        if (!(await this.owns())) {
          this.closed = true
          return
        }
        const top = await this.store.lastSeq(this.jobId)
        const base = Math.max(top, this.seq)
        const again = rows.map((row, i) => ({ ...row, seq: base + 1 + i }))
        this.seq = base + rows.length
        await this.store.appendEvents(this.jobId, this.creatorId, again)
      } catch {
        /* the next batch carries on; the view shows what did land */
      }
    })
    return this.chain
  }
}

/* ── one invocation ────────────────────────────────────────────────────── */

export interface AgentRunDeps {
  store: AgentStore
  /** The loop's factory (L3), or null when the agent engine is not installed. */
  stepperFor: AgentStepperFactory | null
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** When this request started (the slice is counted from here). */
  started?: number
  /** Asks the next request to carry on (the HMAC self kick). True when it was taken. */
  kick: () => Promise<boolean>
  maxLiveJobs?: number
  log?: (message: string, detail?: Record<string, unknown>) => void
}

export type AgentRunOutcome =
  | { outcome: "missing" }
  | { outcome: "ended"; status: AgentJobStatus }
  | { outcome: "held" }
  | { outcome: "waiting" }
  | { outcome: "lost" }
  | { outcome: "chained"; kicked: boolean }

const TERMINAL: readonly AgentJobStatus[] = ["complete", "partial", "failed", "cancelled"]

export function isTerminal(status: string): boolean {
  return (TERMINAL as readonly string[]).includes(status)
}

function infoOf(job: AgentJobRecord): AgentJobInfo {
  return { id: job.id, creatorId: job.creatorId, ownerUserId: job.ownerUserId, installId: job.installId, prompt: job.prompt, mode: job.mode, options: job.options }
}

function madeSomething(cp: AgentCheckpoint | null, counts: AgentCounts): boolean {
  return !!cp && (cp.filesTouched.length > 0 || cp.pagesTouched.length > 0 || (counts.pagesDone ?? 0) > 0 || (counts.componentsWritten ?? 0) > 0)
}

/** Which budget, if any, is used up before the next iteration. */
export function budgetStop(budget: JobBudget, usdCap: number, run: AgentRunState, cp: AgentCheckpoint, activeMs: number): BudgetStop | null {
  if (run.usage.iterations >= budget.maxIterations) return "iterations"
  if (run.usage.usd >= usdCap) return "spend"
  if (activeMs >= budget.maxWallMs) return "wall_clock"
  if (cp.verifyCycles > budget.maxVerifyCycles) return "repairs"
  return null
}

function errorWords(code: AgentErrorCode): string {
  const r = stopReason(code)
  return `${r.title}. ${r.message}`
}

function classify(e: unknown): { retryable: boolean; code: AgentErrorCode } {
  if (e instanceof AgentStepError) return { retryable: e.retryable, code: e.code }
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  if (/\b(401|403)\b|invalid.?api.?key|authentication/i.test(msg)) return { retryable: false, code: "model_key" }
  if (/\b(429|500|502|503|504|529)\b|overload|rate.?limit|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(msg)) return { retryable: true, code: "model_busy" }
  return { retryable: false, code: "internal" }
}

function checkpointSize(cp: AgentCheckpoint): number {
  try {
    return JSON.stringify(cp).length
  } catch {
    return Number.MAX_SAFE_INTEGER
  }
}

/**
 * Runs one slice of an agent job. Returns what happened; the caller (the
 * run route via driveJob) has nothing else to do.
 */
export async function runAgentInvocation(jobId: string, deps: AgentRunDeps): Promise<AgentRunOutcome> {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const log = deps.log ?? ((m: string, d?: Record<string, unknown>) => console.warn(`[ai-agent] ${m}`, d ?? {}))
  const started = deps.started ?? now()
  const { store } = deps

  const job = await store.load(jobId)
  if (!job) return { outcome: "missing" }
  if (isTerminal(job.status)) return { outcome: "ended", status: job.status }

  /* A free slot, every creator together, before taking the lease (a waiting job keeps none). */
  const maxLive = deps.maxLiveJobs ?? DEFAULT_MAX_LIVE_JOBS
  if (!job.cancelRequestedAt && (await store.liveCount(now()).catch(() => 0)) >= maxLive) {
    await store.park(job.id, now() + WAIT_FOR_SLOT_MS).catch(() => undefined)
    return { outcome: "waiting" }
  }

  if (!(await store.claim(job, now(), AGENT_LEASE_MS))) return { outcome: "held" }
  const fence = job.attempts + 1
  const sliceStart = now()
  const budget = jobBudget(job)
  const seqStart = Math.max(job.lastEventSeq, await store.lastSeq(job.id).catch(() => 0))
  const sink = new EventSink(store, job.id, job.creatorId, seqStart, now, async () => (await store.load(job.id))?.attempts === fence)
  let run: AgentRunState = { ...emptyRunState(), ...job.run, usage: { ...emptyRunState().usage, ...job.run.usage } }
  let checkpoint: AgentCheckpoint | null = job.checkpoint
  let phase: AgentPhase | null = job.phase
  let usdCap = budget.maxUsd
  const activeMs = () => run.usage.activeMs + (now() - sliceStart)
  const lease = () => new Date(now() + AGENT_LEASE_MS).toISOString()

  const save = async (patch: AgentJobPatch): Promise<boolean> => {
    await sink.flush()
    const ok = await store.save(job.id, fence, { lastEventSeq: sink.seq, ...patch }, now())
    if (!ok) sink.closed = true
    return ok
  }

  const end = async (status: AgentJobStatus, code: AgentErrorCode | null, extra: { stopped?: BudgetStop } = {}): Promise<AgentRunOutcome> => {
    if (code) sink.emit({ kind: "error", message: errorWords(code), retryable: stopReason(code).actions.includes("retry") })
    sink.emit({ kind: "spend", usd: Math.round(run.usage.usd * 10_000) / 10_000, inputTokens: run.usage.inputTokens, outputTokens: run.usage.outputTokens, iteration: run.usage.iterations })
    sink.emit({ kind: "finished", status, ...(extra.stopped ? { stopped: extra.stopped } : {}) })
    run = { ...run, usage: { ...run.usage, activeMs: activeMs() }, errorCode: code, failures: 0 }
    const ok = await save({
      status,
      step: "done",
      phase: status === "complete" ? "finish" : phase,
      checkpoint: checkpoint ? { ...checkpoint, ...(extra.stopped ? { stopped: extra.stopped } : {}) } : null,
      run,
      costUsd: run.usage.usd,
      error: code ? errorWords(code) : null,
      leaseUntil: null,
      finished: true,
    })
    return ok ? { outcome: "ended", status } : { outcome: "lost" }
  }

  /* Gave up on: too long since it started, or claimed again and again without moving. */
  const since = Date.parse(run.resumedAt ?? job.createdAt)
  if (Number.isFinite(since) && now() - since > MAX_ELAPSED_MS) return end(madeSomething(checkpoint, run.counts) ? "partial" : "failed", "too_long")
  const at = checkpoint?.iteration ?? 0
  run = { ...run, stalls: run.claimedAt === at ? run.stalls + 1 : 0, claimedAt: at }
  if (run.stalls >= MAX_STALLS) return end(madeSomething(checkpoint, run.counts) ? "partial" : "failed", "too_long")
  if (job.cancelRequestedAt) return end("cancelled", null, { stopped: "cancelled" })
  if (!(await store.save(job.id, fence, { run, status: "running", step: "agent" }, now()))) return { outcome: "lost" }

  /* The loop for this job. */
  if (!deps.stepperFor) return end("failed", "not_available")
  let stepper: AgentStepper
  try {
    stepper = await deps.stepperFor(infoOf(job))
  } catch (e) {
    const c = classify(e)
    log("could not start the loop", { job: job.id, code: c.code })
    return end("failed", c.code === "model_busy" ? "model_busy" : c.code)
  }
  usdCap = stepper.ownKey ? budget.maxUsdOwnKey : budget.maxUsd
  if (!checkpoint) {
    checkpoint = stepper.start(infoOf(job))
    phase = checkpoint.phase
    sink.emit({ kind: "phase", phase: checkpoint.phase, label: PHASE_LABEL[checkpoint.phase] })
  }

  /* Cancel, read at most every CANCEL_CHECK_MS. */
  let cancelSeen = false
  let flagsAt = -Infinity
  let previewErrors: RuntimePreviewError[] = []
  const readFlags = async (force = false) => {
    if (cancelSeen) return true
    if (!force && now() - flagsAt < CANCEL_CHECK_MS) return false
    flagsAt = now()
    try {
      const f = await store.flags(job.id)
      previewErrors = f.previewErrors.slice(-20)
      cancelSeen = f.cancelRequested
    } catch {
      /* unknown: carry on, the next check reads again */
    }
    return cancelSeen
  }

  const deadline = started + budget.perInvocationMs
  for (;;) {
    const controller = new AbortController()
    if (await readFlags(true)) return end("cancelled", null, { stopped: "cancelled" })
    const stop = budgetStop(budget, usdCap, run, checkpoint, activeMs())
    if (stop) return end(madeSomething(checkpoint, run.counts) ? "partial" : "failed", stopCode(stop), { stopped: stop })
    if (now() + budget.callReserveMs > deadline) break

    const before = checkpoint
    try {
      const result = await stepper.step(before, {
        job: infoOf(job),
        budget,
        usdCap,
        usage: { ...run.usage, activeMs: activeMs() },
        iteration: run.usage.iterations + 1,
        timeLeftMs: Math.max(0, deadline - now()),
        maxOutputTokens: budget.maxOutputTokensPerCall,
        emit: (e) => sink.emit(e),
        cancelled: async () => {
          const c = await readFlags()
          if (c) controller.abort()
          return c
        },
        signal: controller.signal,
        previewErrors,
      })
      const cp = result.checkpoint
      if (!cp || typeof cp !== "object" || checkpointSize(cp) > MAX_CHECKPOINT_BYTES) throw new AgentStepError("the checkpoint is too large to save", { retryable: false, code: "internal" })
      run = {
        ...run,
        failures: 0,
        stalls: 0,
        usage: {
          iterations: run.usage.iterations + 1,
          usd: run.usage.usd + Math.max(0, result.spend?.usd ?? 0),
          inputTokens: run.usage.inputTokens + Math.max(0, result.spend?.inputTokens ?? 0),
          outputTokens: run.usage.outputTokens + Math.max(0, result.spend?.outputTokens ?? 0),
          activeMs: run.usage.activeMs,
        },
        counts: { ...run.counts, ...(result.counts ?? {}) },
      }
      checkpoint = cp
      if (cp.phase !== phase) {
        phase = cp.phase
        sink.emit({ kind: "phase", phase: cp.phase, label: PHASE_LABEL[cp.phase] })
      }
      if (result.done) {
        run = { ...run, summary: result.done.summary?.slice(0, 600) ?? null, notes: (result.done.notes ?? []).slice(0, 12).map((n) => n.slice(0, 280)) }
        return end(result.done.status, null)
      }
      const ok = await save({ status: "running", step: "agent", phase, iteration: run.usage.iterations, checkpoint, run: { ...run, usage: { ...run.usage, activeMs: activeMs() } }, costUsd: run.usage.usd, error: null, leaseUntil: lease() })
      if (!ok) return { outcome: "lost" }
    } catch (e) {
      if (await readFlags(true)) return end("cancelled", null, { stopped: "cancelled" })
      const c = classify(e)
      log("step failed", { job: job.id, iteration: run.usage.iterations + 1, code: c.code, retryable: c.retryable, error: e instanceof Error ? e.message.slice(0, 200) : "" })
      if (c.retryable && run.failures + 1 < MAX_FAILURES) {
        run = { ...run, failures: run.failures + 1 }
        if (run.failures === 1) sink.emit({ kind: "note", text: "The AI is busy. Trying again." })
        if (!(await save({ run: { ...run, usage: { ...run.usage, activeMs: activeMs() } }, leaseUntil: lease() }))) return { outcome: "lost" }
        await sleep(2_000 * run.failures)
        continue
      }
      return end(madeSomething(checkpoint, run.counts) ? "partial" : "failed", c.code)
    }
  }

  /* Out of time for this request: save, let go, ask the next one. */
  run = { ...run, usage: { ...run.usage, activeMs: activeMs() } }
  const ok = await save({ run, leaseUntil: null })
  if (!ok) return { outcome: "lost" }
  const kicked = await deps.kick().catch(() => false)
  return { outcome: "chained", kicked }
}

/* ── Continue / Try again ──────────────────────────────────────────────── */

export type ContinuePlan =
  | { kind: "revive"; budget: JobBudget; run: AgentRunState; extended: boolean }
  /** Still live: nothing to change, the caller re-drives it only when its lease lapsed. */
  | { kind: "live" }
  | { kind: "refuse"; status: 409; error: string; code: "not_available" | "no_more_continues" | "finished" }

/**
 * What Continue (or Try again) does to a stopped agent job, pure. A stop on
 * a budget grants half a default budget more on that measure, at most
 * MAX_CONTINUES times per job, so total spend stays capped. A stop on an
 * error (the AI busy, a refused key, something broken) tries again with the
 * budget as it was. The checkpoint is kept: the loop resumes where it was.
 */
export function planContinue(job: Pick<AgentJobRecord, "status" | "budget" | "run" | "checkpoint">, now: number): ContinuePlan {
  if (job.status === "queued" || job.status === "running") return { kind: "live" }
  if (job.status === "complete") return { kind: "refuse", status: 409, error: "This website is finished. Start over to build it again.", code: "finished" }
  if (job.run.errorCode === "not_available") return { kind: "refuse", status: 409, error: "AI building is not on yet.", code: "not_available" }
  const budget = jobBudget(job)
  const code = job.run.errorCode
  const onBudget = code === "budget_time" || code === "budget_iterations" || code === "budget_spend" || code === "budget_repairs" || code === "too_long" || job.status === "cancelled" || (job.status === "partial" && !code)
  if (onBudget && job.run.continues >= MAX_CONTINUES) return { kind: "refuse", status: 409, error: "This build has been continued as many times as it can be. Start over instead.", code: "no_more_continues" }
  const u = job.run.usage
  const d = DEFAULT_JOB_BUDGET
  const next: JobBudget = onBudget
    ? {
        ...budget,
        maxIterations: Math.max(budget.maxIterations, u.iterations + Math.ceil(d.maxIterations / 2)),
        maxUsd: Math.max(budget.maxUsd, u.usd + d.maxUsd / 2),
        maxUsdOwnKey: Math.max(budget.maxUsdOwnKey, u.usd + d.maxUsdOwnKey / 2),
        maxWallMs: Math.max(budget.maxWallMs, u.activeMs + d.maxWallMs / 2),
        maxVerifyCycles: Math.max(budget.maxVerifyCycles, (job.checkpoint?.verifyCycles ?? 0) + 1),
      }
    : budget
  const run: AgentRunState = { ...job.run, continues: job.run.continues + (onBudget ? 1 : 0), errorCode: null, failures: 0, stalls: 0, claimedAt: null, resumedAt: new Date(now).toISOString() }
  return { kind: "revive", budget: next, run, extended: onBudget }
}
