/**
 * ===========================================================================
 *  START WITH AI: ONE WEBSITE, MADE IN STEPS ON THE SERVER
 * ===========================================================================
 * Start with AI used to make an empty website and hand the description to
 * the chat agent in the editor: one model doing everything in turn, from the
 * browser, for twenty minutes, dying with the tab. It is a job now, in five
 * steps that each fit well inside one 300 second function:
 *
 *   plan    what is real (./capabilities.ts), then ONE strong call for the
 *           art direction and every page (agent/site-plan.ts)
 *   build   the plan applied in code: theme settings, pages, sections, the
 *           header and footer on every page (./apply.ts)
 *   write   every section's words, in parallel, checked (./fill.ts)
 *   photos  every picture slot found, copied and credited (./images.ts)
 *   check   the checks, the flagged sections written again (./verify.ts)
 *
 * Each step reads the website as it is stored now, changes it, writes the
 * drafts back (never the live site) and appends its operations to the job,
 * which the editor replays onto its canvas as they land. A long step (write,
 * photos) stops at its deadline with what it finished recorded, and the next
 * call carries on where it stopped: a step can be run again safely.
 *
 * Where the job lives is not this file's business: a JobStore saves it (the
 * ai_site_jobs table, or memory when that table is not there yet), a SiteIO
 * reads and writes the website, and the models, the photo search and the
 * browser check are handed in, so tests run the whole job with fakes.
 */
import type { ThemeOp } from "../agent/operations"
import { schemaOf, type SchemaMap } from "../agent/schemas"
import type { VisualFinding } from "../agent/visual-check"
import type { ThemeState } from "../agent/operations"
import { readSitePlan, sitePlanTool, sitePlanTurn, sitePlannerSystem, plannableTypes, planOutline, CUSTOM_TYPE, type SitePlan } from "../agent/site-plan"
import type { Menu } from "@/lib/storelib-theme/values"
import type { DesignPreset } from "../design-presets"
import { DESIGN_PRESETS } from "../design-presets"
import { pagePath } from "../site-pages"
import { describeCapabilities, EMPTY_CAPABILITIES, type Capabilities } from "./capabilities"
import { applySiteOps, buildSite, chromeOps, homeChrome, syncChrome, ANY_PAGE, type PlacedSection, type SiteState, type PageOp } from "./apply"
import { acceptCoded, codePrompt, codeTasks, CODE_CONCURRENCY, CODE_START_RESERVE_MS, CODE_TRIES, placementOps, resolvePlan, siteMenu, siteMenuHandle, withCoded, type CodeAnswer, type CodedSection, type SectionCoder } from "./code"
import { STUDIO_CRAFT } from "./craft"
import { fillSection, fillSystem, type FillContext, type FillTarget } from "./fill"
import { CREDITS_PAGE, creditsHtml, fallbackFor, fillSlot, slotsFor, type ImageDeps, type PhotoCredit } from "./images"
import { deterministicFindings, rewritable, visualFindings, type SiteFinding } from "./verify"
import { callOnce, mergeSpend, NO_SPEND, addSpend, pool, type Models, type Spend } from "./models"
import type { JobEngine, StartOptions } from "@/lib/ai-builder/types"
import { startContext } from "./start-options"
import { nativePlan, type NativeEngineDeps, type NativeRecord } from "./native/engine"
import { isNativePlan, nativeOps, tokenThemeOp } from "./native/plan"
import { nativeRegistry } from "./native/registry"
import type { NativeReviewRequest, NativeReviewResult } from "./native-review/review"
import { REVIEW_PHASE_WORDS, type ReviewPhase } from "./native-review/words"
import { knownLinks } from "./native-review/checks"
import { defectLine } from "@/lib/ai-builder/visual-critic/types"
import { ZERO_USAGE } from "@/lib/sites/agent/types"
import type { SchemaMap as ReviewSchemas } from "../agent/schemas"

export type JobStatus = "queued" | "running" | "complete" | "partial" | "failed"
export type JobStep = "plan" | "build" | "code" | "write" | "photos" | "check" | "done"
export const STEPS: JobStep[] = ["plan", "build", "code", "write", "photos", "check", "done"]

/**
 * HOW LONG A JOB MAY GO ON. Each request runs steps for RUN_BUDGET_MS (./server.ts) and hands over to the next, so a
 * whole site can take as many minutes as it needs, like a coding agent working through a project. This caps how many
 * requests one job may take before it stops and says so: forty turns of four minutes is far more than a site needs,
 * and a job that somehow loops cannot run for ever.
 */
export const MAX_JOB_RUNS = 40

/** Whether a job has used every turn it may take. Continue (the owner's own press) starts the count again. */
export function outOfRuns(job: Pick<Job, "attempts">): boolean {
  return job.attempts >= MAX_JOB_RUNS
}

export interface LoggedOp {
  seq: number
  page: string
  op: ThemeOp
}

export interface JobState {
  /** Set by saveJob while the job is at the code step, which is stored as "build" (server.ts). */
  coding?: boolean
  seq: number
  ops: LoggedOp[]
  caps: Capabilities | null
  placed: PlacedSection[]
  written: Record<string, string[]>
  filled: string[]
  failed: string[]
  photos: string[]
  credits: PhotoCredit[]
  /** What happened that the creator should know: sections left out, photos not found. */
  notes: string[]
  /** What the check still finds wrong at the end. */
  findings: string[]
  spend: Spend
  pages: { key: string; title: string }[]
  /** Milliseconds each step took, summed over its calls. */
  timings: Partial<Record<JobStep, number>>
  /** FREE DESIGN (./code.ts): the files coded for this site, accepted and saved. */
  coded: CodedSection[]
  /** Tries per code task key. */
  codeTries: Record<string, number>
  /** Code task keys the site went on without. */
  codeFailed: string[]
  /** The coded files' paths, small, for the editor's poll (which never reads the schemas in `coded`). */
  files: string[]
  /** Why a task's last file was refused, sent with its next try. */
  codeReasons: Record<string, string>
  /** What the job is doing and has done, newest last, for the progress view: a file being coded, one placed, one left out. */
  activity: { kind: "code" | "coded" | "skipped"; name: string }[]
  /** Round R (R2): how the native engine generated the plan, or why it fell back (./native/engine.ts). Absent: classic planner. */
  native?: NativeRecord | null
  /** Round R (R3): what the check step's words check left (set once it has run, so a resumed check goes straight to the review). */
  checked?: string[]
  /** Round R (R3): the design review's phase while it runs, for the progress view. */
  reviewPhase?: ReviewPhase | null
  /** Round R (R3): how the design review went, said honestly (./native-review). */
  review?: JobReview
}

