/**
 * ===========================================================================
 *  THE AGENT LOOP: ONE SLICE OF A JOB, RESUMABLE
 * ===========================================================================
 * `runAgentSlice(job, checkpoint, deps, { deadline })` is what L2's runner
 * calls once per invocation (architecture D6). It runs iterations (one model
 * call and its tools each) until one of:
 *
 *   the job is done        finish passed verify          → complete
 *   repairs ran out        verify still fails            → partial, honest
 *   a budget is spent      wall clock, iterations, spend → partial (failed if
 *                                                           nothing was made)
 *   cancel requested       checked before every call     → cancelled
 *   this invocation's time deadline minus callReserveMs → running: save the
 *                                                           checkpoint, chain
 *
 * and returns the events it emitted, the checkpoint to save (always under
 * MAX_CHECKPOINT_BYTES), and the spend. Nothing is lost between slices: the
 * files and pages are in the database, the checkpoint carries the concept,
 * the plan, the ids, the repair counts and a digest of the conversation.
 *
 * PHASES (AgentPhase): brief (deterministic: what is real, what exists, the
 * knowledge for this job) → plan (the concept, on the strong model) → build
 * (the tool loop) → verify (finish: every check, anti slop) → repair (only
 * the failing files, bounded) → finish.
 *
 * MONEY: before every call the worst case of that call (its input as sent
 * plus maxOutputTokensPerCall, at the model's price, or Opus's when the model
 * is unpriced) must fit what is left of the job's cap; after it the real
 * usage is added and reported as a `spend` event.
 */
import "server-only"
import { ZERO_USAGE, type AgentTurn, type ProviderTurn, type ToolResult } from "@/lib/sites/agent/types"
import { costOf, rateFor } from "@/lib/sites/agent/models"
import { AGENT_TOOL_NAMES, type AgentEvent, type AgentJobStatus, type AgentPhase, type AgentToolName, type BudgetStop, type ValidationIssue } from "../types"
import type { AgentToolInputs, AgentToolOutputs, ToolSet } from "../agent-tools"
import type { AgentDeps, AgentJobInput, KnowledgeHit, ModelRole } from "./ports"
import { AGENT_SYSTEM, briefMessage } from "./prompts"
import { TOOL_LIST } from "./tool-specs"
import { compactCheckpoint, compactLive, resumeTurns, toCheckpointTurns } from "./compact"
import { newCheckpoint, type LoopCheckpoint } from "./state"
import { createToolSet, renderPage, validateAll, type EventDraft } from "./tools-impl"
import { directionsFor, libraryKnowledge, librarySlop } from "./knowledge"
import { errorsOf } from "./validate"

export interface SliceOptions {
  /** This invocation's end (ms since epoch). No call starts later than deadline - budget.callReserveMs. */
  deadline: number
  /** At most this many model calls in this slice (the runner's iteration budget). */
  maxIterations?: number
  /**
   * The provider turns the previous slice of THIS invocation ended with (SliceResult.live), so a runner
   * that asks for one call at a time (L2's sliceStepper) keeps one live conversation inside a request:
   * the model sees its last tool results whole, not the digest a new request starts from.
   */
  live?: AgentTurn[]
}

export interface SliceResult {
  /** "running": not finished, save the checkpoint and chain another invocation. */
  status: AgentJobStatus
  phase: AgentPhase
  iteration: number
  checkpoint: LoopCheckpoint
  events: AgentEvent[]
  /** This slice. */
  usage: { usd: number; inputTokens: number; outputTokens: number; calls: number }
  /** The whole job so far. */
  totalUsd: number
  stopped?: BudgetStop
  /** For the creator, when the job ended. */
  summary?: string
  error?: string
  /** The live provider turns at the end of this slice, for `SliceOptions.live` of the next one in the same request. */
  live: AgentTurn[]
}

/** Most failed provider calls in a row before the job stops. */
const MAX_FAILURES = 3
/** Turns without a tool call before the loop takes it as "done". */
const MAX_NUDGES = 2
const OPUS_FALLBACK = "claude-opus-5-5"

/** The most a call could cost: its input as sent and every output token it may write. */
export function worstCaseUsd(model: string, inputChars: number, maxOutputTokens: number): number {
  const priced = rateFor(model) ? model : OPUS_FALLBACK
  return costOf(priced, { ...ZERO_USAGE, inputTokens: Math.ceil(inputChars / 3), outputTokens: maxOutputTokens }).usd
}

