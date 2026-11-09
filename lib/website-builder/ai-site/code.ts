/**
 * ===========================================================================
 *  START WITH AI: THE SITE'S OWN SECTIONS, CODED ONE AT A TIME
 * ===========================================================================
 * The owner: an AI website came out "tied and limited" to the default theme,
 * with "the same header" and "the same footer" every time, and only the
 * sections the theme already had. A person building with an AI coding tool
 * gets a site designed for them. So a generated site now works the way such
 * a tool does:
 *
 *   PLAN     one strong call decides every page and, for each section,
 *            either a built-in type or "custom": a section designed for this
 *            business, with a brief (lib/website-builder/agent/site-plan.ts).
 *            The header and footer always get a brief of their own.
 *   CODE     each custom section, the header and the footer are written as
 *            Storelib section files (template, scoped style, schema), one
 *            file per call, several at once, by the same writer the code
 *            editor's "write me a section" uses (../agent/write-section.ts):
 *            it plans the file, writes it, compiles it and draws it, reviews
 *            it against the brief and refines it once. Long sites take many
 *            calls; the job carries on across requests (./runner.ts).
 *   ACCEPT   nothing a model wrote is trusted. `acceptCoded` compiles the
 *            file again under the strict gate, checks its schema, its kind
 *            (a header says "kind": "header"), its path, and its defaults
 *            (no placeholder, no banned words, no secret, no remote script,
 *            no picture typed into the markup).
 *   PLACE    every accepted file becomes a section on its page, in the plan's
 *            order, through the editor's own operations, and the coded header
 *            and footer replace the theme's on every page. The theme's are
 *            removed, not hidden: an AI site has no preset frame.
 *
 * WHAT STAYS THE SAME. Every coded section is an ordinary section file of
 * this install, in the draft half (nothing is live until the creator
 * publishes), with a settings schema, so the sidebar edits its words,
 * pictures, colours and blocks like any other. Products, collections, menus,
 * the cart and pages stay Storelib's live data (the writer's integration
 * gate refuses a menu typed in by hand or products made up).
 *
 * Pure apart from the coder, which is handed in, so tests run it with fakes.
 */
import { validateSection } from "@/lib/storelib-ai"
import type { AgentProvider, ProviderRequest, ProviderTurn, TokenUsage } from "@/lib/sites/agent/types"
import { ZERO_USAGE, addUsage } from "@/lib/sites/agent/types"
import { buildSection, declaredChromeKind, fieldsFor, type ThemeOp } from "../agent/operations"
import type { SchemaMap } from "../agent/schemas"
import { schemaOf } from "../agent/schemas"
import { imageSlots, type SitePlan, type SitePlanSection } from "../agent/site-plan"
import { schemasFromSources } from "../storelib-schemas"
import { SECTION_SCHEMAS } from "../section-schemas"
import { pagePath } from "../site-pages"
import type { SectionInstance, SectionSchema } from "../types"
import type { Menu } from "@/lib/storelib-theme/values"
import { ANY_PAGE, type PageOp, type PlacedSection, type SiteState } from "./apply"
import { STUDIO_CRAFT } from "./craft"
import { schemaProblem, sourceProblem } from "./gate"
import type { ModelRef } from "./models"

export type CodeRole = "header" | "footer" | "section"

/** One file to write: the header, the footer, or a custom section at its place in the plan. */
export interface CodeTask {
  /** "header", "footer", or "<page>:<index in the plan's page>". */
  key: string
  role: CodeRole
  name: string
  brief: string
  page: string | null
  index: number | null
  /** Picture subjects the plan chose for this section, for the photo step. */
  pictures: string[]
}

/** A file that was written, accepted and saved. The schema is kept so later steps need not read the file. */
export interface CodedSection {
  key: string
  role: CodeRole
  type: string
  name: string
  path: string
  schema: SectionSchema
}

/** How many files are written at once. Each is several model calls of its own. */
export const CODE_CONCURRENCY = 4
/** How many times one file is tried before the site goes on without it. */
export const CODE_TRIES = 2
/** A new file is not started with less time than this left in the request: a file cut off is a file lost. */
export const CODE_START_RESERVE_MS = 100_000

/** Where a coded section's file lives: one folder, one name, nothing else. */
export const CODED_PATH = /^sections\/[a-z0-9_]{1,64}\.storelib$/