/** The native design review's outcome, kept on the job (round R, R3). */
export interface JobReview {
  status: NativeReviewResult["status"]
  /** In the creator's words: reviewed, measured only, not visually checked. */
  label: string
  reason?: string
  rounds: number
  /** Patches kept, taken back, refused. */
  applied: number
  reverted: number
  refused: number
  /** Defects the first look found, and the ones still there, as lines. */
  found: number
  remaining: string[]
  usd: number
}

export interface Job {
  id: string
  creatorId: string
  ownerUserId: string | null
  installId: string
  status: JobStatus
  step: JobStep
  progress: number
  prompt: string
  plan: SitePlan | null
  state: JobState
  error: string | null
  attempts: number
  /** Which engine runs the job (SQL part 401). Absent means classic: these five steps. */
  engine?: JobEngine
  /** What the person chose beside their words (an example, blank or theme, preferences); SQL part 401. */
  options?: Partial<StartOptions> | null
}

/**
 * What the generator reads: the prompt exactly as written, then the person's choices in plain words
 * (start-options.ts startContext). A job with no options (before part 401) reads the prompt alone, as before.
 */
export function jobBrief(job: { prompt: string; options?: Partial<StartOptions> | null }): string {
  /* An edit of one component (options.edit) is about that file, not about how a new website starts. */
  const context = job.options && job.options.generation && !("edit" in job.options) ? startContext(job.options as StartOptions) : ""
  return context ? `${job.prompt}\n\n${context}` : job.prompt
}

/**
 * THE ENGINE SWITCH (round L). A classic job runs the five steps below, unchanged. An agent job is driven by
 * ./agent-runner.ts (the tool loop, one iteration at a time, budgets, cancel, events) and never enters runStep.
 */
export function jobEngine(job: { engine?: string | null }): JobEngine {
  return job.engine === "agent" ? "agent" : "classic"
}

export function emptyState(): JobState {
  return { seq: 0, ops: [], caps: null, placed: [], written: {}, filled: [], failed: [], photos: [], credits: [], notes: [], findings: [], spend: NO_SPEND, pages: [], timings: {}, coded: [], codeTries: {}, codeFailed: [], codeReasons: {}, activity: [], files: [] }
}

export function newJob(input: { id: string; creatorId: string; ownerUserId: string | null; installId: string; prompt: string }): Job {
  return { ...input, status: "queued", step: "plan", progress: 0, plan: null, state: emptyState(), error: null, attempts: 0 }
}

export interface SiteIO {
  read(): Promise<SiteState>
  /** Writes the draft of every page named, and the draft Theme settings when `settings` is true. */
  write(site: SiteState, pages: string[], settings: boolean, titles?: Record<string, string>): Promise<void>
  /** Saves a coded section file into this website's own files, as a draft (./code.ts). Without it nothing is coded. */
  writeFile?(path: string, source: string): Promise<void>
  /**
   * Makes sure this website's own menu exists with these links, without touching any other menu. "store" when it is
   * in the store's menus, "theme" when the site keeps its menus in its own settings (the caller writes them there),
   * null when it could not be kept.
   */
  ensureMenu?(handle: string, menu: Menu): Promise<"store" | "theme" | null>
}

export interface JobDeps {
  models: Models
  site: SiteIO
  capabilities: () => Promise<Capabilities>
  images: ImageDeps
  /** The browser check of one page, or null when no browser is available. */
  visual?: (state: ThemeState) => Promise<VisualFinding[] | null>
  schemas?: SchemaMap
  addable: string[]
  presets?: readonly DesignPreset[]
  /**
   * FREE DESIGN: the coder that writes the site's own header, footer and custom sections (./code.ts writerCoder).
   * Without it (or without SiteIO.writeFile) the plan keeps to the theme's sections and the theme's header and footer.
   */
  code?: SectionCoder
  /**
   * Round R (R2): the native engine (./native/engine.ts), given when AI_NATIVE_ENGINE is on (./runner.ts). The plan
   * step then generates the whole site as native sections in one structured call; without it the classic planner plans.
   */
  native?: NativeEngineDeps
   * Round R (R3): the design review of the finished draft (./native-review): drawn as the live site draws it, at
   * 1440 and 390 with JavaScript off, measured, and refined with typed patches on the sections' own settings, at
   * most two rounds. Absent (the AI_NATIVE_ENGINE switch off, or no site address to draw it at): not reviewed.
   */
  nativeReview?: NativeReviewPort
  /** Saves the job (and is where the editor's next poll reads it from). */
  save: (job: Job) => Promise<void>
  now?: () => number
  /** When this call must hand over, in ms since the epoch. A step stops starting new work after it. */
  deadline?: number
  /** How many sections are written at once. */
  concurrency?: number
  signal?: AbortSignal
}

/** The review as the job calls it: the request, and how it saves the draft and reports its phase. */
export type NativeReviewPort = ((
  req: NativeReviewRequest,
  hooks: { write: (site: SiteState, pages: string[], settings: boolean) => Promise<void>; progress: (phase: ReviewPhase) => Promise<void>; schemas?: ReviewSchemas },
) => Promise<NativeReviewResult>) & { available?: () => { ok: true } | { ok: false; reason: string } }

/** What the design review may spend on its vision call, USD: one look at three pages, with one repair. */
export const NATIVE_REVIEW_MAX_USD = 0.9
/** Less time than this left in the request: the review waits for the next one. */
export const NATIVE_REVIEW_MIN_MS = 60_000

/** Plain words for each step, for the progress view and the logs. */
export const STEP_PROGRESS: Record<JobStep, [number, number]> = {
  plan: [2, 12],
  build: [12, 18],
  code: [18, 58],
  write: [58, 74],
  photos: [74, 88],
  check: [88, 99],
  done: [100, 100],
}

