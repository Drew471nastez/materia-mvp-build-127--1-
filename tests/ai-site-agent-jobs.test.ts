/**
 * ===========================================================================
 *  START WITH AI AS AN AGENT: DURABLE JOBS, BUDGETS, EVENTS (round L, L2)
 * ===========================================================================
 * The runner (lib/website-builder/ai-site/agent-runner.ts) with a fake
 * clock, an in-memory AgentStore that keeps the database's rules (lease,
 * fence on attempts, unique (job_id, seq)) and a scripted stepper in place
 * of the loop (L3). No network, no model.
 *
 *   1. CHAINING     iterations fit into a slice with room for one more call;
 *                   the checkpoint saved after each; the next request asked.
 *   2. BUDGETS      iterations, spend (own key larger), working time across
 *                   invocations, repair cycles; partial with drafts kept,
 *                   failed when nothing was made.
 *   3. CANCEL       mid-run, at the next safe point; drafts kept; Continue.
 *   4. CRASH        an invocation that dies mid step: the next one resumes
 *                   from the checkpoint, the dead one's late writes refused.
 *   5. LEASES       duplicate kicks; a crash loop given up on; the global
 *                   live limit parks a job.
 *   6. EVENTS       one seq each, monotonic across invocations, batched,
 *                   resumed after events the row did not record, renumbered
 *                   on a clash, capped.
 *   7. ENDINGS      complete / partial / failed / cancelled, plain words and
 *                   recovery actions; Continue's bounded extension.
 *   8. SAFETY NET   the five minute sweep's query and kicks, the cron, SQL.
 *   9. THE VIEW     the poll's answer, the client's merge and back off, the
 *                   progress panel's states.
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/ai-site-agent-jobs.test.ts
 */
import { readFileSync, existsSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentStepError, type AgentStepContext, type AgentStepper, type AgentStepResult } from "@/lib/ai-builder/agent-step"
import { DEFAULT_JOB_BUDGET, type AgentCheckpoint, type AgentEvent, type AgentJobStatus } from "@/lib/ai-builder/types"
import {
  AGENT_LEASE_MS,
  EVENTS_HARD_CAP,
  EVENTS_SOFT_CAP,
  EventSink,
  MAX_CONTINUES,
  MAX_STALLS,
  emptyRunState,
  keepEvent,
  planContinue,
  runAgentInvocation,
  type AgentJobPatch,
  type AgentJobRecord,
  type AgentRunDeps,
  type AgentStore,
  type EventRow,
} from "@/lib/website-builder/ai-site/agent-runner"
import { agentView, recordFromRow, readPreviewError } from "@/lib/website-builder/ai-site/agent-view"
import { componentName, stopReason, toolSummary } from "@/lib/website-builder/ai-site/agent-progress"
import { sweepAiJobs, SWEEP_QUIET_MS } from "@/lib/website-builder/ai-site/agent-sweep"
import { agentPollDelay, changesDrafts, mergeEvents, AGENT_POLL_LIVE_MS, AGENT_POLL_MAX_MS, AGENT_POLL_MIN_MS } from "@/lib/website-builder/ai-site/use-generation"
import { jobEngine } from "@/lib/website-builder/ai-site/job"
import { AgentProgressPanel, agentPanelState, eventLine } from "@/components/website-builder/ai-generation/agent-progress-panel"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

/* ── the fakes ─────────────────────────────────────────────────────────── */

class Clock {
  t = Date.parse("2026-11-09T12:00:00Z")
  now = () => this.t
  advance = (ms: number) => {
    this.t += ms
  }
  sleep = async (ms: number) => {
    this.t += ms
  }
}

/** An AgentStore with the database's rules: lease, fenced writes, unique (job_id, seq). */
class MemoryStore implements AgentStore {
  jobs = new Map<string, AgentJobRecord>()
  events: (EventRow & { jobId: string })[] = []
  inserts = 0
  failNextInsert: "conflict" | null = null
  liveOthers = 0
  parked: string[] = []
  constructor(private clock: Clock) {}
  add(job: Partial<AgentJobRecord> & { id: string }): AgentJobRecord {
    const j: AgentJobRecord = {
      creatorId: "c1",
      ownerUserId: "u1",
      installId: "i1",
      prompt: "A candle shop",
      mode: "blank",
      options: {},
      status: "queued",
      phase: null,
      iteration: 0,
      checkpoint: null,
      budget: null,
      cancelRequestedAt: null,
      lastEventSeq: 0,
      attempts: 0,
      leaseUntil: null,
      createdAt: new Date(this.clock.now()).toISOString(),
      run: emptyRunState(),
      ...job,
    }
    this.jobs.set(j.id, j)
    return j
  }
  async load(id: string) {
    const j = this.jobs.get(id)
    return j ? structuredClone(j) : null
  }
  async claim(job: AgentJobRecord, now: number, leaseMs: number) {
    const j = this.jobs.get(job.id)
    if (!j || j.attempts !== job.attempts || !["queued", "running"].includes(j.status)) return false
    if (j.leaseUntil && Date.parse(j.leaseUntil) >= now) return false
    j.leaseUntil = new Date(now + leaseMs).toISOString()
    j.attempts += 1
    j.status = "running"
    return true
  }
  async save(id: string, fence: number, p: AgentJobPatch) {
    const j = this.jobs.get(id)
    if (!j || j.attempts !== fence) return false
    if (p.status !== undefined) j.status = p.status
    if (p.phase !== undefined) j.phase = p.phase
    if (p.iteration !== undefined) j.iteration = p.iteration
    if (p.checkpoint !== undefined) j.checkpoint = structuredClone(p.checkpoint)
    if (p.run !== undefined) j.run = structuredClone(p.run)
    if (p.lastEventSeq !== undefined) j.lastEventSeq = p.lastEventSeq
    if (p.leaseUntil !== undefined) j.leaseUntil = p.leaseUntil
    return true
  }
  async appendEvents(jobId: string, _c: string, rows: EventRow[]) {
    this.inserts++
    if (this.failNextInsert === "conflict") {
      this.failNextInsert = null
      /* Somebody else wrote the next number first. */
      this.events.push({ jobId, seq: rows[0].seq, kind: "note", payload: { text: "other" }, at: "" })
      return { ok: false, conflict: true }
    }
    if (rows.some((r) => this.events.some((e) => e.jobId === jobId && e.seq === r.seq))) return { ok: false, conflict: true }
    this.events.push(...rows.map((r) => ({ ...r, jobId })))
    return { ok: true }
  }
  async lastSeq(jobId: string) {
    return Math.max(0, ...this.events.filter((e) => e.jobId === jobId).map((e) => e.seq))
  }
  async flags(jobId: string) {
    return { cancelRequested: !!this.jobs.get(jobId)?.cancelRequestedAt, previewErrors: [] }
  }
  async liveCount(now: number) {
    return this.liveOthers + [...this.jobs.values()].filter((j) => j.status === "running" && j.leaseUntil && Date.parse(j.leaseUntil) > now).length
  }
  async park(id: string, until: number) {
    const j = this.jobs.get(id)!
    j.status = "queued"
    j.leaseUntil = new Date(until).toISOString()
    this.parked.push(id)
  }
  eventsOf(jobId: string) {
    return this.events.filter((e) => e.jobId === jobId).sort((a, b) => a.seq - b.seq)
  }
}