/* What a written file may never contain, and what its schema must give an owner, are ./gate.ts: the agent's write_file holds a file to the same rules (round AQ). */

/* ── the tasks ────────────────────────────────────────────────────────── */

const DEFAULT_HEADER = "A header designed for this brand, not a template: the logo or brand name, the site's menu, and on a phone a menu that opens. Sticky only if the site is long."
const DEFAULT_FOOTER = "A footer that closes the site in its own voice: the brand, the site's menu, a short line on how to get in touch, and the year."

/** Everything the coder writes for this plan, header and footer first. Pure. */
export function codeTasks(plan: SitePlan): CodeTask[] {
  const tasks: CodeTask[] = [
    { key: "header", role: "header", name: `${plan.brand.name || "Site"} header`.trim(), brief: plan.chrome?.header || DEFAULT_HEADER, page: null, index: null, pictures: [] },
    { key: "footer", role: "footer", name: `${plan.brand.name || "Site"} footer`.trim(), brief: plan.chrome?.footer || DEFAULT_FOOTER, page: null, index: null, pictures: [] },
  ]
  for (const page of plan.pages) {
    page.sections.forEach((s, i) => {
      if (s.type !== "custom") return
      tasks.push({
        key: `${page.key}:${i}`,
        role: "section",
        name: s.name || s.purpose.slice(0, 40) || "Section",
        brief: [s.purpose, s.content, s.scheme !== "light" ? `On the ${s.scheme === "dark" ? "dark" : "alternate"} colour band.` : ""].filter(Boolean).join(" "),
        page: page.key,
        index: i,
        pictures: s.images.map((im) => im.query),
      })
    })
  }
  return tasks
}

/* ── the brief each file is written from ──────────────────────────────── */

export interface CodeContext {
  plan: SitePlan
  /** describeCapabilities(caps): the only facts the site may use. */
  capsText: string
  /** The store sells something: the header carries the cart. */
  shop: boolean
  /** The menu the header and footer read (this site's own pages). */
  menuHandle: string
  /** The client's own words. */
  prompt: string
}

function roleBrief(task: CodeTask, ctx: CodeContext): string {
  if (task.role === "header") {
    return [
      `WRITE THE SITE'S HEADER. Its schema says "kind": "header". It is on every page.`,
      `- The brand: theme.logo when there is one, else the brand name "${ctx.plan.brand.name}" as styled text. It links to {{ routes.root_url }}.`,
      `- The site's menu: { "type": "link_list", "id": "menu", "label": "Menu", "default": "${ctx.menuHandle}" }, looped {% for link in settings.menu.links %} with {% for child in link.links %} for sub links. Never type the links out.`,
      `- On a phone the links fold into a menu that opens and closes (data-storelib-menu), usable with a thumb and a keyboard.`,
      ctx.shop ? `- The shop sells products: a cart link with data-storelib-cart and the item count, and a search link with data-storelib-search.` : `- The store sells nothing yet: no cart, no search.`,
      `- Settings for what an owner changes: colour scheme, logo width, sticky on or off, layout. Nothing else.`,
    ].join("\n")
  }
  if (task.role === "footer") {
    return [
      `WRITE THE SITE'S FOOTER. Its schema says "kind": "footer". It is on every page.`,
      `- The site's menu: { "type": "link_list", "id": "menu", "label": "Menu", "default": "${ctx.menuHandle}" }, looped {% for link in settings.menu.links %}.`,
      `- The brand name, one line in the brand's voice, and how to reach them, each a text setting. A copyright line with the year as a setting.`,
      `- Settings: colour scheme and layout. Never a newsletter form unless the brief asks for one.`,
    ].join("\n")
  }
  return [
    `WRITE ONE SECTION OF THE ${task.page === "home" ? "HOME" : `"${task.page}"`.toUpperCase()} PAGE: "${task.name}".`,
    `What it is for and what it shows: ${task.brief}`,
    task.pictures.length
      ? `Pictures: ${task.pictures.length === 1 ? "one" : task.pictures.length} image_picker setting${task.pictures.length === 1 ? "" : "s"} (default "") with an alt text setting each. The builder fills them with real photos of: ${task.pictures.map((p) => `"${p}"`).join(", ")}. Never an <img> with an address typed in.`
      : `No pictures unless the brief needs one; then an image_picker setting (default ""), never an address typed in.`,
    `Repeating things (steps, programs, questions, plans) are blocks with their own settings, so the owner adds, removes and reorders them, with three to six written blocks in the preset.`,
  ].join("\n")
}