/** Whether this job's steps may code files: a coder, and a website that can keep them. */
export function canCode(deps: Pick<JobDeps, "code" | "site">): boolean {
  return !!deps.code && typeof deps.site.writeFile === "function"
}

/** The schemas every step after the code step reads: the theme's and the files coded for this site. */
export function jobSchemas(job: Job, deps: Pick<JobDeps, "schemas">): SchemaMap | undefined {
  return job.state.coded?.length ? withCoded(deps.schemas, job.state.coded) : deps.schemas
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

function log(job: Job, items: PageOp[]): Job {
  if (!items.length) return job
  let seq = job.state.seq
  const ops = [...job.state.ops, ...items.map((i) => ({ seq: ++seq, page: i.page, op: i.op }))]
  return { ...job, state: { ...job.state, seq, ops } }
}

/** Applies `items` to the site and to the job's log in one go. */
function apply(job: Job, site: SiteState, items: PageOp[], schemas?: SchemaMap): { job: Job; site: SiteState; pages: Set<string>; settings: boolean } {
  const r = applySiteOps(site, items, schemas)
  const pages = new Set<string>()
  let settings = false
  for (const a of r.applied) {
    if (a.op.kind === "update_theme") settings = true
    else if (a.page === ANY_PAGE) Object.keys(r.site.pages).forEach((k) => pages.add(k))
    else pages.add(a.page)
  }
  return { job: log(job, r.applied), site: r.site, pages, settings }
}

function siteLinks(plan: SitePlan, caps: Capabilities): { links: { path: string; title: string }[]; defaultLink: string } {
  const links = plan.pages.map((p) => ({ path: pagePath(p.key), title: p.title }))
  const products = (caps.facts?.products ?? []).filter((p) => p.published && p.url)
  if (products.length) links.push({ path: "/products", title: "The shop" })
  for (const p of products.slice(0, 12)) links.push({ path: p.url!, title: p.title })
  const contact = plan.pages.find((p) => /contact|book|enquir|get-in-touch/.test(p.key))
  const defaultLink = contact ? pagePath(contact.key) : products[0]?.url ?? "/"
  return { links, defaultLink }
}

export function fillContext(job: Job, deps: Pick<JobDeps, "schemas">): FillContext {
  const caps = job.state.caps ?? EMPTY_CAPABILITIES
  const { links, defaultLink } = siteLinks(job.plan!, caps)
  return { site: job.plan!, caps, capsText: describeCapabilities(caps), prompt: jobBrief(job), schemas: jobSchemas(job, deps), links, defaultLink }
}

/** Aborts when either does. */
function bothSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const c = new AbortController()
  if (a.aborted || b.aborted) c.abort()
  else {
    a.addEventListener("abort", () => c.abort(), { once: true })
    b.addEventListener("abort", () => c.abort(), { once: true })
  }
  return c.signal
}

const timed = (job: Job, step: JobStep, ms: number): Job => ({ ...job, state: { ...job.state, timings: { ...job.state.timings, [step]: (job.state.timings[step] ?? 0) + ms } } })

/* ── the steps ─────────────────────────────────────────────────────────── */

async function stepPlan(job: Job, deps: JobDeps): Promise<Job> {
  const caps = await deps.capabilities().catch(() => EMPTY_CAPABILITIES)
  const presets = deps.presets ?? DESIGN_PRESETS
  /* Round R (R2): the whole site as native sections in one structured call, or the classic planner when it cannot. */
  let fallback: NativeRecord | null = null
  if (deps.native) {
    try {
      const n = await nativePlan(
        { jobId: job.id, creatorId: job.creatorId, installId: job.installId, request: jobBrief(job), options: job.options ?? null, caps, model: deps.models.plan, presets, deadline: deps.deadline, now: deps.now, signal: deps.signal },
        deps.native,
      )
      return {
        ...job,
        plan: n.plan,
        step: "build",
        progress: STEP_PROGRESS.build[0],
        state: { ...job.state, caps, spend: mergeSpend(job.state.spend, n.spend), native: n.record, pages: planOutline(n.plan).map((p) => ({ key: p.key, title: p.title })) },
      }
    } catch (e) {
      const why = e instanceof Error ? e.message.slice(0, 160) : "the native engine failed"
      console.warn("[ai-site] native engine fell back to the classic planner", { job: job.id, why })
      const spent = (e as { spend?: Spend }).spend
      if (spent) job = { ...job, state: { ...job.state, spend: mergeSpend(job.state.spend, spent) } }
      fallback = { version: "", promptVersion: "", brainVersion: null, recipeId: null, attempts: 0, sections: 0, issues: [], mapped: [], fallback: why }
    }
  }
  const capsText = describeCapabilities(caps)
  const types = plannableTypes(deps.addable, deps.schemas, caps)
  const free = canCode(deps)
  const tool = sitePlanTool(types, presets, { free })
  let spend = job.state.spend
  let plan: SitePlan | null = null
  let lastText = ""
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    const user = sitePlanTurn({ prompt: jobBrief(job), caps, capsText, addable: deps.addable, schemas: deps.schemas, presets, free }) + (attempt && lastText ? `\n\nYOUR LAST ANSWER COULD NOT BE USED (no page with a section that can be built). Call submit_site_plan again.` : "")
    try {
      const r = await callOnce(deps.models.plan, { system: sitePlannerSystem({ free, craft: STUDIO_CRAFT }), user, tools: [tool], maxOutputTokens: 32_000, timeoutMs: 170_000, signal: deps.signal })
      spend = addSpend(spend, deps.models.plan.model, r.usage)
      const call = r.toolCalls.find((c) => c.name === tool.name)
      let raw: unknown = null
      if (call) {
        try {
          raw = JSON.parse(call.argumentsJson)
        } catch {
          raw = null
        }
      }
      lastText = r.text
      plan = readSitePlan(raw ?? r.text, { caps, addable: deps.addable, schemas: deps.schemas, presets, free })
    } catch (e) {
      if (attempt === 1) throw e
    }
  }
  if (!plan) throw new PlanError()
  return {
    ...job,
    plan,
    step: "build",
    progress: STEP_PROGRESS.build[0],
    /* The plan's own corrections stay with the plan (job.plan.corrections): they are for the logs, not the creator. */
    state: { ...job.state, caps, spend, ...(fallback ? { native: fallback } : {}), pages: planOutline(plan).map((p) => ({ key: p.key, title: p.title })) },
  }
}

