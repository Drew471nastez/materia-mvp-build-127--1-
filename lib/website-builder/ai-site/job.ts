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
import { readSitePlan, sitePlanTool, sitePlanTurn, SITE_PLANNER_SYSTEM, plannableTypes, planOutline, type SitePlan } from "../agent/site-plan"
import type { DesignPreset } from "../design-presets"
import { DESIGN_PRESETS } from "../design-presets"
import { pagePath } from "../site-pages"
import { describeCapabilities, EMPTY_CAPABILITIES, type Capabilities } from "./capabilities"
import { applySiteOps, buildSite, chromeOps, syncChrome, ANY_PAGE, type PlacedSection, type SiteState, type PageOp } from "./apply"
import { fillSection, fillSystem, type FillContext, type FillTarget } from "./fill"
import { CREDITS_PAGE, creditsHtml, fallbackFor, fillSlot, slotsFor, type ImageDeps, type PhotoCredit } from "./images"
import { deterministicFindings, rewritable, visualFindings, type SiteFinding } from "./verify"
import { callOnce, mergeSpend, NO_SPEND, addSpend, pool, type Models, type Spend } from "./models"
import type { JobEngine, StartOptions } from "@/lib/ai-builder/types"
import { startContext } from "./start-options"

export type JobStatus = "queued" | "running" | "complete" | "partial" | "failed"
export type JobStep = "plan" | "build" | "write" | "photos" | "check" | "done"
export const STEPS: JobStep[] = ["plan", "build", "write", "photos", "check", "done"]

export interface LoggedOp {
  seq: number
  page: string
  op: ThemeOp
}

export interface JobState {
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
  return { seq: 0, ops: [], caps: null, placed: [], written: {}, filled: [], failed: [], photos: [], credits: [], notes: [], findings: [], spend: NO_SPEND, pages: [], timings: {} }
}

export function newJob(input: { id: string; creatorId: string; ownerUserId: string | null; installId: string; prompt: string }): Job {
  return { ...input, status: "queued", step: "plan", progress: 0, plan: null, state: emptyState(), error: null, attempts: 0 }
}

export interface SiteIO {
  read(): Promise<SiteState>
  /** Writes the draft of every page named, and the draft Theme settings when `settings` is true. */
  write(site: SiteState, pages: string[], settings: boolean, titles?: Record<string, string>): Promise<void>
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
  /** Saves the job (and is where the editor's next poll reads it from). */
  save: (job: Job) => Promise<void>
  now?: () => number
  /** When this call must hand over, in ms since the epoch. A step stops starting new work after it. */
  deadline?: number
  /** How many sections are written at once. */
  concurrency?: number
  signal?: AbortSignal
}

/** Plain words for each step, for the progress view and the logs. */
export const STEP_PROGRESS: Record<JobStep, [number, number]> = {
  plan: [2, 15],
  build: [15, 25],
  write: [25, 70],
  photos: [70, 88],
  check: [88, 99],
  done: [100, 100],
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
  return { site: job.plan!, caps, capsText: describeCapabilities(caps), prompt: jobBrief(job), schemas: deps.schemas, links, defaultLink }
}

const timed = (job: Job, step: JobStep, ms: number): Job => ({ ...job, state: { ...job.state, timings: { ...job.state.timings, [step]: (job.state.timings[step] ?? 0) + ms } } })

/* ── the steps ─────────────────────────────────────────────────────────── */

async function stepPlan(job: Job, deps: JobDeps): Promise<Job> {
  const caps = await deps.capabilities().catch(() => EMPTY_CAPABILITIES)
  const presets = deps.presets ?? DESIGN_PRESETS
  const capsText = describeCapabilities(caps)
  const types = plannableTypes(deps.addable, deps.schemas, caps)
  const tool = sitePlanTool(types, presets)
  let spend = job.state.spend
  let plan: SitePlan | null = null
  let lastText = ""
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    const user = sitePlanTurn({ prompt: jobBrief(job), caps, capsText, addable: deps.addable, schemas: deps.schemas, presets }) + (attempt && lastText ? `\n\nYOUR LAST ANSWER COULD NOT BE USED (no page with a section that can be built). Call submit_site_plan again.` : "")
    try {
      const r = await callOnce(deps.models.plan, { system: SITE_PLANNER_SYSTEM, user, tools: [tool], maxOutputTokens: 32_000, timeoutMs: 170_000, signal: deps.signal })
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
      plan = readSitePlan(raw ?? r.text, { caps, addable: deps.addable, schemas: deps.schemas, presets })
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
    state: { ...job.state, caps, spend, pages: planOutline(plan).map((p) => ({ key: p.key, title: p.title })) },
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
  await deps.site.write(built.site, Object.keys(built.site.pages), true, titles)
  const next = log(job, built.ops)
  if (built.notes.length) console.warn("[ai-site] build notes", { job: job.id, notes: built.notes.slice(0, 8) })
  return { ...next, step: "write", progress: STEP_PROGRESS.write[0], state: { ...next.state, placed: built.placed } }
}

function stillPlaced(job: Job, site: SiteState): PlacedSection[] {
  return job.state.placed.filter((p) => site.pages[p.page]?.some((s) => s.id === p.id))
}

async function stepWrite(job: Job, deps: JobDeps, now: () => number): Promise<Job> {
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
      for (const slot of slotsFor(p.page, section, planned, query, deps.schemas)) {
        const r = await fillSlot(slot, deps.images, used, deps.schemas)
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

/** The credits page: the home page's header and footer around one page_content section. */
function creditsSections(site: SiteState, credits: PhotoCredit[]): { sections: SiteState["pages"][string] } | null {
  const home = site.pages.home ?? []
  const header = home.find((s) => s.type === "header")
  const footer = home.find((s) => s.type === "footer")
  const section = { id: "page_content-photo-credits", type: "page_content", name: "Photo credits", settings: { heading: "Photo credits", content: creditsHtml(credits) } }
  return { sections: [...(header ? [header] : []), section, ...(footer ? [footer] : [])] }
}

async function stepCheck(job: Job, deps: JobDeps): Promise<Job> {
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
  const partial = remaining.length > 0 || job.state.failed.length > 0
  return { ...job, step: "done", progress: 100, status: partial ? "partial" : "complete", state: { ...job.state, findings: remaining.slice(0, 20) } }
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
    else if (step === "write") next = await stepWrite(next, deps, now)
    else if (step === "photos") next = await stepPhotos(next, deps, now)
    else if (step === "check") next = await stepCheck(next, deps)
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
export const STEP_LABEL: Record<JobStep, string> = { plan: "planning the design", build: "building the pages", write: "writing the pages", photos: "adding photos", check: "checking the site", done: "the site" }

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
  }
}
export type JobView = ReturnType<typeof publicView>