function capOf(job: AgentJobInput, deps: AgentDeps): number {
  return deps.models.ownKey ? job.budget.maxUsdOwnKey : job.budget.maxUsd
}

export async function runAgentSlice(job: AgentJobInput, saved: LoopCheckpoint | null, deps: AgentDeps, opts: SliceOptions): Promise<SliceResult> {
  const now = deps.now ?? Date.now
  const cp: LoopCheckpoint = saved ? { ...saved, turns: [...saved.turns], repairs: { ...saved.repairs }, known: { ...saved.known } } : newCheckpoint()
  const events: AgentEvent[] = []
  /* This slice's live provider turns; merged into the saved checkpoint by result(). */
  let turns: AgentTurn[] = []
  /* Turns before this index are already in the saved checkpoint (the resume turn, or what an earlier slice of this request saved). */
  let liveStart = 1
  const usage = { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0 }
  cp.seq = Math.max(cp.seq, job.lastEventSeq)

  const emit = (draft: EventDraft) => {
    const event = { ...draft, seq: ++cp.seq, at: new Date(now()).toISOString() } as AgentEvent
    events.push(event)
    try {
      void Promise.resolve(deps.emit?.(event)).catch(() => undefined)
    } catch {
      /* a progress write never stops the work */
    }
  }
  const setPhase = (phase: AgentPhase, label: string) => {
    if (cp.phase === phase) return
    cp.phase = phase
    emit({ kind: "phase", phase, label: label || phase })
  }

  /* ── the end of a job, whichever way it ends ───────────────────────── */
  /* The end event of a job finished from inside the finish tool: emitted after that tool's own event, so "finished" is always the last. */
  let pendingEnd: EventDraft | null = null
  const finished = (status: Exclude<AgentJobStatus, "queued" | "running">, summary: string, failing: string[] = [], stopped?: BudgetStop, error?: string, defer = false): SliceResult => {
    cp.final = { status, summary, failing }
    if (stopped) cp.stopped = stopped
    if (status === "complete") setPhase("finish", "Done")
    const end: EventDraft = { kind: "finished", status, ...(stopped ? { stopped } : {}) }
    if (defer) pendingEnd = end
    else emit(end)
    return result(status, summary, stopped, error)
  }
  const result = (status: AgentJobStatus, summary?: string, stopped?: BudgetStop, error?: string): SliceResult => ({
    status,
    phase: cp.phase,
    iteration: cp.iteration,
    checkpoint: compactCheckpoint(turns.length ? { ...cp, turns: [cp.turns[0], ...toCheckpointTurnsTail(cp, turns.slice(liveStart))] } : cp),
    events,
    usage,
    totalUsd: Math.round((job.spentUsd + usage.usd) * 1e6) / 1e6,
    ...(stopped ? { stopped } : {}),
    ...(summary ? { summary } : {}),
    ...(error ? { error } : {}),
    live: turns,
  })
  const madeSomething = () => cp.filesTouched.length > 0 || cp.pagesTouched.length > 0
  const stopFor = (why: BudgetStop): SliceResult => {
    const words: Record<BudgetStop, string> = { wall_clock: "ran out of time", iterations: "used all its steps", spend: "reached its spending cap", repairs: "could not fix every problem in the rounds it had", cancelled: "was cancelled" }
    const made = madeSomething() ? ` What it made is kept as a draft: ${[...cp.filesTouched, ...cp.pagesTouched.map((p) => `page ${p}`)].join(", ")}.` : " Nothing was changed."
    const status = why === "cancelled" ? "cancelled" : madeSomething() ? "partial" : "failed"
    return finished(status, `The AI ${words[why]}.${made}${cp.openTasks.length ? ` Not done: ${cp.openTasks.join("; ")}.` : ""}`, [], why)
  }

  if (cp.final) return result(cp.final.status, cp.final.summary, cp.stopped)

  /* ── brief: deterministic, once ─────────────────────────────────────── */
  if (cp.turns.length === 0) {
    emit({ kind: "phase", phase: "brief", label: "Reading your store" })
    const [caps, pages, files] = await Promise.all([deps.capabilities().catch(() => null), deps.store.listPages(), deps.store.listFiles()])
    cp.caps = caps
    const industry = job.options?.category?.replace(/_/g, " ")
    const search = deps.knowledge ?? libraryKnowledge({ industry, caps: () => caps })
    const knowledge = (await search({ query: job.prompt.slice(0, 500), industry, limit: 5 }).catch(() => [])) as KnowledgeHit[]
    const scoped = job.edit || job.redesign === "changes"
    const directions = scoped ? [] : directionsFor(industry ?? job.prompt.slice(0, 80), job.creatorId)
    cp.turns.push({ role: "user", text: briefMessage({ job, caps, pages, files, knowledge, directions }) })
    if (scoped) setPhase("build", "Making your change")
    else setPhase("plan", "Deciding the look")
  }

  /* ── the tool loop ──────────────────────────────────────────────────── */
  turns = opts.live?.length ? [...opts.live] : resumeTurns(cp)
  liveStart = turns.length
  const done: { r: SliceResult | null } = { r: null }
  let sliceCalls = 0

  const onFinish = async (input: AgentToolInputs["finish"]): Promise<AgentToolOutputs["finish"]> => {
    setPhase("verify", "Checking everything")
    const issues = await verify(job, deps, cp)
    const errors = errorsOf(issues)
    emit({ kind: "validation", errors: errors.length, warnings: issues.length - errors.length })
    if (!errors.length) {
      done.r = finished("complete", String(input.summary ?? "").slice(0, 1_000) || "The website is ready to review.", [], undefined, undefined, true)
      return { ok: true }
    }
    const failing = [...new Set(errors.map((e) => e.path ?? (e.sectionId ? `section ${e.sectionId}` : e.code)))]
    const repairable = errors.some((e) => !e.path || (cp.repairs[e.path] ?? 0) < job.budget.maxRepairsPerFile)
    if (cp.verifyCycles < job.budget.maxVerifyCycles && repairable) {
      cp.verifyCycles += 1
      setPhase("repair", `Fixing ${failing.length} thing${failing.length === 1 ? "" : "s"}`)
      return { ok: false, reason: `Not finished: ${errors.length} problem${errors.length === 1 ? "" : "s"} to fix first (round ${cp.verifyCycles} of ${job.budget.maxVerifyCycles}). Fix only these, then call finish again:\n${errors.slice(0, 20).map((e, i) => `${i + 1}. ${e.path ? `${e.path}: ` : e.sectionId ? `[${e.sectionId}] ` : ""}${e.message.slice(0, 600)}`).join("\n")}` }
    }
    const summary = `${String(input.summary ?? "").slice(0, 600)} Not everything passed its checks, so this is a partial website: ${failing.slice(0, 8).join(", ")} still ${failing.length === 1 ? "has a problem" : "have problems"} (${errors.slice(0, 3).map((e) => e.code).join(", ")}). Everything is a draft; nothing is live.`.trim()
    done.r = finished("partial", summary, failing, undefined, undefined, true)
    return { ok: false, reason: "The checks still fail and the repair rounds are used up. The job ends as partial and says so." }
  }

  const tools = createToolSet({ job, deps, cp, emit, onFinish, setPhase })

  while (!done.r) {
    if (await deps.cancelled?.().catch(() => false)) return stopFor("cancelled")
    const t = now()
    if (t - job.startedAt >= job.budget.maxWallMs) return stopFor("wall_clock")
    if (cp.iteration >= job.budget.maxIterations) return stopFor("iterations")
    if (t + job.budget.callReserveMs > opts.deadline || (opts.maxIterations !== undefined && sliceCalls >= opts.maxIterations)) {
      return result("running")
    }

    const role: ModelRole = cp.phase === "plan" ? deps.models.plan : deps.models.loop
    const maxOutputTokens = job.budget.maxOutputTokensPerCall
    const inputChars = AGENT_SYSTEM.length + JSON.stringify(TOOL_LIST).length + JSON.stringify(turns).length
    const spent = job.spentUsd + usage.usd
    if (spent >= capOf(job, deps) || spent + worstCaseUsd(role.model, inputChars, maxOutputTokens) > capOf(job, deps)) return stopFor("spend")

    let turn: ProviderTurn
    try {
      turn = await role.provider.complete({
        model: role.model,
        system: AGENT_SYSTEM,
        turns,
        tools: TOOL_LIST,
        maxOutputTokens,
        effort: role.effort,
        cacheKey: `ai-builder:${job.installId}`,
        signal: AbortSignal.timeout(Math.max(5_000, opts.deadline - t)),
      })
    } catch (thrown) {
      cp.failures += 1
      const message = thrown instanceof Error ? thrown.message.slice(0, 300) : "The model did not answer."
      emit({ kind: "error", message, retryable: cp.failures < MAX_FAILURES })
      if (cp.failures >= MAX_FAILURES) {
        return finished(madeSomething() ? "partial" : "failed", `The AI service failed ${MAX_FAILURES} times in a row (${message}).${madeSomething() ? " What was made is kept as a draft." : ""}`, [], undefined, message)
      }
      continue
    }
    cp.failures = 0
    cp.iteration += 1
    sliceCalls += 1
    const callUsd = costOf(rateFor(role.model) ? role.model : OPUS_FALLBACK, turn.usage).usd
    usage.usd = Math.round((usage.usd + callUsd) * 1e6) / 1e6
    usage.inputTokens += turn.usage.inputTokens
    usage.outputTokens += turn.usage.outputTokens
    usage.calls += 1
    cp.usd = Math.round((job.spentUsd + usage.usd) * 1e6) / 1e6
    cp.inputTokens += turn.usage.inputTokens
    cp.outputTokens += turn.usage.outputTokens
    emit({ kind: "spend", usd: callUsd, inputTokens: turn.usage.inputTokens, outputTokens: turn.usage.outputTokens, iteration: cp.iteration })

    turns.push({ role: "assistant", content: turn.text, toolCalls: turn.toolCalls, raw: turn.raw })

    if (turn.stop === "refusal") {
      return finished(madeSomething() ? "partial" : "failed", "The AI declined this request.", [], undefined, "refusal")
    }

    if (!turn.toolCalls.length) {
      cp.nudges += 1
      if (cp.nudges > MAX_NUDGES) {
        await onFinish({ summary: turn.text || "Finished." })
        if (done.r) break
        turns.push({ role: "user", content: "Fix the problems listed above, then call finish." })
        continue
      }
      turns.push({ role: "user", content: turn.stop === "length" ? "Your answer was cut off. Use the tools in smaller steps: one file per write_file." : "Carry on with the tools. When the website is done, call finish." })
      continue
    }
    cp.nudges = 0

    const results: ToolResult[] = []
    for (const call of turn.toolCalls) {
      if (done.r) {
        results.push({ id: call.id, output: JSON.stringify({ ok: false, reason: "The job already finished." }) })
        continue
      }
      if (await deps.cancelled?.().catch(() => false)) {
        results.push({ id: call.id, output: JSON.stringify({ ok: false, reason: "Cancelled." }) })
        turns.push({ role: "tool", results })
        return stopFor("cancelled")
      }
      results.push({ id: call.id, output: await runTool(tools, call.name, call.argumentsJson, emit, now) })
    }
    turns.push({ role: "tool", results })
    turns = compactLive(turns)
  }

  if (pendingEnd) emit(pendingEnd)
  /* Built again so the checkpoint holds the last tool results too. */
  const end = done.r as SliceResult | null
  const final = cp.final as LoopCheckpoint["final"]
  return end && final ? result(final.status, final.summary, cp.stopped, end.error) : result("running")
}