export class PlanError extends Error {
  constructor() {
    super("The design could not be planned.")
    this.name = "PlanError"
  }
}

async function stepBuild(job: Job, deps: JobDeps): Promise<Job> {
  const stored = await deps.site.read()
  const caps = job.state.caps ?? EMPTY_CAPABILITIES
  const built = buildSite({ plan: job.plan!, site: stored, schemas: deps.schemas, addable: deps.addable, idSeed: job.id.replace(/-/g, "").slice(0, 8), presets: deps.presets, shop: (caps.facts?.publishedProducts ?? 0) > 0 })
  const titles = Object.fromEntries(job.plan!.pages.map((p) => [p.key, p.title]))
  let next = log(job, built.ops)
  let site = built.site
  let filled = next.state.filled
  let written = next.state.written
  /* Round R (R2): a native plan's sections get their generated words, links, bindings and blocks now, as logged operations. */
  if (isNativePlan(job.plan)) {
    const placement = nativeOps({ site, placed: built.placed, plan: job.plan, reg: deps.native?.registry ?? nativeRegistry(), caps, schemas: deps.schemas })
    /* The design brain's tokens (with the site's own palette and fonts over them) as one Theme settings write. */
    const tokens = tokenThemeOp(job.plan, site.settings)
    const a = apply(next, site, [...(tokens ? [{ page: ANY_PAGE, op: tokens }] : []), ...placement.ops], deps.schemas)
    next = a.job
    site = a.site
    filled = [...new Set([...filled, ...placement.filled])]
    written = { ...written, ...placement.written }
  }
  await deps.site.write(site, Object.keys(site.pages), true, titles)
  if (built.notes.length) console.warn("[ai-site] build notes", { job: job.id, notes: built.notes.slice(0, 8) })
  return { ...next, step: "code", progress: STEP_PROGRESS.code[0], state: { ...next.state, placed: built.placed, filled, written } }
}

/**
 * ===========================================================================
 *  CODE: THE SITE'S OWN HEADER, FOOTER AND CUSTOM SECTIONS (./code.ts)
 * ===========================================================================
 * A wave of files at a time, each written from its brief by the coder, then
 * accepted or refused in code. A refused file is tried again with the reason;
 * a file still refused is left out and said, never a broken section on the
 * page. Short of time, the step returns as it is and the next request carries
 * on. When every file is done they are placed: each custom section where the
 * plan put it, the coded header and footer on every page in place of the
 * theme's, reading this site's own menu.
 */
async function stepCode(job: Job, deps: JobDeps, now: () => number): Promise<Job> {
  const plan = job.plan!
  const tasks = canCode(deps) ? codeTasks(plan) : []
  const coder = deps.code
  const caps = job.state.caps ?? EMPTY_CAPABILITIES
  const shop = (caps.facts?.publishedProducts ?? 0) > 0
  const menuHandle = siteMenuHandle(job.installId)
  /* Nothing to code (no coder here): the theme's own sections and frame, as before. */
  if (!coder || !tasks.length) return { ...job, step: "write", progress: STEP_PROGRESS.write[0] }
  let site = await deps.site.read()
  const finished = () => new Set([...job.state.coded.map((c) => c.key), ...job.state.codeFailed])
  const total = tasks.length || 1

  while (tasks.some((t) => !finished().has(t.key))) {
    if (deps.deadline && now() > deps.deadline - CODE_START_RESERVE_MS) return job
    const wave = tasks.filter((t) => !finished().has(t.key)).slice(0, CODE_CONCURRENCY)
    job = { ...job, state: { ...job.state, activity: [...job.state.activity, ...wave.map((t) => ({ kind: "code" as const, name: t.name }))].slice(-30) } }
    await deps.save(job)
    const takenTypes = [...new Set([...Object.keys(deps.schemas ?? {}), ...job.state.coded.map((c) => c.type)])]
    const takenNames = job.state.coded.map((c) => c.name)
    const usage: { model: string; u: Parameters<typeof addSpend>[2] }[] = []
    const ctx = { plan, capsText: describeCapabilities(caps), shop, menuHandle, prompt: job.prompt }
    const results = await pool(wave, wave.length, async (task) => {
      const tries = job.state.codeTries[task.key] ?? 0
      const prompt = codePrompt(task, ctx, job.state.codeReasons?.[task.key] ?? "")
      const timer = deps.deadline ? AbortSignal.timeout(Math.max(20_000, deps.deadline - now())) : undefined
      const signal = deps.signal && timer ? bothSignals(deps.signal, timer) : (deps.signal ?? timer)
      const answer: CodeAnswer = await coder
        .write(task, prompt, { takenTypes, takenNames, settings: site.settings, signal, deadlineAt: deps.deadline, onUsage: (u) => usage.push({ model: coder.model, u }) })
        .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "the coder failed" }))
      if (answer.ok === false) return { task, tries: tries + 1, accepted: null, reason: (answer as { error: string }).error }
      const source = (answer as { source: string }).source
      const accepted = acceptCoded(source, { role: task.role, takenTypes })
      if (accepted.ok === false) return { task, tries: tries + 1, accepted: null, reason: (accepted as { reason: string }).reason }
      try {
        await deps.site.writeFile!((accepted as { path: string }).path, source)
      } catch {
        return { task, tries: tries + 1, accepted: null, reason: "the file could not be saved" }
      }
      return { task, tries: tries + 1, accepted, reason: "" }
    })
    let spend = job.state.spend
    for (const x of usage) spend = addSpend(spend, x.model, x.u)
    const coded = [...job.state.coded]
    const codeFailed = [...job.state.codeFailed]
    const codeTries = { ...job.state.codeTries }
    const codeReasons = { ...(job.state.codeReasons ?? {}) }
    const activity = [...job.state.activity]
    const notes = [...job.state.notes]
    for (const r of results) {
      codeTries[r.task.key] = r.tries
      const ok = r.accepted && r.accepted.ok === true ? (r.accepted as Extract<ReturnType<typeof acceptCoded>, { ok: true }>) : null
      /* Two files of one wave that picked the same type: the second is tried again under another name. */
      if (ok && !coded.some((c) => c.type === ok.type)) {
        coded.push({ key: r.task.key, role: r.task.role, type: ok.type, name: ok.name, path: ok.path, schema: JSON.parse(JSON.stringify(ok.schema)) })
        activity.push({ kind: "coded", name: ok.name })
        continue
      }
      const reason = ok ? `"${ok.type}" is already a section on this site. Give it a name of its own.` : r.reason
      codeReasons[r.task.key] = reason.slice(0, 800)
      console.warn("[ai-site] a coded file was refused", { job: job.id, task: r.task.key, reason: reason.slice(0, 200) })
      if (r.tries >= CODE_TRIES) {
        codeFailed.push(r.task.key)
        activity.push({ kind: "skipped", name: r.task.name })
        notes.push(r.task.role === "section" ? `${r.task.name} could not be coded well enough and was left out.` : `The site's own ${r.task.role} could not be coded, so the theme's ${r.task.role} is used.`)
      }
    }
    job = { ...job, state: { ...job.state, coded, codeFailed, codeTries, codeReasons, files: coded.map((c) => c.path), activity: activity.slice(-30), notes, spend } }
    job = { ...job, progress: clamp(STEP_PROGRESS.code[0] + ((coded.length + codeFailed.length) / total) * (STEP_PROGRESS.code[1] - STEP_PROGRESS.code[0])) }
    await deps.save(job)
  }

  /* ── every file is done: placed in the plan's order, and the frame replaced ── */
  const schemas = withCoded(deps.schemas, job.state.coded)
  const resolved = resolvePlan(plan, job.state.coded, schemas)
  let menuWhere: "store" | "theme" | null = null
  const chromeCoded = job.state.coded.some((c) => c.role !== "section")
  if (chromeCoded && deps.site.ensureMenu) menuWhere = await deps.site.ensureMenu(menuHandle, siteMenu(resolved, shop)).catch(() => null)
  if (menuWhere === "theme") {
    const menus = { ...((site.settings.menus as Record<string, unknown> | undefined) ?? {}), [menuHandle]: siteMenu(resolved, shop) }
    site = { ...site, settings: { ...site.settings, menus } }
  }
  const placement = placementOps({ site, plan: resolved, coded: job.state.coded, placed: job.state.placed, schemas, idSeed: job.id.replace(/-/g, "").slice(0, 8), menuHandle: menuWhere ? menuHandle : null })
  const a = apply(job, site, placement.ops, schemas)
  site = syncChrome(a.site)
  await deps.site.write(site, Object.keys(site.pages), a.settings || menuWhere === "theme")
  const customIds = placement.placed.map((p) => p.id)
  return {
    ...a.job,
    plan: resolved,
    step: "write",
    progress: STEP_PROGRESS.write[0],
    state: {
      ...a.job.state,
      notes: [...a.job.state.notes, ...placement.notes],
      placed: [...a.job.state.placed.filter((p) => !customIds.includes(p.id)), ...placement.placed],
      /* A coded section was written with its words for this site: the write step leaves it as it is. */
      filled: [...new Set([...a.job.state.filled, ...customIds])],
    },
  }
}