interface Script {
  /** Milliseconds each step takes on the fake clock. */
  stepMs?: number
  /** The iteration (1 based) on which the agent finishes. */
  doneAt?: number
  doneStatus?: "complete" | "partial"
  usdPerStep?: number
  ownKey?: boolean
  /** Per iteration: throw these, one per attempt, in order. */
  throwAt?: Record<number, unknown[]>
  /** Per iteration: hang until released. */
  hangAt?: number
  verifyCyclesAt?: Record<number, number>
  /** Called inside each step with its context. */
  inside?: (ctx: AgentStepContext, iteration: number) => Promise<void> | void
  /** Files written per step. */
  writes?: boolean
}

function scripted(clock: Clock, s: Script): { stepper: AgentStepper; calls: number[]; release: () => void } {
  const calls: number[] = []
  let release = () => {}
  const stepper: AgentStepper = {
    ownKey: !!s.ownKey,
    start: () => ({ version: 1, iteration: 0, phase: "brief", turns: [], summary: "", openTasks: [], filesTouched: [], pagesTouched: [], repairs: {}, verifyCycles: 0 }),
    async step(cp: AgentCheckpoint, ctx: AgentStepContext): Promise<AgentStepResult> {
      const n = ctx.iteration
      calls.push(n)
      if (s.hangAt === n) await new Promise<void>((r) => (release = r))
      clock.advance(s.stepMs ?? 30_000)
      const queued = s.throwAt?.[n]
      if (queued?.length) throw queued.shift()
      ctx.emit({ kind: "tool", tool: "write_file", summary: toolSummary("write_file", { path: `sections/ai_part_${n}.storelib` }), ok: true, ms: 1200 })
      if (s.inside) await s.inside(ctx, n)
      const phase = n === 1 ? "plan" : n < (s.doneAt ?? 99) - 1 ? "build" : "verify"
      const file = `sections/ai_part_${n}.storelib`
      if (s.writes !== false) ctx.emit({ kind: "file", path: file, action: "created", bytes: 900 })
      const next: AgentCheckpoint = {
        ...cp,
        iteration: cp.iteration + 1,
        phase,
        filesTouched: s.writes === false ? cp.filesTouched : [...cp.filesTouched, file],
        verifyCycles: s.verifyCyclesAt?.[n] ?? cp.verifyCycles,
      }
      return {
        checkpoint: next,
        spend: { usd: s.usdPerStep ?? 0.05, inputTokens: 1000, outputTokens: 400 },
        counts: s.writes === false ? {} : { pagesPlanned: 4, pagesDone: Math.min(4, Math.floor(n / 2)), componentsWritten: next.filesTouched.length },
        ...(s.doneAt === n ? { done: { status: s.doneStatus ?? "complete", summary: "Made a candle shop with four pages.", notes: s.doneStatus === "partial" ? ["The reviews section was left out: there are no reviews yet."] : [] } } : {}),
      }
    },
  }
  return { stepper, calls, release: () => release() }
}

function deps(store: MemoryStore, clock: Clock, stepper: AgentStepper | null, extra: Partial<AgentRunDeps> = {}): AgentRunDeps & { kicks: number } {
  const d = {
    store,
    stepperFor: stepper ? async () => stepper : null,
    now: clock.now,
    sleep: clock.sleep,
    kicks: 0,
    log: () => {},
    kick: async () => {
      d.kicks++
      return true
    },
    ...extra,
  }
  return d
}

/** Drives a job to its end the way the chain does: invocation after invocation. */
async function drive(store: MemoryStore, clock: Clock, id: string, stepper: AgentStepper | null, limit = 30) {
  const outcomes: string[] = []
  for (let i = 0; i < limit; i++) {
    const d = deps(store, clock, stepper)
    const r = await runAgentInvocation(id, { ...d, started: clock.now() })
    outcomes.push(r.outcome)
    if (r.outcome !== "chained") break
    clock.advance(1_000)
  }
  return outcomes
}

