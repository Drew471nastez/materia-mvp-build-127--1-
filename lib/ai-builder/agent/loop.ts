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
import { addUnique, newCheckpoint, type CriticState, type LoopCheckpoint } from "./state"
import { describeConcept } from "./concept"
import { belowTarget, defectLine, type CriticReport, type Defect } from "../visual-critic/types"
import { createToolSet, renderPage, validateAll, type EventDraft } from "./tools-impl"
import { directionsFor, libraryKnowledge, libraryReferences, librarySlop } from "./knowledge"
import { referencesForPrompt } from "@/lib/storelib-ai/references/prompt"
import type { AgentImage } from "@/lib/sites/agent/attachments"
import { contractBlock, planDirection } from "./direction"
import type { DesignReference } from "@/lib/storelib-ai/references"
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import type { DirectionChoice } from "@/lib/storelib-ai/direction/choose"
import { errorsOf } from "./validate"
import { completenessIssues } from "./site-plan"
import { MAX_REFERENCES, jobDesignBrief } from "./design-brief"
import { surfaceRules } from "@/lib/storelib-ai/surfaces"
import { noveltyIssues, siteFingerprint } from "../novelty"
import { themeSettingsToTokens } from "../tokens"
import { roleFor } from "./model-routing"
import { blockIssues, imageSlotIssues } from "./content-check"
import { fewShotExamples, templateBlock, templateIssues, templateSlotSkip, templatesOf } from "./templates"
import { imageBriefNote, makingWords } from "@/lib/storelib-ai/images/prompt"
import { DEFAULT_MAX_IMAGES } from "./tools-impl"

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
/**
 * THE DESIGN REVIEW'S BOUNDS (round O, O4). At most this many reviews per job (each draws, measures and looks);
 * a review that finds hard gates or high defects sends the agent back once more, and the next is the last word.
 */