function stillPlaced(job: Job, site: SiteState): PlacedSection[] {
  return job.state.placed.filter((p) => site.pages[p.page]?.some((s) => s.id === p.id))
}

async function stepWrite(job: Job, deps: JobDeps, now: () => number): Promise<Job> {
  deps = { ...deps, schemas: jobSchemas(job, deps) }
  let site = await deps.site.read()
  const ctx = fillContext(job, deps)
  const system = fillSystem(ctx)
  const todo = stillPlaced(job, site).filter((p) => !job.state.filled.includes(p.id) && !job.state.failed.includes(p.id))
  const total = job.state.placed.length || 1
  const wave = Math.max(1, deps.concurrency ?? 8)
  for (let i = 0; i < todo.length; i += wave) {
    if (deps.deadline && now() > deps.deadline) break
    const chunk = todo.slice(i, i + wave)
    const results = await pool(chunk, wave, async (p) => {
      const sections = site.pages[p.page] ?? []
      const section = sections.find((s) => s.id === p.id)
      const planned = job.plan!.pages.find((x) => x.key === p.page)?.sections[p.plan]
      if (!section || !planned) return null
      const body = sections.filter((s) => s.type !== "header" && s.type !== "footer")
      const target: FillTarget = { page: p.page, section, planned, position: body.findIndex((s) => s.id === p.id) + 1, of: body.length }
      return { p, r: await fillSection(target, ctx, deps.models, { system, signal: deps.signal }) }
    })
    const items: PageOp[] = []
    const filled = [...job.state.filled]
    const failed = [...job.state.failed]
    const written = { ...job.state.written }
    const notes = [...job.state.notes]
    let spend = job.state.spend
    for (const x of results) {
      if (!x) continue
      spend = mergeSpend(spend, x.r.spend)
      if (x.r.ok) {
        items.push(...x.r.ops.map((op) => ({ page: x.p.page, op })))
        filled.push(x.p.id)
        written[x.p.id] = x.r.written
      } else {
        /* Never left on the page with its demo copy: taken off, and said. */
        items.push({ page: x.p.page, op: { kind: "remove_section", id: x.p.id } })
        failed.push(x.p.id)
        notes.push(`${sectionName(x.p.type, deps.schemas)} on ${pageName(job, x.p.page)} could not be written truthfully and was left out.`)
      }
    }
    const a = apply({ ...job, state: { ...job.state, filled, failed, written, notes, spend } }, site, items, deps.schemas)
    site = a.site
    await deps.site.write(site, [...a.pages], a.settings)
    job = { ...a.job, progress: clamp(STEP_PROGRESS.write[0] + ((filled.length + failed.length) / total) * (STEP_PROGRESS.write[1] - STEP_PROGRESS.write[0])) }
    await deps.save(job)
  }
  const left = stillPlaced(job, site).filter((p) => !job.state.filled.includes(p.id) && !job.state.failed.includes(p.id))
  if (left.length) return job
  return { ...job, step: "photos", progress: STEP_PROGRESS.photos[0] }
}