/** The saved turns after the brief: what the checkpoint had before this slice, then this slice's live turns. */
function toCheckpointTurnsTail(cp: LoopCheckpoint, fresh: AgentTurn[]): LoopCheckpoint["turns"] {
  const before = cp.turns.slice(1)
  /* The first live turn is the brief (or the resume digest), which the checkpoint already holds as turns[0] + before. */
  return [...before, ...toCheckpointTurns(fresh)].slice(-400)
}

/** One tool call: arguments parsed, the tool run, its result as the JSON text the model reads. Errors are results. */
export async function runTool(tools: ToolSet, name: string, argumentsJson: string, emit: (e: EventDraft) => void, now: () => number = Date.now): Promise<string> {
  const started = now()
  if (!(AGENT_TOOL_NAMES as readonly string[]).includes(name)) return JSON.stringify({ ok: false, error: `There is no tool "${name}".` })
  let args: Record<string, unknown>
  try {
    args = argumentsJson.trim() ? (JSON.parse(argumentsJson) as Record<string, unknown>) : {}
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("not an object")
  } catch {
    emit({ kind: "tool", tool: name as AgentToolName, summary: "arguments were not JSON", ok: false, ms: 0 })
    return JSON.stringify({ ok: false, error: "The arguments were not a JSON object. Send them again." })
  }
  let output: unknown
  try {
    output = await (tools[name as AgentToolName] as (input: unknown) => Promise<unknown>)(args)
  } catch (thrown) {
    output = { ok: false, error: `The tool failed: ${(thrown instanceof Error ? thrown.message : String(thrown)).slice(0, 300)}` }
  }
  const ok = !(output && typeof output === "object" && "ok" in output && (output as { ok: unknown }).ok === false)
  emit({ kind: "tool", tool: name as AgentToolName, summary: summarise(name, args, output), ok, ms: Math.max(0, now() - started) })
  const text = JSON.stringify(output)
  return text.length > 80_000 ? `${text.slice(0, 80_000)}…` : text
}