/** The request one file is written from: the site, the facts, this part, the studio's rules. Pure. */
export function codePrompt(task: CodeTask, ctx: CodeContext, extra = ""): string {
  const p = ctx.plan
  const pages = p.pages.map((pg) => `  ${pagePath(pg.key)}: ${pg.title}. ${pg.purpose}`).join("\n")
  return [
    `You are coding part of a complete new website for a client, in Storelib's section format, as a senior designer who writes code. The site is designed for this business alone; nothing of the theme's look is required.`,
    `THE CLIENT'S OWN WORDS\n${ctx.prompt.trim()}`,
    `THE SITE\nBrand: ${p.brand.name}${p.brand.tagline ? `, "${p.brand.tagline}"` : ""}\nFor: ${p.audience}\nThe one action: ${p.conversion}\nVoice: ${p.voice.tone}${p.voice.use.length ? `; words to use: ${p.voice.use.join(", ")}` : ""}${p.voice.avoid.length ? `; never: ${p.voice.avoid.join(", ")}` : ""}\nArt direction: ${p.palette.direction || "the theme's palette"}; type ${p.typography.heading} for headings, ${p.typography.body} for text; pictures: ${p.imagery}`,
    `ITS PAGES\n${pages}`,
    `WHAT IS REAL (the only facts the site may state)\n${ctx.capsText}`,
    roleBrief(task, ctx),
    [
      `EDITABLE, ALWAYS: every word a visitor reads is a setting (text, textarea or richtext) whose default is the FINAL copy for this site, written in the brand's voice, never a placeholder. Colours come from the colour scheme (a color_scheme setting) so the owner's palette repaints it. Spacing top and bottom are range settings. The section must look finished with its defaults.`,
      `LIVE DATA, NEVER TYPED: products from {% for block in products %}, collections, the menu from a link_list, the cart through data-storelib-cart. No product, price, review, quote, statistic or name that is not in WHAT IS REAL.`,
      `MOBILE FIRST: written for a phone, then wider screens. Nothing scrolls sideways. Respect prefers-reduced-motion.`,
    ].join("\n"),
    STUDIO_CRAFT,
    extra ? `THE LAST FILE FOR THIS PART WAS REFUSED; fix exactly this:\n${extra}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/* ── accepting a file ─────────────────────────────────────────────────── */

export type Accepted = { ok: true; type: string; name: string; path: string; schema: SectionSchema } | { ok: false; reason: string }

/**
 * The file as written, checked as if nobody had checked it: the path, the
 * strict compile and quality gate, the schema, its kind, its words and what
 * it may not contain. Pure.
 */
export function acceptCoded(source: string, opts: { role: CodeRole; takenTypes: readonly string[] }): Accepted {
  const text = (source ?? "").trim()
  if (!text) return { ok: false, reason: "The file was empty." }
  if (text.length > 120_000) return { ok: false, reason: "The file is too long for one section." }
  const unsafe = sourceProblem(text)
  if (unsafe) return { ok: false, reason: unsafe.message }
  const declared = /"type"\s*:\s*"([a-z0-9_]{1,64})"/.exec(text)
  if (!declared) return { ok: false, reason: 'The schema needs a "type": lower case letters, digits and underscores.' }
  const type = declared[1]
  const path = `sections/${type}.storelib`
  if (!CODED_PATH.test(path)) return { ok: false, reason: "The file's name is not a section's." }
  if (type in SECTION_SCHEMAS || opts.takenTypes.includes(type)) return { ok: false, reason: `"${type}" is already a section on this site. Give it a name of its own.` }
  const checked = validateSection(text, { path, expectType: type, strict: true })
  if (checked.ok === false) return { ok: false, reason: checked.feedback.slice(0, 800) }
  const schema = schemasFromSources({ [path]: text })[type]
  if (!schema) return { ok: false, reason: "Its schema could not be read." }
  const held = schemaProblem(schema, { role: opts.role })
  if (held) return { ok: false, reason: held.message }
  return { ok: true, type, name: schema.name || type, path, schema }
}

/* ── the coder ────────────────────────────────────────────────────────── */

export type CodeAnswer = { ok: true; source: string } | { ok: false; error: string; aborted?: boolean }

export interface SectionCoder {
  /** The model the coder writes with, for the job's record of what it spent. */
  model: string
  write(task: CodeTask, prompt: string, opts: { takenTypes: string[]; takenNames: string[]; settings: Record<string, unknown>; signal?: AbortSignal; deadlineAt?: number; onUsage?: (usage: TokenUsage) => void }): Promise<CodeAnswer>
}

/** A provider that reports what each call cost, so the job's spend includes its files. */
function counted(provider: AgentProvider, onUsage?: (u: TokenUsage) => void): AgentProvider {
  if (!onUsage) return provider
  return {
    ...provider,
    async complete(req: ProviderRequest): Promise<ProviderTurn> {
      const turn = await provider.complete(req)
      onUsage(turn.usage ?? ZERO_USAGE)
      return turn
    },
  }
}

/**
 * The real coder: the code editor's section writer (plan, write, compile and
 * draw, review, refine once) on the job's strongest model. Lazy import, so a
 * test that hands in its own coder never loads the writer's dependencies.
 */
export function writerCoder(ref: ModelRef, cacheKey: string): SectionCoder {
  return {
    model: ref.model,
    async write(task, prompt, opts) {
      const { writeSection } = await import("../agent/write-section")
      const r = await writeSection({
        provider: counted(ref.provider, opts.onUsage),
        model: ref.model,
        effort: ref.effort ?? "medium",
        prompt,
        takenTypes: opts.takenTypes,
        takenNames: opts.takenNames,
        theme: { settings: opts.settings as never },
        cacheKey,
        signal: opts.signal,
        deadlineAt: opts.deadlineAt,
      })
      if (r.ok === true) return { ok: true, source: (r as { value: { source: string } }).value.source }
      const no = r as { error: string; reply?: string }
      return { ok: false, error: no.reply ? `It answered instead of writing: ${no.reply}` : no.error, aborted: !!opts.signal?.aborted }
    },
  }
}

/** Sums usage reports, for tests and the job's spend. */
export function sumUsage(list: TokenUsage[]): TokenUsage {
  return list.reduce((a, b) => addUsage(a, b), ZERO_USAGE)
}

/* ── placing what was coded ───────────────────────────────────────────── */

/** The schemas later steps read: the theme's and every coded file's. */
export function withCoded(schemas: SchemaMap | undefined, coded: readonly CodedSection[]): SchemaMap {
  const base = schemas ?? SECTION_SCHEMAS
  if (!coded.length) return base
  const out: SchemaMap = { ...base }
  for (const c of coded) out[c.type] = { ...c.schema, type: c.type }
  return out
}

/**
 * The plan with each custom section given the type it was coded as, and its
 * picture briefs moved onto that file's own picture settings. A custom
 * section that could not be coded stays "custom" and is never placed. Pure.
 */
export function resolvePlan(plan: SitePlan, coded: readonly CodedSection[], schemas: SchemaMap): SitePlan {
  const byKey = new Map(coded.map((c) => [c.key, c]))
  return {
    ...plan,
    pages: plan.pages.map((page) => ({
      ...page,
      sections: page.sections.map((s, i): SitePlanSection => {
        if (s.type !== "custom") return s
        const c = byKey.get(`${page.key}:${i}`)
        if (!c) return s
        const slots = imageSlots(c.type, schemas)
        const all = [...slots.fields, ...slots.blocks.map((b) => `block:${b}`)]
        const images = s.images.slice(0, all.length).map((im, n) => ({ ...im, slot: all[n] }))
        return { ...s, type: c.type, name: c.name, images }
      }),
    })),
  }
}

/** The menu this site's header and footer read: its own pages, and the shop when it sells. */
export function siteMenu(plan: SitePlan, shop: boolean): Menu {
  const links = plan.pages.map((p) => ({ title: p.key === "home" ? "Home" : p.title, url: pagePath(p.key) }))
  if (shop) links.splice(1, 0, { title: "Shop", url: "/products" })
  return { title: `${plan.brand.name || "Site"} menu`.slice(0, 60), links: links.slice(0, 12) }
}

/** The handle of a site's own menu: one per website, never another site's. */
export function siteMenuHandle(installId: string): string {
  return `site-${installId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "ai"}`
}

/**
 * The operations that put the coded sections on their pages, in the plan's
 * order, and the coded header and footer in place of the theme's on every
 * page. `placed` is what the build already placed; the new ones are returned
 * to be added to it. Pure.
 */
export function placementOps(input: {
  site: SiteState
  plan: SitePlan
  coded: readonly CodedSection[]
  placed: readonly PlacedSection[]
  schemas: SchemaMap
  idSeed: string
  menuHandle: string | null
}): { ops: PageOp[]; placed: PlacedSection[]; notes: string[] } {
  const { site, plan, coded, schemas, idSeed } = input
  const ops: PageOp[] = []
  const placed: PlacedSection[] = []
  const notes: string[] = []
  const byKey = new Map(coded.map((c) => [c.key, c]))
  const known = [...input.placed]

  for (const page of plan.pages) {
    const sections = [...(site.pages[page.key] ?? [])]
    if (!site.pages[page.key]) continue
    page.sections.forEach((s, i) => {
      const c = byKey.get(`${page.key}:${i}`)
      if (!c || c.role !== "section") return
      const id = `${c.type}-${idSeed}`
      if (sections.some((x) => x.id === id)) {
        placed.push({ page: page.key, id, type: c.type, plan: i })
        return
      }
      /* Before the next section of the plan already on the page, else just above the footer. */
      const next = [...known, ...placed].filter((p) => p.page === page.key && p.plan > i).sort((a, b) => a.plan - b.plan)[0]
      const nextAt = next ? sections.findIndex((x) => x.id === next.id) : -1
      const footerAt = sections.findIndex((x) => x.type === "footer" || (x as { group?: string }).group === "footer")
      const index = nextAt >= 0 ? nextAt : footerAt >= 0 ? footerAt : sections.length
      const built = buildSection(id, c.type, schemas)
      if (!built) {
        notes.push(`${c.name} could not be placed.`)
        return
      }
      const scheme = s.scheme !== "light" && fieldsFor(c.type, schemas).some((f) => f.id === "color_scheme") ? schemeKey(site, s.scheme) : null
      const settings = scheme ? { color_scheme: scheme } : undefined
      ops.push({ page: page.key, op: { kind: "add_section", id, sectionType: c.type, index, ...(settings ? { settings } : {}), section: settings ? { ...built, settings: { ...built.settings, ...settings } } : built } })
      sections.splice(index, 0, built)
      placed.push({ page: page.key, id, type: c.type, plan: i })
    })
  }

  /* The frame: the coded header and footer on every page, the theme's taken away. */
  const home = site.pages.home ?? []
  for (const role of ["header", "footer"] as const) {
    const c = byKey.get(role)
    if (!c) continue
    const id = `${c.type}-${idSeed}`
    const menuField = (schemaOf(schemas, c.type)?.fields ?? []).find((f) => f.type === "link_list")
    const settings = input.menuHandle && menuField ? { [menuField.id]: input.menuHandle } : undefined
    const built = buildSection(id, c.type, schemas)
    if (!built) continue
    if (!home.some((x) => x.id === id)) {
      ops.push({ page: ANY_PAGE, op: { kind: "add_section", id, sectionType: c.type, ...(settings ? { settings } : {}), section: { ...built, ...(settings ? { settings: { ...built.settings, ...settings } } : {}), group: role } as SectionInstance } })
    }
    for (const old of home.filter((x) => x.id !== id && (x.type === role || ((x as { group?: string }).group === role && declaredChromeKind(schemaOf(schemas, x.type)) === role)))) {
      ops.push({ page: ANY_PAGE, op: { kind: "remove_section", id: old.id } })
    }
  }
  return { ops, placed, notes }
}

/** The colour scheme key for a band: the preset's dark or alternate scheme when the theme names them. */
function schemeKey(site: SiteState, band: "light" | "dark" | "alt"): string | null {
  const schemes = site.settings.color_schemes
  if (!schemes || typeof schemes !== "object") return null
  const keys = Object.keys(schemes as Record<string, unknown>)
  if (!keys.length) return null
  const want = band === "dark" ? /dark|inverse|ink|night|contrast/i : /alt|accent|surface|muted|soft|secondary/i
  return keys.find((k) => want.test(k) || want.test(String((schemes as Record<string, { name?: unknown }>)[k]?.name ?? ""))) ?? null
}

/** The op list type, re-exported for callers that build their own. */
export type { ThemeOp }