/** A section as the creator knows it: its name in the Add section list. */
export function sectionName(type: string, schemas?: SchemaMap): string {
  return `The ${schemaOf(schemas, type)?.name ?? type.replace(/_/g, " ")} section`
}

function pageName(job: Job, key: string): string {
  if (key === "home") return "the home page"
  return `the ${job.state.pages.find((p) => p.key === key)?.title ?? key} page`
}

function fallbackQuery(plan: SitePlan, prompt: string): string {
  const planned = plan.pages.flatMap((p) => p.sections.flatMap((s) => s.images.map((i) => i.query)))
  if (planned[0]) return planned[0]
  return prompt
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !/^(with|that|this|from|your|have|want|website|site|page|make|build|need|like|about|their|online|shop|store)$/.test(w))
    .slice(0, 4)
    .join(" ")
}

async function stepPhotos(job: Job, deps: JobDeps, now: () => number): Promise<Job> {
  deps = { ...deps, schemas: jobSchemas(job, deps) }
  let site = await deps.site.read()
  const plan = job.plan!
  const query = fallbackQuery(plan, job.prompt)
  const todo = stillPlaced(job, site).filter((p) => !job.state.photos.includes(p.id))
  const total = job.state.placed.length || 1
  const used = new Set<string>()
  let counter = job.state.seq
  const newId = (type: string) => `${type}-${job.id.replace(/-/g, "").slice(0, 8)}-p${(counter++).toString(36)}`
  const wave = 4
  for (let i = 0; i < todo.length; i += wave) {
    if (deps.deadline && now() > deps.deadline) break
    const chunk = todo.slice(i, i + wave)
    const results = await pool(chunk, wave, async (p) => {
      const section = site.pages[p.page]?.find((s) => s.id === p.id)
      const planned = plan.pages.find((x) => x.key === p.page)?.sections[p.plan]
      const none = { p, ops: [] as PageOp[], credits: [] as PhotoCredit[], note: "", swap: null as { id: string; type: string } | null }
      if (!section || !planned) return none
      const ops: PageOp[] = []
      const credits: PhotoCredit[] = []
      const missing: string[] = []
      /* A native plan may have set a picture already (one of the creator's own): that slot is kept. */
      const native = isNativePlan(plan)
      for (const slot of slotsFor(p.page, section, planned, query, deps.schemas).filter((s) => !native || !slotSet(section, s.slot))) {
        const r = await fillSlot(slot, deps.images, used, deps.schemas, { keepSet: native })
        ops.push(...r.ops.map((op) => ({ page: p.page, op })))
        credits.push(...r.credits)
        missing.push(...r.missing)
      }
      const index = (site.pages[p.page] ?? []).findIndex((s) => s.id === p.id)
      const fb = fallbackFor(section, missing, index, { schemas: deps.schemas, addable: deps.addable, newId })
      if (fb) ops.push(...fb.ops.map((op) => ({ page: p.page, op })))
      const added = fb?.ops.find((op) => op.kind === "add_section")
      return { ...none, ops, credits, note: fb?.note ?? "", swap: added && added.kind === "add_section" ? { id: added.id, type: added.sectionType } : null }
    })
    const items = results.flatMap((r) => r.ops)
    const done = results.map((r) => r.p.id)
    const credits = [...job.state.credits, ...results.flatMap((r) => r.credits)]
    const notes = [...job.state.notes, ...results.filter((r) => r.note).map((r) => `${r.note} (${pageName(job, r.p.page)}).`)]
    /* A section swapped for its words-only sibling is still the plan's section: it keeps its place under its new id, done. */
    const swaps = new Map(results.filter((r) => r.swap).map((r) => [r.p.id, r.swap!]))
    const placed = job.state.placed.map((pl) => (swaps.has(pl.id) ? { ...pl, id: swaps.get(pl.id)!.id, type: swaps.get(pl.id)!.type } : pl))
    const photos = [...job.state.photos, ...done, ...[...swaps.values()].map((x) => x.id)]
    const a = apply({ ...job, state: { ...job.state, photos, credits, notes, placed } }, site, items, deps.schemas)
    site = a.site
    await deps.site.write(site, [...a.pages], a.settings)
    job = { ...a.job, progress: clamp(STEP_PROGRESS.photos[0] + (Math.min(a.job.state.photos.length, total) / total) * (STEP_PROGRESS.photos[1] - STEP_PROGRESS.photos[0])) }
    await deps.save(job)
  }
  const left = stillPlaced(job, site).filter((p) => !job.state.photos.includes(p.id))
  if (left.length) return job

  /* Every photo credited: a Photo credits page, linked from the footer. */
  if (job.state.credits.length) {
    const credits = creditsSections(site, job.state.credits)
    if (credits) {
      site = { ...site, pages: { ...site.pages, [CREDITS_PAGE]: credits.sections } }
      const titles = { [CREDITS_PAGE]: "Photo credits" }
      const a = apply(job, site, chromeOps(site, plan, deps.schemas, { shop: false, credits: true }).map((op) => ({ page: ANY_PAGE, op })), deps.schemas)
      site = syncChrome(a.site)
      await deps.site.write(site, Object.keys(site.pages), false, titles)
      job = { ...a.job, state: { ...a.job.state, pages: [...a.job.state.pages.filter((p) => p.key !== CREDITS_PAGE), { key: CREDITS_PAGE, title: "Photo credits" }] } }
    }
  }
  return { ...job, step: "check", progress: STEP_PROGRESS.check[0] }
}

/** A picture slot that already holds a picture: a setting, or every block of the type. */
function slotSet(section: SiteState["pages"][string][number], slot: string): boolean {
  if (!slot.startsWith("block:")) return typeof section.settings?.[slot] === "string" && !!(section.settings[slot] as string)
  const blocks = (section.blocks ?? []).filter((b) => b.type === slot.slice(6))
  return blocks.length > 0 && blocks.every((b) => Object.entries(b.settings ?? {}).some(([k, v]) => /image|photo|picture/.test(k) && !/alt|focus/.test(k) && typeof v === "string" && !!v))
}