/** A short line for the progress view: never a file body. */
function summarise(name: string, args: Record<string, unknown>, output: unknown): string {
  const o = (output ?? {}) as { ok?: boolean; issues?: ValidationIssue[]; reason?: string }
  const target = typeof args.path === "string" ? args.path : typeof args.page === "string" ? `page ${args.page}` : typeof args.key === "string" ? `page ${args.key}` : typeof args.query === "string" ? `"${args.query.slice(0, 60)}"` : typeof args.label === "string" ? args.label.slice(0, 80) : ""
  const errors = Array.isArray(o.issues) ? o.issues.filter((i) => i.severity === "error").length : 0
  /* A refused concept says so in words, never as an ok line (round M). */
  if (name === "report_progress" && o.ok === false) {
    const concept = Array.isArray(o.issues) && o.issues.some((i) => i.code === "plan.concept_invalid")
    return (concept ? `The visual concept needs another pass (${errors} thing${errors === 1 ? "" : "s"} to fix)` : "The visual concept comes first: nothing else can start without it").slice(0, 200)
  }
  return `${name.replace(/_/g, " ")}${target ? ` ${target}` : ""}${o.ok === false ? (errors ? `: ${errors} error${errors === 1 ? "" : "s"}` : o.reason ? `: ${String(o.reason).slice(0, 60)}` : ": refused") : ""}`.slice(0, 200)
}