export const MAX_CRITIC_ROUNDS = 2
/** A review needs at least this much of the invocation left (the browser and the vision call); less, and it waits for the next invocation once. */
export const CRITIC_MIN_MS = 45_000
/** And never more than this. */
export const CRITIC_MAX_MS = 150_000

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
    /*
      Round O (O1 + O2 + O6): creative direction before generation. The visual references for this brief are
      chosen once (deterministic, O1: built in records and the admin's screenshots) and kept by id; those with a
      picture are LOOKED AT in the plan phase (withReferenceImages below). A new website (or a full redesign) gets
      a CreativeBrief and an art direction fitted to the business, chosen with those references (O2), kept in the
      checkpoint so the concept is checked against the direction the model was shown; O6's jobDesignBrief puts it
      in the first turn. An edit gets the site's DESIGN.md with the creator's overrides and the keep-the-brand rule.
    */
    let directions: ReturnType<typeof directionsFor> = scoped ? [] : directionsFor(industry ?? job.prompt.slice(0, 80), job.creatorId)
    let direction: { brief: CreativeBrief; choice: DirectionChoice } | undefined
    const referenceSource = deps.references ?? libraryReferences
    const refs: DesignReference[] = scoped ? [] : [...(await referenceSource.search({ query: job.prompt.slice(0, 1_000), industry, limit: 4 }).catch(() => []))]
    const pictured = refs.filter((r) => r.image).map((r) => r.id).slice(0, 4)
    const shown = pictured.length ? await referenceSource.images(pictured).catch(() => []) : []
    cp.references = refs.map((r) => r.id)
    cp.referenceImages = shown.map((x) => x.id)
    if (!scoped) {
      try {
        const hints = refs.map((r) => ({ id: r.id, styles: r.styleTags, industries: r.industries }))
        const plan = planDirection(job, caps, hints)
        cp.brief = plan.brief
        cp.direction = { primary: plan.choice.primary.id, secondary: plan.choice.secondary?.id ?? null, typeSystem: plan.choice.typeSystem.id, seed: plan.choice.seed, ...(hints.length ? { refs: hints } : {}) }
        directions = plan.seeds
        direction = { brief: plan.brief, choice: plan.choice }
      } catch {
        /* the library's seeds stay; the brief is made in jobDesignBrief */
      }
    }
    const contract = scoped ? await contractBlock(deps.store) : ""
    const design = await jobDesignBrief({ job, caps, files, references: { list: refs, withImages: cp.referenceImages }, ...(direction ? { direction } : {}), ...(contract ? { contract } : {}) }).catch(() => null)
    /*
      TEMPLATE FIRST (round P, P5, ./templates.ts): a NEW website starts from the closest starting template
      (P2's chooseTemplate + applyTemplate, with the brief and direction just chosen), then the agent adapts it.
      Its files count as this job's (validated, anti-slopped, reviewed); finish refuses while its copy (and,
      when pictures can be made, its imagery) is still as shipped. No template, or one that fails to apply:
      the agent builds from zero as before, and says nothing it did not do.
    */
    let templateText = ""
    let pagesNow = pages
    let filesNow = files
    if (!job.edit && !job.redesign && cp.brief) {
      const lib = templatesOf(deps)
      const brief = cp.brief
      const choice = direction?.choice ?? null
      const chosen = await Promise.resolve(lib.choose(brief, choice)).catch(() => null)
      if (chosen) {
        const applied = await lib.apply(deps.store, chosen, brief, { jobId: job.jobId, choice }).catch(() => ({ ok: false, files: [] as string[], pages: [] as string[] }))
        if (applied.ok) {
          cp.template = { id: chosen.id, name: chosen.name, files: applied.files, pages: applied.pages }
          for (const path of applied.files) cp.filesTouched = addUnique(cp.filesTouched, path)
          for (const key of applied.pages) cp.pagesTouched = addUnique(cp.pagesTouched, key)
          ;[pagesNow, filesNow] = await Promise.all([deps.store.listPages(), deps.store.listFiles()])
          templateText = templateBlock(chosen, applied, fewShotExamples(chosen))
          emit({ kind: "note", text: `Starting from the ${chosen.name} template, to be made your own.` })
        }
      }
    }
        /* Round P (P1): which picture service this environment has, plainly; none means a text-forward design, never a grey box. */
    const pictures = await (deps.images?.available() ?? Promise.resolve({ generate: null, stock: false })).catch(() => ({ generate: null, stock: false }))
    const picturesNote = imageBriefNote({ ...pictures, maxImages: deps.images?.maxImages ?? job.budget.maxImages ?? DEFAULT_MAX_IMAGES })
    cp.turns.push({ role: "user", text: briefMessage({ job, caps, pages: pagesNow, files: filesNow, knowledge, directions, design, pictures: picturesNote, ...(templateText ? { template: templateText } : {}) }) })
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
      /* Round O (O4): every check passes; now the agent LOOKS at what it made (the visual critic) before it may finish. */
      const look = await designReview()
      if (look.block) return { ok: false, reason: look.block }
      const said = String(input.summary ?? "").slice(0, 1_000) || "The website is ready to review."
      if (look.partial) {
        done.r = finished("partial", `${said} ${look.partial}`.trim(), look.failing ?? [], undefined, undefined, true)
        return { ok: false, reason: "The design review still finds problems that must be fixed, and its rounds are used up. The job ends as partial and says so." }
      }
      done.r = finished("complete", `${said}${criticNote(cp.critic)}`, [], undefined, undefined, true)
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

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE DESIGN REVIEW (round O, O4): THE AGENT SEES ITS DRAFT
    ═══════════════════════════════════════════════════════════════════════
    Spec 8.3. After every other check passes, the pages the job made are drawn in a headless browser with
    JavaScript OFF (lib/ai-builder/visual-critic), measured, and looked at by a vision model. What comes back:

      hard gates   sideways scrolling at 390, a dead call to action in the first screen, unreadable text:
                   they block finish like a compile error; still failing after the last round, the job is partial
      defects      specific (page, section, selector, what, why, fix): ONE targeted repair pass when the
                   scores are under target or a defect is high or critical
      the rest     said honestly in the finish summary

    Bounded: MAX_CRITIC_ROUNDS reviews per job, each inside the job's spending cap (its worst case is checked
    before the vision call) and the invocation's time. No browser: "not visually checked", never a pass.
  */
  const designReview = async (): Promise<{ block?: string; partial?: string; failing?: string[] }> => {
    if (!deps.visualCritic) return {}
    const st: CriticState = cp.critic ? { ...cp.critic, gates: [...cp.critic.gates], open: [...cp.critic.open] } : { rounds: 0, targeted: false, gates: [], open: [] }
    cp.critic = st
    if (st.rounds >= MAX_CRITIC_ROUNDS) return {}
    const stored = await deps.store.listPages()
    const pages = pagesToReview(job, cp, stored)
    if (!pages.length) return {}
    /* No browser here at all: said once, plainly, and the job goes on (no review step is announced for a review that cannot happen). */
    const can = deps.visualCritic.available?.() ?? { ok: true as const }
    if (can.ok === false) {
      st.rounds = MAX_CRITIC_ROUNDS
      st.status = "unverified"
      st.reason = (can as { reason: string }).reason
      emit({ kind: "note", text: `Not visually checked: ${st.reason}.` })
      return {}
    }
    const left = opts.deadline - now() - 5_000
    if (left < CRITIC_MIN_MS) {
      if (!st.deferred) {
        st.deferred = true
        return { block: "Everything passes its checks. The design review (the pages drawn in a browser and looked at) needs a fresh moment: call finish again now with the same summary, changing nothing." }
      }
      st.rounds = MAX_CRITIC_ROUNDS
      st.status = "unverified"
      st.reason = "there was no time left to draw the pages"
      emit({ kind: "note", text: "Not visually checked: there was no time left to draw the pages." })
      return {}
    }
    cp.phase = "verify"
    emit({ kind: "phase", phase: "verify", label: "Reviewing the design" })
    const files = await deps.store.listFiles()
    const sources: Record<string, string> = {}
    for (const f of files) if (f.text.trim()) sources[f.path] = f.text
    /* Round O (O6): the critic holds the pages to the same design rules the agent was given (compact set), then the site's own DESIGN.md. */
    const contract = files.find((f) => /(^|\/)DESIGN\.md$/i.test(f.path))?.text
    const rules = [surfaceRules("other"), contract ? `THE SITE'S DESIGN.md:\n${contract}` : ""].filter(Boolean).join("\n\n")
    let report: CriticReport
    try {
      report = await deps.visualCritic({
        brief: job.prompt,
        ...(cp.concept ? { concept: safeConcept(cp.concept) } : {}),
        ...(rules ? { rules } : {}),
        pages,
        project: { pages: stored, settings: await deps.store.readSettings(), sources, capabilities: cp.caps ?? null },
        picturesAvailable: await picturesAvailable(deps),
        maxUsd: Math.max(0, capOf(job, deps) - (job.spentUsd + usage.usd)),
        timeoutMs: Math.min(CRITIC_MAX_MS, left),
      })
    } catch (thrown) {
      report = { status: "unverified", reason: `the design review failed (${thrown instanceof Error ? thrown.message.slice(0, 120) : "no answer"})`, pages, defects: [], shots: [], usage: { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0 }, ms: 0 }
    }
    /* The review's spend is the job's spend. */
    if (report.usage.calls > 0 || report.usage.usd > 0) {
      usage.usd = Math.round((usage.usd + report.usage.usd) * 1e6) / 1e6
      usage.inputTokens += report.usage.inputTokens
      usage.outputTokens += report.usage.outputTokens
      usage.calls += report.usage.calls
      cp.usd = Math.round((job.spentUsd + usage.usd) * 1e6) / 1e6
      cp.inputTokens += report.usage.inputTokens
      cp.outputTokens += report.usage.outputTokens
      emit({ kind: "spend", usd: report.usage.usd, inputTokens: report.usage.inputTokens, outputTokens: report.usage.outputTokens, iteration: cp.iteration })
    }
    st.rounds += 1
    st.status = report.status
    st.reason = report.reason
    if (report.scores) {
      st.scores = report.scores
      st.weighted = report.weighted
    }
    if (report.status === "unverified") {
      /* Nothing was seen, so nothing passed or failed: said, and the job goes on. No second try. */
      st.rounds = MAX_CRITIC_ROUNDS
      st.gates = []
      st.open = []
      emit({ kind: "note", text: `Not visually checked: ${report.reason ?? "no browser was available"}.` })
      return {}
    }
    const gates = report.defects.filter((d) => d.gate)
    const serious = report.defects.filter((d) => !d.gate && (d.severity === "critical" || d.severity === "high"))
    const worth = report.defects.filter((d) => !d.gate && d.severity !== "low")
    st.gates = gates.map(defectLine).slice(0, 8)
    st.open = report.defects.filter((d) => d.severity !== "low").map((d) => plainDefect(d)).slice(0, 6)
    emit({ kind: "note", text: reviewWords(report, gates.length), ...(report.shotKept ? { shot: true } : {}) })

    const last = st.rounds >= MAX_CRITIC_ROUNDS
    if (gates.length && !last) {
      setPhase("repair", `Fixing ${gates.length} design problem${gates.length === 1 ? "" : "s"}`)
      return { block: repairList(st.rounds, gates, serious) }
    }
    if (gates.length && last) {
      const failing = [...new Set(gates.map((d) => (d.sectionType ? `sections/${d.sectionType}.storelib` : `page ${d.page}`)))]
      return { partial: `The design review still finds ${gates.length} problem${gates.length === 1 ? "" : "s"} that must be fixed: ${gates.slice(0, 3).map(plainDefect).join("; ")}. Everything is a draft; nothing is live.`, failing }
    }
    if (!last && !st.targeted && (belowTarget(report.scores) || serious.length > 0) && worth.length > 0) {
      st.targeted = true
      setPhase("repair", "Improving the design")
      return { block: repairList(st.rounds, [], worth.slice(0, 10), report) }
    }
    return {}
  }

  /* Round P (P1): a picture's cost is the job's spend, like a model call's, and is reported the same way. */
  const spend = (usd: number) => {
    if (!(usd > 0)) return
    usage.usd = Math.round((usage.usd + usd) * 1e6) / 1e6
    cp.usd = Math.round((job.spentUsd + usage.usd) * 1e6) / 1e6
    emit({ kind: "spend", usd, inputTokens: 0, outputTokens: 0, iteration: cp.iteration })
  }
  const spendLeft = () => Math.max(0, capOf(job, deps) - (job.spentUsd + usage.usd))
  const tools = createToolSet({ job, deps, cp, emit, onFinish, setPhase, spend, spendLeft })

  /*
    The reference pictures, on the first turn, while the look is being decided (plan). Loaded once per slice,
    never stored in the checkpoint; all of them or none, so "image 2" in the text is always the second picture.
  */
  let refImages: AgentImage[] | null = null
  const withReferenceImages = async (list: AgentTurn[]): Promise<AgentTurn[]> => {
    const ids = cp.referenceImages ?? []
    if (cp.phase !== "plan" || !ids.length || list[0]?.role !== "user") return list
    if (refImages === null) {
      const got = await (deps.references ?? libraryReferences).images(ids).catch(() => [])
      refImages = got.length === ids.length && got.every((g, i) => g.id === ids[i]) ? got.map((g) => g.image) : []
    }
    if (!refImages.length) return list
    const first = list[0]
    return [{ ...first, images: [...refImages, ...(first.images ?? [])] }, ...list.slice(1)]
  }

  while (!done.r) {
    if (await deps.cancelled?.().catch(() => false)) return stopFor("cancelled")
    const t = now()
    if (t - job.startedAt >= job.budget.maxWallMs) return stopFor("wall_clock")
    if (cp.iteration >= job.budget.maxIterations) return stopFor("iterations")
    if (t + job.budget.callReserveMs > opts.deadline || (opts.maxIterations !== undefined && sliceCalls >= opts.maxIterations)) {
      return result("running")
    }

    /* Round P (P5): by phase. Plan on the strong model, the build (the components) on the strong model at effort high, fixes on the loop model (./model-routing.ts). */
    const role: ModelRole = roleFor(cp.phase, deps.models)
    const maxOutputTokens = job.budget.maxOutputTokensPerCall
    const callTurns = await withReferenceImages(turns)
    /* A picture is billed by its pixels, about 1,600 tokens at the size references are kept: counted as 6,400 characters. */
    const imageChars = callTurns === turns ? 0 : (callTurns[0].role === "user" ? (callTurns[0].images?.length ?? 0) : 0) * 6_400
    const inputChars = AGENT_SYSTEM.length + JSON.stringify(TOOL_LIST).length + JSON.stringify(turns).length + imageChars
    const spent = job.spentUsd + usage.usd
    if (spent >= capOf(job, deps) || spent + worstCaseUsd(role.model, inputChars, maxOutputTokens) > capOf(job, deps)) return stopFor("spend")

    let turn: ProviderTurn
    try {
      turn = await role.provider.complete({
        model: role.model,
        system: AGENT_SYSTEM,
        turns: callTurns,
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
        const said = await onFinish({ summary: turn.text || "Finished." })
        if (done.r) break
        /* The list itself (verify's errors or the design review's defects): "listed above" listed nothing before. */
        turns.push({ role: "user", content: said.ok === false && said.reason ? `${said.reason}` : "Fix the problems listed above, then call finish." })
        continue
      }
      turns.push({ role: "user", content: turn.stop === "length" ? "Your answer was cut off. Use the tools in smaller steps: one file per write_file." : "Carry on with the tools. When the website is done, call finish." })
      continue
    }
    cp.nudges = 0

    const results: ToolResult[] = []
    /*
      Round P (P1): pictures asked for in the same turn are made side by side, three at a time: a run of
      consecutive generate_image / find_photo calls is answered together, results in the order asked.
    */
    const pictureRuns = new Map<number, () => Promise<string[]>>()
    for (let i = 0; i < turn.toolCalls.length; i++) {
      if (!PICTURE_TOOLS.has(turn.toolCalls[i].name) || (i > 0 && PICTURE_TOOLS.has(turn.toolCalls[i - 1].name))) continue
      let j = i
      while (j < turn.toolCalls.length && PICTURE_TOOLS.has(turn.toolCalls[j].name)) j++
      const run = turn.toolCalls.slice(i, j)
      if (run.length > 1) pictureRuns.set(i, () => inPool(run.map((call) => () => runTool(tools, call.name, call.argumentsJson, emit, now)), PICTURE_CONCURRENCY))
    }
    const settled = new Map<number, string>()
    for (const [index, call] of turn.toolCalls.entries()) {
      if (done.r) {
        results.push({ id: call.id, output: JSON.stringify({ ok: false, reason: "The job already finished." }) })
        continue
      }
      if (await deps.cancelled?.().catch(() => false)) {
        results.push({ id: call.id, output: JSON.stringify({ ok: false, reason: "Cancelled." }) })
        turns.push({ role: "tool", results })
        return stopFor("cancelled")
      }
      const run = pictureRuns.get(index)
      if (run) (await run()).forEach((output, k) => settled.set(index + k, output))
      const ready = settled.get(index)
      results.push({ id: call.id, output: ready ?? (await runTool(tools, call.name, call.argumentsJson, emit, now)) })
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

/* ── the design review's words (round O, O4) ─────────────────────────── */

/** Which pages the review looks at: home first on a new site, then the pages the job made or whose components it wrote. */
export function pagesToReview(job: AgentJobInput, cp: LoopCheckpoint, stored: { key: string; sections: { type: string; hidden?: boolean }[] }[]): string[] {
  const scoped = !!job.edit || job.redesign === "changes"
  const types = new Set(cp.filesTouched.map((p) => /^sections\/(.+)\.storelib$/.exec(p)?.[1]).filter((t): t is string => !!t))
  const has = (key: string) => stored.some((p) => p.key === key && p.sections.some((s) => !s.hidden))
  const order: string[] = []
  const add = (key: string) => {
    if (!order.includes(key) && has(key)) order.push(key)
  }
  if (!scoped) add("home")
  for (const key of cp.pagesTouched) add(key)
  for (const p of stored) if (p.sections.some((s) => types.has(s.type))) add(p.key)
  return order
}

function safeConcept(concept: unknown): string {
  try {
    return describeConcept(concept as Parameters<typeof describeConcept>[0])
  } catch {
    return JSON.stringify(concept).slice(0, 2_000)
  }
}

/** One defect in the creator's words: where and what. */
function plainDefect(d: Defect): string {
  return `${d.page}${d.sectionType ? ` (${d.sectionType.replace(/^ai_/, "").replace(/_/g, " ")})` : ""}: ${d.what.replace(/\.$/, "")}`.slice(0, 220)
}

/** The progress panel's line after a review. Plain, short. */
function reviewWords(r: CriticReport, gates: number): string {
  const n = r.defects.filter((d) => d.severity !== "low").length
  const looked = r.status === "reviewed" ? `Looked at ${r.pages.length === 1 ? "the page" : `${r.pages.length} pages`} on desktop and phone` : `Checked ${r.pages.length === 1 ? "the page" : `${r.pages.length} pages`} in a browser on desktop and phone`
  const found = n === 0 ? "nothing to fix" : `${n} thing${n === 1 ? "" : "s"} to improve${gates ? `, ${gates} must be fixed` : ""}`
  return `${looked}: ${found}.${r.status === "measured" && r.reason ? ` No review by eye: ${r.reason}.` : ""}`.slice(0, 300)
}

/** What the finish tool tells the agent to fix: specific, numbered, and bounded. */
function repairList(round: number, gates: Defect[], others: Defect[], report?: CriticReport): string {
  const lines = [...gates, ...others].slice(0, 14).map((d, i) => `${i + 1}. ${defectLine(d)}${d.sectionType ? ` (file sections/${d.sectionType}.storelib)` : ""}`)
  const scores = report?.scores ? ` Scores (1 to 5): ${Object.entries(report.scores).map(([k, v]) => `${k} ${v}`).join(", ")}${report.verdict ? `. Verdict: ${report.verdict}` : ""}.` : ""
  const head = gates.length
    ? `Not finished: the design review drew the pages in a browser (1440 and 390 wide, scripts off) and found ${gates.length} problem${gates.length === 1 ? "" : "s"} that must be fixed (review ${round} of ${MAX_CRITIC_ROUNDS}).`
    : `Not finished: the design review drew the pages in a browser (1440 and 390 wide, scripts off) and looked at them (review ${round} of ${MAX_CRITIC_ROUNDS}).${scores} Make one targeted pass on these.`
  return `${head} Fix only these, with edit_file on the named component or its page's settings (no rewrites of what works), then call finish again:\n${lines.join("\n")}`
}

/** What the finish summary says about the review, honestly. */
export function criticNote(st: CriticState | undefined): string {
  if (!st || !st.status) return ""
  if (st.status === "unverified") return ` Not visually checked: ${st.reason ?? "no browser was available"}.`
  const open = st.open.length ? ` Still worth a look: ${st.open.slice(0, 3).join("; ")}.` : ""
  if (st.status === "measured") return ` Checked in a browser on desktop and phone; not reviewed by eye (${st.reason ?? "no vision model"}).${open}`
  return ` Design review: ${st.weighted ?? "?"} of 5.${open}`
}

/** The saved turns after the brief: what the checkpoint had before this slice, then this slice's live turns. */
function toCheckpointTurnsTail(cp: LoopCheckpoint, fresh: AgentTurn[]): LoopCheckpoint["turns"] {
  const before = cp.turns.slice(1)
  /* The first live turn is the brief (or the resume digest), which the checkpoint already holds as turns[0] + before. */
  return [...before, ...toCheckpointTurns(fresh)].slice(-400)
}

/** Round P (P1): the picture tools, run side by side within a turn, at most this many at once. */
const PICTURE_TOOLS = new Set<string>(["generate_image", "find_photo"])
export const PICTURE_CONCURRENCY = 3

/** Runs the tasks with at most `limit` at once; the results in the tasks' order. */
export async function inPool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      out[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), tasks.length) }, worker))
  return out
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
    const has = (code: string) => Array.isArray(o.issues) && o.issues.some((i) => i.code === code)
    if (has("plan.concept_invalid")) return `The visual concept needs another pass (${errors} thing${errors === 1 ? "" : "s"} to fix)`.slice(0, 200)
    /* Round N (N3): the site plan, every page and template. */
    if (has("plan.site_invalid")) return `The site plan needs another pass (${errors} thing${errors === 1 ? "" : "s"} to fix)`.slice(0, 200)
    if (has("plan.site_missing")) return "The site plan comes next: every page and template with its sections"
    return "The visual concept comes first: nothing else can start without it"
  }
  /* Round P (P1): pictures in plain words, never the prompt: "Made the hero photo". */
  if (name === "generate_image" || name === "find_photo") {
    const purpose = typeof args.purpose === "string" ? args.purpose : name === "find_photo" ? "stock" : undefined
    return o.ok === false ? `${makingWords(purpose).replace(/^Making/, "Could not make")}: ${String(o.reason ?? "refused").replace(/\.$/, "").slice(0, 120)}`.slice(0, 200) : makingWords(purpose, true)
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
  /* The pages as drawn (not in the editor) go to the anti slop check too: what a visitor reads is what counts (round O). */
  const rendered: { page: string; html: string; css: string }[] = []
  for (const page of pages) {
    const r = await renderPage(ctx, page)
    /* Round P (P5): on a new website or a full redesign a visibly empty section, or an empty picture frame drawn to visitors, blocks finish. */
    issues.push(...r.issues.map((i) => ({ ...i, ...(!scoped && (i.code === "render.empty" || i.code === "render.empty_media") ? { severity: "error" as const } : {}), message: `${page}: ${i.message}` })))
    if (r.drawn && rendered.length < 12) rendered.push({ page, html: r.drawn.html.slice(0, 400_000), css: r.drawn.css.slice(0, 200_000) })
  }
  const allFiles = await deps.store.listFiles()
  const files = allFiles.filter((f) => cp.filesTouched.includes(f.path)).map((f) => ({ path: f.path, text: f.text }))
  /*
    THE ANTI SLOP GATE (round O, lib/ai-builder/slop.ts): the files this job wrote, the pages as drawn, the creator's own
    words (only they can ask for the editorial serif or purple look) and, for a new site or a full redesign, the tokens a
    visitor sees and home's order. P0 findings are errors; past the warning budget, one more error. An edit answers for
    what it touched only, so the site's own tokens and order (the person's) are not held against it.
  */
  const settings = scoped ? undefined : await deps.store.readSettings()
  const home = stored.find((p) => p.key === "home")
  if (files.length) {
    issues.push(
      ...(await (deps.slop ?? librarySlop)({
        files,
        concept: cp.concept ?? null,
        capabilities: cp.caps ?? null,
        brief: job.prompt,
        ...(settings ? { settings } : {}),
        rendered: scoped ? rendered.filter((r) => cp.pagesTouched.includes(r.page)) : rendered,
        ...(!scoped && home ? { sections: home.sections.filter((s) => !s.hidden && !s.group).map((s) => ({ type: s.type })) } : {}),
      }).catch(() => [])),
    )
  }
  /*
    DIVERSITY (spec 8.4): a new site's fingerprint, kept on the checkpoint for later jobs, compared with the platform's
    recent agent-built sites. A soft penalty: a warning to the agent, never an error, never at the cost of the business fit.
  */
  if (!job.edit && job.redesign !== "changes" && home) {
    const src: Record<string, string> = {}
    for (const f of allFiles) if (f.path.startsWith("sections/") && f.text.trim()) src[f.path] = f.text
    const tokens = themeSettingsToTokens(settings ?? (await deps.store.readSettings()))
    cp.fingerprint = siteFingerprint({ home: home.sections.filter((s) => !s.hidden && !s.group), sources: src, tokens, concept: cp.concept ?? null })
    const recent = await (deps.recentFingerprints?.().catch(() => []) ?? Promise.resolve([]))
    issues.push(...noveltyIssues(cp.fingerprint, recent))
  }
  if (!scoped && !cp.concept) issues.push({ severity: "error", code: "plan.concept_missing", message: "There is no visual concept. Hand it in with report_progress phase plan." })
  /*
    THE WHOLE SITE (round N, N3): a new website is every page and template, not a home page and a page or two:
    ten of its own sections on home, six on every other page (or the plan's reason), the product and collection
    templates designed, its own header and footer in free mode, every page reachable from them. Finish lists
    exactly what is missing; the repair rounds above still bound it, and running out ends the job partial.
  */
  if (!job.edit && !job.redesign) {
    const src: Record<string, string> = {}
    for (const f of await deps.store.listFiles()) if (f.text.trim()) src[f.path] = f.text
    issues.push(...completenessIssues({ pages: stored, sources: src, settings: await deps.store.readSettings(), caps: cp.caps ?? null, mode: job.mode, plan: cp.sitePlan ?? null }))
  }
  /*
    COMPLETE SECTIONS AND PICTURES (round P, P5, ./content-check.ts). Every placed ai_ section holds enough real
    items of each type it declares; every picture slot holds a picture when the job can make or find one (else
    the section must read text-forward, and a drawn empty frame is refused below); a starting template is never
    shipped as it came. An edit or a change-only redesign answers for the sections whose files it wrote, on the
    pages it touched.
  */
  {
    const src: Record<string, string> = {}
    for (const f of allFiles) if (f.text.trim()) src[f.path] = f.text
    const touchedTypes = new Set(cp.filesTouched.map((p) => /^sections\/(.+)\.storelib$/.exec(p)?.[1]).filter((t): t is string => !!t))
    const placed = scoped ? stored.filter((p) => cp.pagesTouched.includes(p.key)).map((p) => ({ ...p, sections: p.sections.filter((s) => touchedTypes.has(s.type)) })) : stored
    const pictures = await picturesAvailable(deps)
    const lib = templatesOf(deps)
    const template = cp.template ? lib.byId(cp.template.id) : null
    issues.push(...blockIssues({ pages: placed, sources: src, caps: cp.caps ?? null }))
    issues.push(...imageSlotIssues({ pages: placed, sources: src, picturesAvailable: pictures, ...(template ? { skip: templateSlotSkip(template) } : {}) }))
    if (template) issues.push(...templateIssues(template, { files: src, pages: stored }, lib, pictures))
  }
  /* A redesign may be done with the site's own sections and tokens: writing a component is not required of it. */
  if (!job.edit && !job.redesign && !cp.filesTouched.some((p) => p.startsWith("sections/ai_"))) issues.push({ severity: "error", code: "build.nothing", message: "No component was written. A new website is made of components you write." })
  return issues
}

/**
 * Whether this job can make or find pictures: an image slot must then hold one before finish. P1's image service
 * (`deps.images.available()`: a generation provider or stock search); `imageProvider` overrides it (tests, an
 * environment that wants slots enforced or relaxed). Neither: none, and sections are made text-forward.
 */
export async function picturesAvailable(deps: Pick<AgentDeps, "imageProvider" | "images">): Promise<boolean> {
  try {
    if (deps.imageProvider) return (await deps.imageProvider()) === true
    if (!deps.images) return false
    const a = await deps.images.available()
    return !!a?.generate || a?.stock === true
  } catch {
    return false
  }
}