/** The credits page: the home page's header and footer around one page_content section. */
function creditsSections(site: SiteState, credits: PhotoCredit[]): { sections: SiteState["pages"][string] } | null {
  const { header, footer } = homeChrome(site.pages.home ?? [])
  const section = { id: "page_content-photo-credits", type: "page_content", name: "Photo credits", settings: { heading: "Photo credits", content: creditsHtml(credits) } }
  return { sections: [...header, section, ...footer] }
}

async function stepCheck(job: Job, deps: JobDeps, now: () => number = Date.now): Promise<Job> {
  deps = { ...deps, schemas: jobSchemas(job, deps) }
  if (!job.state.checked) job = await checkWords(job, deps)
  /* Round R (R3): the design review, once, when there is time for it in this request (else the next one). */
  if (deps.nativeReview && !job.state.review) {
    if (deps.deadline && deps.deadline - now() < NATIVE_REVIEW_MIN_MS) {
      await deps.save(job)
      return job
    }
    job = await stepReview(job, deps, now)
  }
  const gates = job.state.review?.remaining ?? []
  const remaining = [...(job.state.checked ?? []), ...gates]
  const partial = remaining.length > 0 || job.state.failed.length > 0
  return { ...job, step: "done", progress: 100, status: partial ? "partial" : "complete", state: { ...job.state, reviewPhase: null, findings: remaining.slice(0, 20) } }
}

/** The check's first half: what the words say, and the flagged sections written again (unchanged since round L). */
async function checkWords(job: Job, deps: JobDeps): Promise<Job> {
  let site = await deps.site.read()
  const ctx = fillContext(job, deps)
  const placed = stillPlaced(job, site)
  let findings: SiteFinding[] = deterministicFindings(site, placed, job.state.written, ctx, deps.schemas)
  if (deps.visual && site.pages.home) {
    const visual = await deps.visual({ sections: site.pages.home, settings: site.settings }).catch(() => null)
    findings.push(...visualFindings(visual, "home"))
  }
  /* The flagged sections, written once more with what was found; only those. */
  const flagged = [...new Set(findings.filter(rewritable).map((f) => `${f.page}\n${f.sectionId}`))].slice(0, 8)
  if (flagged.length) {
    const system = fillSystem(ctx)
    const results = await pool(flagged, 6, async (key) => {
      const [page, id] = key.split("\n")
      const p = placed.find((x) => x.page === page && x.id === id)
      const sections = site.pages[page] ?? []
      const section = sections.find((s) => s.id === id)
      const planned = p ? job.plan!.pages.find((x) => x.key === page)?.sections[p.plan] : undefined
      if (!section || !planned) return null
      const body = sections.filter((s) => s.type !== "header" && s.type !== "footer")
      const extra = `THE CHECK FOUND THIS ON THE SECTION AS WRITTEN; fix it:\n${findings.filter((f) => f.page === page && f.sectionId === id).map((f) => `- ${f.message}`).join("\n")}`
      return { page, id, r: await fillSection({ page, section, planned, position: body.findIndex((s) => s.id === id) + 1, of: body.length }, ctx, deps.models, { system, extra, signal: deps.signal }) }
    })
    const items: PageOp[] = []
    let spend = job.state.spend
    for (const x of results) {
      if (!x) continue
      spend = mergeSpend(spend, x.r.spend)
      if (x.r.ok) {
        const before = site.pages[x.page]?.find((sec) => sec.id === x.id)
        items.push(...keepPhotos(before, x.r.ops).map((op) => ({ page: x.page, op })))
      }
    }
    const a = apply({ ...job, state: { ...job.state, spend } }, site, items, deps.schemas)
    site = a.site
    if (items.length) await deps.site.write(site, [...a.pages], a.settings)
    job = a.job
    findings = deterministicFindings(site, stillPlaced(job, site), job.state.written, ctx, deps.schemas)
  }
  const remaining = findings.map((f) => `${f.page}: ${f.message}`)
  return { ...job, state: { ...job.state, checked: remaining.slice(0, 20) } }
}