async function main() {
/* ── 1. chaining ───────────────────────────────────────────────────────── */

console.log("\n1. Chaining: a slice runs what fits, saves, hands over\n")
{
  const clock = new Clock()
  const store = new MemoryStore(clock)
  store.add({ id: "j1" })
  const s = scripted(clock, { stepMs: 50_000, doneAt: 10 })
  const d = deps(store, clock, s.stepper)
  const r = await runAgentInvocation("j1", { ...d, started: clock.now() })
  const job = store.jobs.get("j1")!
  check("the first slice chains to the next request", r.outcome === "chained" && d.kicks === 1, r)
  check("it ran 4 iterations of 50 s inside 240 s, keeping 60 s for one more call", s.calls.join(",") === "1,2,3,4", s.calls)
  check("the checkpoint after the last one is saved", job.checkpoint?.iteration === 4 && job.iteration === 4)
  check("the lease is let go for the next request", job.leaseUntil === null)
  check("working time is counted (200 s)", job.run.usage.activeMs === 200_000, job.run.usage.activeMs)
  check("still running, step agent", job.status === "running")
  clock.advance(2_000)
  const rest = await drive(store, clock, "j1", s.stepper)
  check("later slices resume from the checkpoint, never repeating an iteration", s.calls.join(",") === "1,2,3,4,5,6,7,8,9,10", s.calls)
  check("and the job completes", store.jobs.get("j1")!.status === "complete" && rest[rest.length - 1] === "ended", rest)
  check("spend adds up across invocations", Math.abs(store.jobs.get("j1")!.run.usage.usd - 0.5) < 1e-9)
  check("real counts reach the row", store.jobs.get("j1")!.run.counts.componentsWritten === 10)

  /* A slice never starts a call it cannot finish: a step that takes 3 minutes runs once per request. */
  const c2 = new Clock()
  const st2 = new MemoryStore(c2)
  st2.add({ id: "j2" })
  const s2 = scripted(c2, { stepMs: 190_000, doneAt: 3 })
  await runAgentInvocation("j2", { ...deps(st2, c2, s2.stepper), started: c2.now() })
  check("a step that ends past 180 s is the only one in its slice", s2.calls.length === 1)
  const perCall = DEFAULT_JOB_BUDGET.perInvocationMs - DEFAULT_JOB_BUDGET.callReserveMs
  check("defaults stay under Vercel's 300 s with room to save and chain", DEFAULT_JOB_BUDGET.perInvocationMs <= 240_000 && perCall <= 180_000 && AGENT_LEASE_MS < 300_000)
}

/* ── 2. budgets ────────────────────────────────────────────────────────── */

console.log("\n2. Budgets end the job, never silently\n")
{
  const clock = new Clock()
  const store = new MemoryStore(clock)
  store.add({ id: "it", budget: { maxIterations: 5 } })
  const s = scripted(clock, { stepMs: 10_000 })
  await drive(store, clock, "it", s.stepper)
  const j = store.jobs.get("it")!
  check("iterations: stops after 5, partial, drafts kept", s.calls.length === 5 && j.status === "partial" && j.checkpoint!.filesTouched.length === 5, { calls: s.calls, status: j.status })
  check("its reason is the step limit", j.run.errorCode === "budget_iterations")
  const fin = store.eventsOf("it").find((e) => e.kind === "finished")
  check("the finished event says partial, stopped on iterations", fin?.payload.status === "partial" && fin?.payload.stopped === "iterations", fin)
  check("the checkpoint records why it stopped", j.checkpoint?.stopped === "iterations")

  const c2 = new Clock()
  const st2 = new MemoryStore(c2)
  st2.add({ id: "usd" })
  const s2 = scripted(c2, { stepMs: 5_000, usdPerStep: 1.5 })
  await drive(st2, c2, "usd", s2.stepper)
  check("spend: the platform cap ($4) stops it after the call that crossed it", s2.calls.length === 3 && st2.jobs.get("usd")!.run.errorCode === "budget_spend", s2.calls)

  const c3 = new Clock()
  const st3 = new MemoryStore(c3)
  st3.add({ id: "own" })
  const s3 = scripted(c3, { stepMs: 5_000, usdPerStep: 1.5, ownKey: true })
  await drive(st3, c3, "own", s3.stepper)
  check("the creator's own key gets the larger cap ($15)", s3.calls.length === 10, s3.calls.length)

  const c4 = new Clock()
  const st4 = new MemoryStore(c4)
  st4.add({ id: "wall", budget: { maxWallMs: 7 * 60_000 } })
  const s4 = scripted(c4, { stepMs: 60_000 })
  const out4 = await drive(st4, c4, "wall", s4.stepper)
  check("working time: summed over invocations, stops at 7 minutes", st4.jobs.get("wall")!.run.errorCode === "budget_time" && s4.calls.length === 7 && out4.filter((o) => o === "chained").length >= 1, { calls: s4.calls.length, out4 })

  const c5 = new Clock()
  const st5 = new MemoryStore(c5)
  st5.add({ id: "rep" })
  const s5 = scripted(c5, { stepMs: 5_000, verifyCyclesAt: { 3: 3 } })
  await drive(st5, c5, "rep", s5.stepper)
  check("repairs: more verify cycles than allowed ends it partial", st5.jobs.get("rep")!.run.errorCode === "budget_repairs" && st5.jobs.get("rep")!.status === "partial")

  const c6 = new Clock()
  const st6 = new MemoryStore(c6)
  st6.add({ id: "none", budget: { maxIterations: 2 } })
  const s6 = scripted(c6, { stepMs: 5_000, writes: false })
  await drive(st6, c6, "none", s6.stepper)
  check("a budget hit with nothing made is failed, not partial", st6.jobs.get("none")!.status === "failed")

  const ctxSeen: AgentStepContext[] = []
  const c7 = new Clock()
  const st7 = new MemoryStore(c7)
  st7.add({ id: "ctx" })
  const s7 = scripted(c7, { stepMs: 5_000, doneAt: 2, inside: (ctx) => void ctxSeen.push(ctx) })
  await drive(st7, c7, "ctx", s7.stepper)
  check("each step is told its caps: output tokens, spend cap, time left", ctxSeen[0]?.maxOutputTokens === 24_000 && ctxSeen[0]?.usdCap === 4 && ctxSeen[0].timeLeftMs <= 240_000 && ctxSeen[1].usage.iterations === 1)
}

/* ── 3. cancel ─────────────────────────────────────────────────────────── */

console.log("\n3. Cancel stops at the next safe point and keeps the drafts\n")
{
  const clock = new Clock()
  const store = new MemoryStore(clock)
  store.add({ id: "c" })
  let sawCancelInside = false
  const s = scripted(clock, {
    stepMs: 20_000,
    inside: async (ctx, n) => {
      if (n === 3) store.jobs.get("c")!.cancelRequestedAt = new Date(clock.now()).toISOString()
      if (n === 3) {
        clock.advance(4_000)
        sawCancelInside = await ctx.cancelled()
        check("the step's signal is aborted once cancel is seen", ctx.signal.aborted)
      }
    },
  })
  const r = await runAgentInvocation("c", { ...deps(store, clock, s.stepper), started: clock.now() })
  const j = store.jobs.get("c")!
  check("the step sees it through ctx.cancelled()", sawCancelInside)
  check("no iteration starts after it", s.calls.join(",") === "1,2,3", s.calls)
  check("the job ends cancelled", r.outcome === "ended" && j.status === "cancelled")
  check("what it wrote is kept (checkpoint and files)", j.checkpoint!.filesTouched.length === 3)
  check("cancelled has no error words", j.run.errorCode === null)
  const plan = planContinue(j, clock.now())
  check("Continue after Cancel resumes from the checkpoint with a fresh share", plan.kind === "revive" && plan.extended && plan.run.continues === 1)

  /* Cancel while nobody runs it: the next turn ends it at once, before any model call. */
  const c2 = new Clock()
  const st2 = new MemoryStore(c2)
  st2.add({ id: "c2", cancelRequestedAt: new Date(c2.now()).toISOString() })
  const s2 = scripted(c2, {})
  await runAgentInvocation("c2", { ...deps(st2, c2, s2.stepper), started: c2.now() })
  check("a waiting job that was cancelled ends without a model call", st2.jobs.get("c2")!.status === "cancelled" && s2.calls.length === 0)
}

/* ── 4. crash and resume ───────────────────────────────────────────────── */

console.log("\n4. A crash mid step: resumed from the checkpoint, the dead runner fenced out\n")
{
  const clock = new Clock()
  const store = new MemoryStore(clock)
  store.add({ id: "x" })
  const s = scripted(clock, { stepMs: 20_000, hangAt: 3, doneAt: 6 })
  const zombie = runAgentInvocation("x", { ...deps(store, clock, s.stepper), started: clock.now() })
  await new Promise((r) => setTimeout(r, 10))
  check("the first runner saved 2 iterations before it hung", store.jobs.get("x")!.checkpoint?.iteration === 2)
  clock.advance(AGENT_LEASE_MS + 1_000)
  const s2 = scripted(clock, { stepMs: 20_000, doneAt: 6 })
  const out = await drive(store, clock, "x", s2.stepper)
  check("the next runner resumes at iteration 3 and completes", s2.calls[0] === 3 && store.jobs.get("x")!.status === "complete", { calls: s2.calls, out })
  s.release()
  const late = await zombie
  check("the dead runner's late save is refused (fenced on attempts)", late.outcome === "lost" && store.jobs.get("x")!.status === "complete", late)
  const xs = store.eventsOf("x")
  const seqs = xs.map((e) => e.seq)
  check("events stay one per seq", new Set(seqs).size === seqs.length)
  check("the dead runner wrote nothing after the job's ending", xs[xs.length - 1].kind === "finished", xs.slice(-3))
}

/* ── 5. leases, crash loops, the live limit ────────────────────────────── */

console.log("\n5. Duplicate kicks, crash loops, the global limit\n")
{
  const clock = new Clock()
  const store = new MemoryStore(clock)
  store.add({ id: "d" })
  const s = scripted(clock, { stepMs: 20_000, hangAt: 1 })
  const first = runAgentInvocation("d", { ...deps(store, clock, s.stepper), started: clock.now() })
  await new Promise((r) => setTimeout(r, 5))
  const second = await runAgentInvocation("d", { ...deps(store, clock, s.stepper), started: clock.now() })
  const third = await runAgentInvocation("d", { ...deps(store, clock, s.stepper), started: clock.now() })
  check("a second and third kick find the job held", second.outcome === "held" && third.outcome === "held")
  check("only one step runs", s.calls.length === 1)
  s.release()
  await first

  /* An invocation that dies before saving any iteration, again and again. */
  const c2 = new Clock()
  const st2 = new MemoryStore(c2)
  st2.add({ id: "loop" })
  let outcome = ""
  for (let i = 0; i < MAX_STALLS + 1; i++) {
    const s2 = scripted(c2, { hangAt: 1 })
    void runAgentInvocation("loop", { ...deps(st2, c2, s2.stepper), started: c2.now() }).then((r) => (outcome = r.outcome))
    await new Promise((r) => setTimeout(r, 5))
    c2.advance(AGENT_LEASE_MS + 1_000)
  }
  await new Promise((r) => setTimeout(r, 5))
  const lj = st2.jobs.get("loop")!
  check("claimed with no progress MAX_STALLS times: given up on, plain words", lj.status === "failed" && lj.run.errorCode === "too_long", { status: lj.status, code: lj.run.errorCode, outcome })

  const c3 = new Clock()
  const st3 = new MemoryStore(c3)
  st3.add({ id: "busy" })
  st3.liveOthers = 3
  const r3 = await runAgentInvocation("busy", { ...deps(st3, c3, scripted(c3, {}).stepper), started: c3.now(), maxLiveJobs: 3 })
  const bj = st3.jobs.get("busy")!
  check("over the global live limit: parked, waiting, no lease taken, no model call", r3.outcome === "waiting" && bj.status === "queued" && bj.attempts === 0 && st3.parked.includes("busy"))
  st3.liveOthers = 0
  c3.advance(61_000)
  const r3b = await runAgentInvocation("busy", { ...deps(st3, c3, scripted(c3, { doneAt: 1 }).stepper), started: c3.now(), maxLiveJobs: 3 })
  check("once a slot frees, it runs", r3b.outcome === "ended" && st3.jobs.get("busy")!.status === "complete", r3b)

  const c4 = new Clock()
  const st4 = new MemoryStore(c4)
  st4.add({ id: "old", createdAt: new Date(c4.now() - 3 * 60 * 60_000).toISOString() })
  await runAgentInvocation("old", { ...deps(st4, c4, scripted(c4, {}).stepper), started: c4.now() })
  check("a job hours past its start is ended, not run", st4.jobs.get("old")!.run.errorCode === "too_long")

  const c5 = new Clock()
  const st5 = new MemoryStore(c5)
  st5.add({ id: "na" })
  await runAgentInvocation("na", { ...deps(st5, c5, null), started: c5.now() })
  check("no agent engine installed: failed with its own words", st5.jobs.get("na")!.status === "failed" && st5.jobs.get("na")!.run.errorCode === "not_available")
}

/* ── 6. events ─────────────────────────────────────────────────────────── */

console.log("\n6. Events: numbered once, in order, batched, resumable, capped\n")
{
  const clock = new Clock()
  const store = new MemoryStore(clock)
  store.add({ id: "e" })
  const s = scripted(clock, { stepMs: 50_000, doneAt: 7 })
  await drive(store, clock, "e", s.stepper)
  const ev = store.eventsOf("e")
  const seqs = ev.map((e) => e.seq)
  check("seq runs 1..n with no gap and no repeat across invocations", seqs.every((q, i) => q === i + 1), seqs)
  check("the row's last_event_seq matches the newest event", store.jobs.get("e")!.lastEventSeq === seqs[seqs.length - 1])
  check("phases are events, in order (brief, plan, build, verify)", ev.filter((e) => e.kind === "phase").map((e) => e.payload.phase).join(",") === "brief,plan,build,verify", ev.filter((e) => e.kind === "phase").map((e) => e.payload.phase))
  check("tool lines are plain words", ev.find((e) => e.kind === "tool")?.payload.summary === "Writing the part 1 section")
  check("the last event is finished", ev[ev.length - 1].kind === "finished" && ev[ev.length - 1].payload.status === "complete")
  check("batched: fewer inserts than events", store.inserts < ev.length, { inserts: store.inserts, events: ev.length })
  check("no event carries a file body or the prompt", ev.every((e) => !JSON.stringify(e.payload).includes("candle shop")))

  /* Events flushed mid iteration, then the runner died before saving the row: the next starts after them. */
  const c2 = new Clock()
  const st2 = new MemoryStore(c2)
  st2.add({ id: "r", status: "running", lastEventSeq: 3, checkpoint: { version: 1, iteration: 1, phase: "build", turns: [], summary: "", openTasks: [], filesTouched: ["sections/ai_a.storelib"], pagesTouched: [], repairs: {}, verifyCycles: 0 } })
  for (let q = 1; q <= 9; q++) st2.events.push({ jobId: "r", seq: q, kind: "note", payload: {}, at: "" })
  await runAgentInvocation("r", { ...deps(st2, c2, scripted(c2, { doneAt: 2 }).stepper), started: c2.now() })
  const after = st2.eventsOf("r").map((e) => e.seq)
  check("resumes numbering after the newest stored event, not the row's stale number", after.slice(9)[0] === 10 && new Set(after).size === after.length, after)

  /* A clash on (job_id, seq): renumbered after the newest and written. */
  const c3 = new Clock()
  const st3 = new MemoryStore(c3)
  const sink = new EventSink(st3, "s", "c1", 0, c3.now)
  st3.failNextInsert = "conflict"
  sink.emit({ kind: "note", text: "one" })
  sink.emit({ kind: "note", text: "two" })
  await sink.flush()
  const rows = st3.eventsOf("s")
  const mine = rows.filter((r) => r.payload.text !== "other")
  check("a clash renumbers after the newest and keeps both lines, in order, no seq twice", rows.length === 3 && new Set(rows.map((r) => r.seq)).size === 3 && mine.map((r) => r.payload.text).join(",") === "one,two" && mine[0].seq > 1 && sink.seq === mine[1].seq, rows)

  check("past the soft cap, tool lines are dropped", !keepEvent("tool", EVENTS_SOFT_CAP + 1) && keepEvent("file", EVENTS_SOFT_CAP + 1))
  check("past the hard cap only the ending is kept", !keepEvent("file", EVENTS_HARD_CAP + 1) && keepEvent("finished", EVENTS_HARD_CAP + 50) && keepEvent("error", EVENTS_HARD_CAP + 50))
  const c4 = new Clock()
  const st4 = new MemoryStore(c4)
  const big = new EventSink(st4, "b", "c1", 0, c4.now)
  for (let i = 0; i < 1000; i++) big.emit({ kind: "tool", tool: "read_file", summary: "Reading", ok: true, ms: 1 })
  big.emit({ kind: "finished", status: "complete" })
  await big.flush()
  check("a runaway loop writes at most the soft cap of tool lines, and still its ending", st4.eventsOf("b").length === EVENTS_SOFT_CAP && st4.eventsOf("b").at(-1)!.kind === "finished", st4.eventsOf("b").length)
  const huge = new EventSink(st4, "h", "c1", 0, c4.now)
  huge.emit({ kind: "note", text: "x".repeat(5_000) })
  await huge.flush()
  check("long text is cut so a row stays far under its 8 KB check", String(st4.eventsOf("h")[0].payload.text).length <= 280)
}

/* ── 7. endings and recovery ───────────────────────────────────────────── */

console.log("\n7. Endings in plain words, with what can be done next\n")
{
  const ends: Record<string, AgentJobStatus> = {}
  for (const [id, script, budget] of [
    ["ok", { doneAt: 2 }, null],
    ["gaps", { doneAt: 2, doneStatus: "partial" as const }, null],
    ["busy", { throwAt: { 1: [new Error("529 overloaded"), new Error("529 overloaded"), new Error("529 overloaded")] } }, null],
    ["key", { throwAt: { 1: [new AgentStepError("401 invalid api key", { retryable: false, code: "model_key" })] } }, null],
  ] as const) {
    const clock = new Clock()
    const store = new MemoryStore(clock)
    store.add({ id, budget })
    await drive(store, clock, id, scripted(clock, { stepMs: 5_000, ...(script as Script) }).stepper)
    ends[id] = store.jobs.get(id)!.status
    if (id === "gaps") check("partial keeps the agent's notes for the view", store.jobs.get(id)!.run.notes.length === 1)
    if (id === "busy") {
      const ev = store.eventsOf(id)
      check("the AI busy three times: stops with model_busy, offers Try again", store.jobs.get(id)!.run.errorCode === "model_busy" && stopReason("model_busy").actions.includes("retry"))
      check("tried again in between, and said so once", ev.filter((e) => e.kind === "note" && e.payload.text === "The AI is busy. Trying again.").length === 1)
      const plan = planContinue(store.jobs.get(id)!, clock.now())
      check("Try again after an error keeps the budget as it was", plan.kind === "revive" && !plan.extended && plan.run.continues === 0)
    }
    if (id === "key") check("a refused key is not retried and says where to fix it", store.jobs.get(id)!.run.errorCode === "model_key" && /Settings/.test(stopReason("model_key").message))
  }
  check("complete, partial, failed: each reached honestly", ends.ok === "complete" && ends.gaps === "partial" && ends.busy === "failed" && ends.key === "failed", ends)
  /* A one off busy recovers inside the slice. */
  const clock = new Clock()
  const store = new MemoryStore(clock)
  store.add({ id: "blip" })
  const s = scripted(clock, { stepMs: 5_000, doneAt: 3, throwAt: { 2: [new Error("fetch failed")] } })
  await drive(store, clock, "blip", s.stepper)
  check("one dropped connection: the iteration is tried again and the job completes", store.jobs.get("blip")!.status === "complete" && s.calls.join(",") === "1,2,2,3", s.calls)

  const words = ["budget_time", "budget_iterations", "budget_spend", "budget_repairs", "model_busy", "model_key", "too_long", "not_available", "internal"] as const
  const slop = /unlock|elevate|seamless|powerful|effortless|supercharge|transform|—/i
  check("every reason has words free of the banned ones and at least one action", words.every((w) => { const r = stopReason(w); return r.actions.length > 0 && !slop.test(r.title + r.message) }))

  const base = { ...emptyRunState(), usage: { iterations: 80, usd: 3.9, inputTokens: 0, outputTokens: 0, activeMs: 600_000 } }
  const plan = planContinue({ status: "partial", budget: null, run: { ...base, errorCode: "budget_iterations" }, checkpoint: null }, Date.now())
  check("Continue on a budget stop grants half a default budget more", plan.kind === "revive" && plan.budget.maxIterations === 120 && Math.abs(plan.budget.maxUsd - 5.9) < 1e-9 && plan.budget.maxWallMs === 600_000 + 600_000, plan)
  const spent = planContinue({ status: "partial", budget: null, run: { ...base, errorCode: "budget_spend", continues: MAX_CONTINUES }, checkpoint: null }, Date.now())
  check("but only MAX_CONTINUES times: total spend stays capped", spent.kind === "refuse" && spent.code === "no_more_continues")
  check("Continue on a running job changes nothing (a second press)", planContinue({ status: "running", budget: null, run: base, checkpoint: null }, Date.now()).kind === "live")
  check("a finished job cannot be continued", planContinue({ status: "complete", budget: null, run: base, checkpoint: null }, Date.now()).kind === "refuse")
}

/* ── 8. the safety net ─────────────────────────────────────────────────── */

console.log("\n8. The five minute net, the cron, part 401\n")
{
  const calls: { op: string; args: unknown[] }[] = []
  const rows = [{ id: "a1" }, { id: "a2" }]
  const builder = (table: string) => {
    const b: Record<string, (...args: unknown[]) => unknown> = {}
    for (const op of ["select", "in", "or", "lt", "gt", "order", "limit", "delete"]) {
      b[op] = (...args: unknown[]) => {
        calls.push({ op: `${table}.${op}`, args })
        return b
      }
    }
    ;(b as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(table === "ai_site_jobs" ? { data: rows, error: null } : { error: null })
    return b
  }
  const kicked: string[] = []
  const now = Date.parse("2026-11-09T12:03:00Z")
  const r = await sweepAiJobs({ from: builder }, { now, kick: async (id) => (kicked.push(id), true) })
  const has = (op: string, test: (a: unknown[]) => boolean) => calls.some((c) => c.op === op && test(c.args))
  check("reads only live jobs", has("ai_site_jobs.in", (a) => a[0] === "status" && JSON.stringify(a[1]) === '["queued","running"]'))
  check("whose lease is empty or ran out", has("ai_site_jobs.or", (a) => String(a[0]).startsWith("lease_until.is.null,lease_until.lt.")))
  check("left alone for a minute and a half, not older than six hours", has("ai_site_jobs.lt", (a) => a[0] === "updated_at" && Date.parse(String(a[1])) === now - SWEEP_QUIET_MS) && has("ai_site_jobs.gt", (a) => a[0] === "updated_at"))
  check("a few at a time, oldest first", has("ai_site_jobs.order", (a) => a[0] === "updated_at") && has("ai_site_jobs.limit", (a) => Number(a[0]) <= 25))
  check("each is asked for its next turn", kicked.join(",") === "a1,a2" && r.kicked === 2)
  check("in the first five minutes of the hour, events older than 30 days are deleted", r.pruned && has("ai_site_job_events.lt", (a) => a[0] === "created_at"))
  calls.length = 0
  const r2 = await sweepAiJobs({ from: builder }, { now: Date.parse("2026-11-09T12:20:00Z"), kick: async () => true })
  check("and not otherwise", !r2.pruned && !calls.some((c) => c.op.startsWith("ai_site_job_events")))

  const vercel = JSON.parse(read("vercel.json"))
  check("vercel.json runs it every five minutes", vercel.crons.some((c: { path: string; schedule: string }) => c.path === "/api/cron/ai-jobs" && c.schedule === "*/5 * * * *"))
  check("vercel.json keeps its ignoreCommand and deployment switches", vercel.ignoreCommand === "bash scripts/vercel/ignore-build.sh" && vercel.git?.deploymentEnabled?.["claude/*"] === false)
  const cron = read("app/api/cron/ai-jobs/route.ts")
  check("the cron is behind CRON_SECRET and recorded like the others", /requireBearerSecret\(request, "CRON_SECRET"\)/.test(cron) && /recordCronRun\("\/api\/cron\/ai-jobs"/.test(cron))
  check("listed for /admin's scheduled jobs", /path: "\/api\/cron\/ai-jobs", schedule: "\*\/5 \* \* \* \*"/.test(read("lib/admin/schema-expectations.ts")))
  const sql = read("supabase/sql/run-now/401_ai_builder_agent.sql")
  check("part 401: the owner is told once per batch, not once per row", /REFERENCING NEW TABLE AS new_events FOR EACH STATEMENT/.test(sql) && /max\(n\.seq\)/.test(sql))
  check("part 401: live jobs indexed by lease, events by age", /idx_ai_site_jobs_live ON public\.ai_site_jobs \(lease_until\) WHERE status IN \('queued', 'running'\)/.test(sql) && /idx_ai_site_job_events_created ON public\.ai_site_job_events \(created_at\)/.test(sql))
  check("part 401: preview errors bounded on the job", /runtime_errors jsonb NOT NULL DEFAULT '\[\]'::jsonb CHECK \(jsonb_typeof\(runtime_errors\) = 'array' AND octet_length\(runtime_errors::text\) <= 16000\)/.test(sql))
  check("the events route never writes progress events (the runner numbers them)", !/ai_site_job_events/.test(read("app/api/website-builder/ai-jobs/[jobId]/events/route.ts").replace(/\/\*[\s\S]*?\*\//g, "")))
  for (const r of ["cancel", "continue", "events"]) {
    const src = read(`app/api/website-builder/ai-jobs/[jobId]/${r}/route.ts`)
    check(`${r}: the caller's website only (websiteCaller + creator_id)`, /websiteCaller\(\)/.test(src) && /\.eq\("creator_id", site\.creatorId\)/.test(src))
  }
  check("cancel and continue are the owner's", ["cancel", "continue"].every((r) => /if \(!site\.isOwner\)/.test(read(`app/api/website-builder/ai-jobs/[jobId]/${r}/route.ts`))))
  check("a preview error from another website is refused", readPreviewError({ installId: "other", page: "home", sectionId: "s", message: "x" }, "mine") === null && readPreviewError({ installId: "mine", page: "home", sectionId: "s", message: "boom\u0000" }, "mine")?.message === "boom")
  check("the engine switch: no engine or classic stays classic", jobEngine({}) === "classic" && jobEngine({ engine: "classic" }) === "classic" && jobEngine({ engine: "agent" }) === "agent")
  const runner = read("lib/website-builder/ai-site/runner.ts")
  check("driveJob sends only agent jobs to the agent runner; the classic path is the same calls", /if \(job && jobEngine\(job\) === "agent"\)/.test(runner) && /after = await runUntil\(\{ \.\.\.job, status: "running" \}, await jobDeps\(job, \{ deadline: started \+ RUN_BUDGET_MS \}\)\)/.test(runner))
  check("the run route is unchanged: HMAC token, 202, after()", /verifyJobToken\(jobId, req\.headers\.get\("x-ai-job-token"\)\)/.test(read("app/api/website-builder/ai-jobs/[jobId]/run/route.ts")))
  check("the runner never starts a call it has no time for", /if \(now\(\) \+ budget\.callReserveMs > deadline\) break/.test(read("lib/website-builder/ai-site/agent-runner.ts")))
  check("tests are listed in the push suite", /"tests\/ai-site-agent-jobs\.test\.ts"/.test(read("scripts/run-push-tests.mjs")))
  check("there is no fake percentage in the agent view", !/progressbar|percent|aria-valuenow|%`/i.test(read("components/website-builder/ai-generation/agent-progress-panel.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
  check("cron route exists", existsSync("app/api/cron/ai-jobs/route.ts"))
}

/* ── 9. the view ───────────────────────────────────────────────────────── */

console.log("\n9. The poll's answer, the client, the panel\n")
{
  const ev = (seq: number, e: Record<string, unknown>) => ({ seq, kind: e.kind as string, payload: e, created_at: "2026-11-09T12:00:00Z" })
  const view = agentView(
    { id: "j", install_id: "i", status: "partial", phase: "verify", last_event_seq: 4, cancel_requested_at: null, run: { ...emptyRunState(), errorCode: "budget_spend", counts: { pagesPlanned: 4, pagesDone: 3 } } },
    [ev(3, { kind: "file", path: "sections/ai_hero.storelib", action: "created", bytes: 10 }), ev(2, { kind: "phase", phase: "plan", label: "Planning pages" })],
    MAX_CONTINUES,
  )
  check("events come back in seq order", view.events.map((e) => e.seq).join(",") === "2,3")
  check("the cursor is the newest of the row's number and the events'", view.seq === 4)
  check("a budget stop answers its words and Continue / Start over", view.error?.code === "budget_spend" && view.error.actions.join(",") === "continue,start_over")
  const used = agentView({ id: "j", install_id: "i", status: "partial", phase: null, last_event_seq: 0, cancel_requested_at: null, run: { ...emptyRunState(), errorCode: "budget_spend", continues: MAX_CONTINUES } }, [], MAX_CONTINUES)
  check("no Continue once they are used up", used.error?.actions.join(",") === "start_over")
  check("a record reads back from its row with its bookkeeping", recordFromRow({ id: "j", creator_id: "c", owner_user_id: null, install_id: "i", status: "running", attempts: 2, lease_until: null, created_at: "", prompt: "p", engine: "agent", state: { agent: { continues: 2, usage: { usd: 1 } } } }).run.continues === 2)

  check("poll: 2 s, backing off to 10 s while nothing comes", agentPollDelay({ settled: false, hidden: false, realtime: false, idle: 0 }) === AGENT_POLL_MIN_MS && agentPollDelay({ settled: false, hidden: false, realtime: false, idle: 20 }) === AGENT_POLL_MAX_MS)
  check("poll: only a 20 s check while realtime is up", agentPollDelay({ settled: false, hidden: false, realtime: true, idle: 0 }) === AGENT_POLL_LIVE_MS)
  check("poll: none while hidden or once it ended", agentPollDelay({ settled: true, hidden: false, realtime: false, idle: 0 }) === null && agentPollDelay({ settled: false, hidden: true, realtime: false, idle: 0 }) === null)
  const e = (seq: number): AgentEvent => ({ seq, at: "", kind: "note", text: String(seq) })
  const merged = mergeEvents(mergeEvents([e(1), e(2)], [e(2), e(3), e(5)]), [e(4)])
  check("resume: events merged once each in order, whatever order they arrive", merged.map((x) => x.seq).join(",") === "1,2,3,4,5")
  check("and kept to the newest few hundred", mergeEvents([], Array.from({ length: 400 }, (_, i) => e(i + 1)), 300)[0].seq === 101)
  check("files, pages and tokens tell the canvas to read the drafts again", changesDrafts([{ seq: 1, at: "", kind: "page", page: "about", title: "About", action: "created", sections: 3 }]) && !changesDrafts([e(1)]))

  check("plain words for files and tools", componentName("sections/ai_hero_banner.storelib") === "hero banner" && toolSummary("validate") === "Checking for errors" && toolSummary("set_page_sections", { page: "home" }) === "Laying out the home page")
  check("validation lines count real problems", eventLine({ seq: 1, at: "", kind: "validation", errors: 2, warnings: 0 })?.text === "Found 2 problems")
  check("spend and finished are not list lines", eventLine({ seq: 1, at: "", kind: "spend", usd: 1, inputTokens: 1, outputTokens: 1, iteration: 1 }) === null)

  const base = { ...view, status: "running" as const, error: null, cancelRequested: false, summary: null, notes: [] as string[] }
  const html = (v: typeof view, events: AgentEvent[] = view.events) =>
    renderToStaticMarkup(createElement(AgentProgressPanel, { view: v, events, busy: null, problem: null, onCancel() {}, onContinue() {}, onStartOver() {}, onClose() {} }))
  const working = html(base)
  check("working: the phase, real counts, the list, Cancel", /data-agent-generation="working"/.test(working) && /Checking for errors/.test(working) && /3 of 4 pages done/.test(working) && /Wrote the hero section/.test(working) && /data-agent-cancel/.test(working))
  check("stopping: Cancel pressed, it says so", agentPanelState({ status: "running", cancelRequested: true }) === "stopping" && /Stopping/.test(html({ ...base, cancelRequested: true })))
  const partial = html(view)
  check("partial on a limit: its reason, Continue and See your website", /Your website is ready, with a few gaps/.test(partial) && /AI spending limit|AI spend one build may/.test(partial) && /data-agent-continue/.test(partial) && /See your website/.test(partial))
  const failedHtml = html({ ...base, status: "failed", error: { code: "model_busy", message: "", actions: ["retry"] } })
  check("failed: the reason as the title, Try again", /The AI is busy/.test(failedHtml) && /Try again/.test(failedHtml) && !/data-agent-cancel/.test(failedHtml))
  const cancelled = html({ ...base, status: "cancelled" })
  check("cancelled: drafts kept, Continue or Start over", /Building cancelled/.test(cancelled) && /saved as a draft/.test(cancelled) && /data-agent-continue/.test(cancelled) && /data-agent-start-over/.test(cancelled))
  const complete = html({ ...base, status: "complete", summary: "Made a candle shop with four pages." })
  check("complete: the agent's summary and See your website", /Your website is ready/.test(complete) && /four pages/.test(complete) && /data-agent-done/.test(complete))
  check("no em dash in what the panel says", ![working, partial, failedHtml, cancelled, complete].some((h) => h.includes("—")))
}

}

main().then(() => {
console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log("\nFailures:\n" + failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
})