/**
 * VERIFY: every file the job touched and the site (validateAll), every page
 * it touched drawn (render check + the editor's runtime errors), and the
 * anti slop review of its files. Slop errors are the "high" findings: they
 * block finish like a compile error does.
 */
export async function verify(job: AgentJobInput, deps: AgentDeps, cp: LoopCheckpoint): Promise<ValidationIssue[]> {
  const ctx = { job, deps, cp }
  const issues = await validateAll(ctx)
  const stored = await deps.store.listPages()
  /* An edit, and a redesign that makes only the changes asked (round M), answer for what they touched; the rest of the site is the person's. */
  const scoped = job.edit || job.redesign === "changes"
  const pages = scoped ? cp.pagesTouched : stored.map((p) => p.key)
  /* A new website's page that shows nothing of its own is not finished. The theme's template pages (product, search...) are not the agent's to fill. */
  if (!scoped) for (const p of stored) if ((p.key === "home" || cp.pagesTouched.includes(p.key)) && !p.sections.some((s) => !s.hidden && !s.group && s.type !== "header" && s.type !== "footer")) issues.push({ severity: "error", code: "page.empty", message: `The page ${p.key} has no sections of its own. Place components on it with set_page_sections.` })
  for (const page of pages) issues.push(...(await renderPage(ctx, page)).issues.map((i) => ({ ...i, message: `${page}: ${i.message}` })))
  const files = (await deps.store.listFiles()).filter((f) => cp.filesTouched.includes(f.path)).map((f) => ({ path: f.path, text: f.text }))
  if (files.length) issues.push(...(await (deps.slop ?? librarySlop)({ files, concept: cp.concept ?? null, capabilities: cp.caps ?? null }).catch(() => [])))
  if (!scoped && !cp.concept) issues.push({ severity: "error", code: "plan.concept_missing", message: "There is no visual concept. Hand it in with report_progress phase plan." })
  /* A redesign may be done with the site's own sections and tokens: writing a component is not required of it. */
  if (!job.edit && !job.redesign && !cp.filesTouched.some((p) => p.startsWith("sections/ai_"))) issues.push({ severity: "error", code: "build.nothing", message: "No component was written. A new website is made of components you write." })
  return issues
}