/** Where the site's main action goes, in the words its plan used for the page. */
function primaryAction(job: Job): { label: string; href: string } | undefined {
  if (!job.plan) return undefined
  const { defaultLink } = siteLinks(job.plan, job.state.caps ?? EMPTY_CAPABILITIES)
  const contact = job.plan.pages.find((p) => pagePath(p.key) === defaultLink)
  if (contact) return { label: contact.title, href: defaultLink }
  if (/^\/products\//.test(defaultLink)) return { label: "Shop now", href: defaultLink }
  return undefined
}

/**
 * Round R (R3): the finished draft drawn as the live site draws it, measured at 1440 and 390 with JavaScript off,
 * and refined with typed patches (./native-review). Its patches are logged like every other change, so the editor
 * replays them onto the canvas; its spend is the job's; its outcome is kept on the job, said honestly. Never
 * throws: a review that could not be done is "not visually checked", and the job finishes as it was.
 */
async function stepReview(job: Job, deps: JobDeps, now: () => number): Promise<Job> {
  const review = deps.nativeReview!
  const site = await deps.site.read()
  const pages = ["home", ...job.state.pages.map((p) => p.key).filter((k) => k !== "home" && k !== CREDITS_PAGE)].filter((k) => site.pages[k])
  const products = (job.state.caps?.facts?.products ?? []).map((p) => p.url ?? "").filter((u) => /^\/products\//.test(u)).map((u) => decodeURIComponent(u.replace(/^\/products\//, "")))
  const progress = async (phase: ReviewPhase) => {
    job = { ...job, state: { ...job.state, reviewPhase: phase } }
    await deps.save(job).catch(() => undefined)
  }
  const timeoutMs = Math.max(30_000, Math.min(150_000, (deps.deadline ? deps.deadline - now() : 150_000) - 15_000))
  let r: NativeReviewResult
  try {
    r = await review(
      { site, pages, brief: jobBrief(job), ...(primaryAction(job) ? { primaryAction: primaryAction(job)! } : {}), known: knownLinks(site, { productSlugs: products }), maxUsd: NATIVE_REVIEW_MAX_USD, timeoutMs },
      { write: (s, p, settings) => deps.site.write(s, p, settings), progress, ...(deps.schemas ? { schemas: deps.schemas } : {}) },
    )
  } catch (e) {
    console.error("[ai-site] design review failed", { job: job.id, error: e instanceof Error ? e.message.slice(0, 200) : "" })
    return { ...job, state: { ...job.state, reviewPhase: null, review: { status: "unverified", label: "Not visually checked", reason: "the design review failed", rounds: 0, applied: 0, reverted: 0, refused: 0, found: 0, remaining: [], usd: 0 } } }
  }
  let next = log(job, r.ops)
  let spend = next.state.spend
  if (r.usage.calls && r.model) {
    spend = addSpend(spend, r.model, { ...ZERO_USAGE, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens })
    spend = { ...spend, calls: spend.calls + r.usage.calls - 1 }
  }
  /* Only the hard gates still standing hold the job back; the rest are the review's notes for the creator. */
  const gates = r.remaining.filter((d) => d.gate).map((d) => `${d.page}: ${d.what}`)
  const notes = r.status === "unverified" ? [...next.state.notes, `The design was not visually checked (${r.reason ?? "no browser"}).`] : next.state.notes
  console.info("[ai-site] design review", { job: job.id, status: r.status, rounds: r.rounds, applied: r.applied.length, reverted: r.reverted.length, refused: r.refused.length, found: r.found.length, remaining: r.remaining.length, usd: r.usage.usd, ms: r.ms, lines: r.remaining.slice(0, 6).map(defectLine) })
  next = {
    ...next,
    state: {
      ...next.state,
      spend,
      notes,
      reviewPhase: null,
      review: { status: r.status, label: r.label, ...(r.reason ? { reason: r.reason } : {}), rounds: r.rounds, applied: r.applied.length, reverted: r.reverted.length, refused: r.refused.length, found: r.found.length, remaining: gates.slice(0, 8), usd: r.usage.usd },
    },
  }
  return next
}

/**
 * A section written again keeps the photos it already has: its items are replaced in order, and each new item takes
 * the picture of the item it replaces. Pure.
 */
export function keepPhotos(before: SiteState["pages"][string][number] | undefined, ops: ThemeOp[]): ThemeOp[] {
  if (!before?.blocks?.length) return ops
  const old = before.blocks
  const seen: Record<string, number> = {}
  return ops.map((op) => {
    if (op.kind !== "add_block" || op.parentId) return op
    const n = (seen[op.blockType] = (seen[op.blockType] ?? -1) + 1)
    const was = old.filter((b) => b.type === op.blockType)[n]
    if (!was) return op
    const photos = Object.fromEntries(Object.entries(was.settings ?? {}).filter(([k, v]) => /image|alt$/.test(k) && typeof v === "string" && v))
    return Object.keys(photos).length ? { ...op, settings: { ...photos, ...(op.settings ?? {}), ...photos } } : op
  })
}

/* ── running ───────────────────────────────────────────────────────────── */

/**
 * Runs the job's current step once and returns the job after it (saved).
 * A step that ran out of time returns with the same step, to be called again.
 */
export async function runStep(job: Job, deps: JobDeps): Promise<Job> {
  const now = deps.now ?? Date.now
  if (job.step === "done") return job
  const started = now()
  const step = job.step
  let next: Job = { ...job, status: "running", error: null, progress: Math.max(job.progress, STEP_PROGRESS[step][0]) }
  try {
    if (step === "plan") next = await stepPlan(next, deps)
    else if (step === "build") next = await stepBuild(next, deps)
    else if (step === "code") next = await stepCode(next, deps, now)
    else if (step === "write") next = await stepWrite(next, deps, now)
    else if (step === "photos") next = await stepPhotos(next, deps, now)
    else if (step === "check") next = await stepCheck(next, deps, now)
  } catch (e) {
    const message = e instanceof PlanError ? e.message : `Could not finish ${STEP_LABEL[step]}.`
    console.error("[ai-site] step failed", { job: job.id, step, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) })
    next = { ...next, status: next.state.placed.length ? "partial" : "failed", error: message }
    next = timed(next, step, now() - started)
    await deps.save(next)
    return next
  }
  next = timed(next, step, now() - started)
  await deps.save(next)
  return next
}

/** Runs steps until the job ends, fails, or the deadline passes. */
export async function runUntil(job: Job, deps: JobDeps): Promise<Job> {
  const now = deps.now ?? Date.now
  let current = job
  for (let guard = 0; guard < 40; guard++) {
    if (current.step === "done" || current.status === "failed" || (current.error && current.status === "partial")) return current
    if (deps.deadline && now() > deps.deadline) return current
    current = await runStep(current, deps)
  }
  return current
}

/** Plain words per step, for errors and the logs (the editor translates its own). */
export const STEP_LABEL: Record<JobStep, string> = { plan: "planning the design", build: "building the pages", code: "coding the sections", write: "writing the pages", photos: "adding photos", check: "checking the site", done: "the site" }

/** A job may be continued by its owner: it ended partial or failed, or it stopped mid-way. */
export function canContinue(job: Pick<Job, "status" | "step">): boolean {
  return job.step !== "done" && (job.status === "failed" || job.status === "partial" || job.status === "running" || job.status === "queued")
}

/** What the editor's poll is given: the job without its private state, and the operations after `after`. */
export function publicView(job: Job, after: number) {
  return {
    id: job.id,
    installId: job.installId,
    status: job.status,
    step: job.step,
    progress: job.progress,
    error: job.error,
    seq: job.state.seq,
    ops: job.state.ops.filter((o) => o.seq > after).slice(0, 400),
    pages: job.state.pages,
    notes: job.state.notes.slice(0, 12),
    findings: job.state.findings.slice(0, 12),
    credits: job.state.credits.length,
    /* The files coded so far: the editor reads them before it replays an operation that places one. */
    files: job.state.files ?? [],
    activity: (job.state.activity ?? []).slice(-6),
    /* Round R (R3): the design review's words while it runs, and how it went. */
    reviewing: job.state.reviewPhase ? REVIEW_PHASE_WORDS[job.state.reviewPhase] : null,
    reviewPhase: job.state.reviewPhase ?? null,
    review: job.state.review ? { status: job.state.review.status, label: job.state.review.label, rounds: job.state.review.rounds, applied: job.state.review.applied } : null,
  }
}
export type JobView = ReturnType<typeof publicView>
