/**
 * ===========================================================================
 *  THE AGENT'S TOOLS, BOUND TO ONE JOB
 * ===========================================================================
 * `createToolSet(ctx)` gives the 17 tools of the contract
 * (lib/ai-builder/agent-tools.ts), every one bound to the job's install
 * through ctx.deps.store: no tool takes an install id, a creator id or a path
 * outside the install, so the model cannot name another tenant's anything.
 *
 * Permissions, in code rather than in the prompt:
 *   • files: only ^(sections|blocks|snippets)/ai_*.storelib is writable
 *     (WRITABLE_PATH); everything else is read only
 *   • a new website's first write waits for the visual concept
 *   • a file is compiled and checked before it is kept; a refused write
 *     counts toward maxRepairsPerFile, past which the file is left alone
 *   • a write to a file the job did not read (or that moved since) is a
 *     conflict: the creator's edit wins and the agent reads again
 *   • bindings take only ids list_capabilities returned
 *   • blank mode places only ai_ components (no built-in header/footer)
 *   • every write is a draft, authored "ai", tagged with the job id
 *
 * `finish` is answered by the loop (it runs the verify phase).
 */
import { sanitizeSections, ownSectionFields } from "@/lib/website-builder/sanitize-sections"
import { pagePath, pageTitleFromKey, isPageKey, RESERVED_PAGE_KEYS } from "@/lib/website-builder/site-pages"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { controlFor } from "@/lib/storelib-theme/controls/registry"
import { outOfAttempts } from "@/lib/website-builder/agent/compile-feedback"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { BlockInstance, SectionInstance } from "@/lib/website-builder/types"
import { manifestToSchema, BINDING_CONTROL, withManifest as mergeManifest } from "../manifest"
import { WRITABLE_PATH, type AgentToolInputs, type AgentToolOutputs, type PlacedSectionInput, type ToolSet } from "../agent-tools"
import type { RuntimeCapabilities } from "../runtime-contract"
import { isAiComponentType, type AgentEvent, type AgentPhase, type ComponentManifest, type DataBindingKind, type FileWriteResult, type ValidationIssue } from "../types"
import type { AgentDeps, AgentJobInput, StoredPage } from "./ports"
import { describeConcept, readConcept } from "./concept"
import { conceptClicheIssues } from "../slop"
import { libraryKnowledge } from "./knowledge"
import { renderCheckPage } from "./render-check"
import { addUnique, type LoopCheckpoint } from "./state"
import { tokensToThemeSettings } from "./tokens"
import { designSettingsWrite } from "../site-settings"
import { isSlopDisplayFont } from "@/lib/storelib-ai/library/type-systems"
import { schemaInfo, siteRoutes, typeOfPath, unknownBindingIds, validateFile, validateSite, errorsOf } from "./validate"
import { describeSitePlan, isTemplateKey, readSitePlan, templatesFor } from "./site-plan"
import { versionOf } from "./version"
import { conceptDirectionIssues, contractMetaAfter, refineBrief, syncContractFile, writeContract } from "./direction"
import { protectOverrides } from "../design-contract"
import { presetParts } from "./content-check"

/** Whether form bindings are drawn by the editor: what the job says, else whether the control registry has form_picker (L4). */
export function formPickerOn(deps: Pick<AgentDeps, "features">): boolean {
  return deps.features?.formPicker ?? !!controlFor("form_picker")
}

export const MAX_FILE_BYTES = 64 * 1024
/** What read_file hands back at most. A component file is far smaller. */
const MAX_READ_CHARS = 60_000
const CHROME_GROUPS = new Set(["header", "footer"])

export const NO_CAPABILITIES: RuntimeCapabilities = {
  store: { name: "", currency: "USD", brandImage: null, tagline: null },
  products: [],
  collections: [],
  communities: [],
  forms: [],
  pages: [],
  menus: [],
  blog: { posts: 0 },
  reviews: { count: 0, average: null },
  links: { creatorPage: null, social: [] },
  features: [],
}

/** An event without its number and time: the loop stamps those. */
export type EventDraft = AgentEvent extends infer E ? (E extends AgentEvent ? Omit<E, "seq" | "at"> : never) : never

export interface ToolContext {
  job: AgentJobInput
  deps: AgentDeps
  cp: LoopCheckpoint
  emit: (event: EventDraft) => void
  /** The loop answers finish (verify phase). */
  onFinish: (input: AgentToolInputs["finish"]) => Promise<AgentToolOutputs["finish"]>
  setPhase: (phase: AgentPhase, label: string) => void
}

const SCHEMA_BLOCK = /<schema>[\s\S]*?<\/schema>/

/**
 * The file with the manifest written in as its <schema>. A schema already in the content is merged, not
 * replaced (round P): its presets (the filled items a placement starts with) and keys the manifest does not
 * describe are kept (manifest.ts mergeManifest).
 */
export function withManifest(content: string, manifest: ComponentManifest): string {
  const merged = SCHEMA_BLOCK.test(content) ? mergeManifest(content, manifest) : null
  if (merged) return merged
  const schema = `<schema>\n${JSON.stringify(manifestToSchema(manifest), null, 2)}\n</schema>`
  return SCHEMA_BLOCK.test(content) ? content.replace(SCHEMA_BLOCK, schema) : `${content.trimEnd()}\n\n${schema}\n`
}

export function createToolSet(ctx: ToolContext): ToolSet {
  const { deps, job, cp } = ctx
  const store = deps.store

  /* ── shared reads ──────────────────────────────────────────────────── */

  async function sources(): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    for (const f of await store.listFiles()) if (f.text.trim()) out[f.path] = f.text
    return out
  }

  async function caps(): Promise<RuntimeCapabilities> {
    if (cp.caps === undefined) cp.caps = (await deps.capabilities().catch(() => null)) ?? null
    return cp.caps ?? NO_CAPABILITIES
  }

  /* An edit, or a redesign that only makes the changes asked (round M), works on the site as it is: no concept first. */
  const needsConcept = () => !job.edit && job.redesign !== "changes" && !cp.concept
  const conceptFirst = "Hand in the visual concept first: report_progress with phase \"plan\" and a concept (name, mood, styles, typeSystem, palette, layout, motion, imagery, signatureMoves). Nothing was changed."
  /* Round N (N3): a NEW website also hands in its site plan (every page and template with its sections) before it builds. */
  const needsPlan = () => !job.edit && !job.redesign && !cp.sitePlan
  const planFirst = "Hand in the site plan first: report_progress with phase \"plan\" and pages, every page and template with its sections ({ key, sections: [one line each], reason? }); list_pages shows the templates. Nothing was changed."
  /** Why a write must wait, or null when it may go ahead. */
  const blocked = (): { code: string; message: string } | null => (needsConcept() ? { code: "plan.concept_missing", message: conceptFirst } : needsPlan() ? { code: "plan.site_missing", message: planFirst } : null)

  function instancesOf(type: string, pages: StoredPage[]): SectionInstance[] {
    return pages.flatMap((p) => p.sections.filter((s) => s.type === type))
  }

  /* ── files ─────────────────────────────────────────────────────────── */

  async function commitFile(path: string, content: string): Promise<FileWriteResult & { warnings?: ValidationIssue[]; message?: string }> {
    if (!WRITABLE_PATH.test(path)) return { ok: false, path, reason: "forbidden_path", issues: [{ severity: "error", code: "path.forbidden", message: `You may write only sections/ai_<slug>.storelib, blocks/ai_<slug>.storelib or snippets/ai_<slug>.storelib. ${path} is read only.`, path }] }
    const wait = blocked()
    if (wait) return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: wait.code, message: wait.message, path }] }
    const attempts = cp.repairs[path] ?? 0
    if (attempts >= job.budget.maxRepairsPerFile) return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: "repair.exhausted", message: outOfAttempts(path), path }] }
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) return { ok: false, path, reason: "too_large", issues: [{ severity: "error", code: "file.too_large", message: `A component file is at most ${MAX_FILE_BYTES / 1024} KB. Split it into a section and blocks.`, path }] }

    const current = await store.readFile(path)
    const currentVersion = current ? versionOf(current.text) : null
    if (current && cp.known[path] !== currentVersion) {
      return { ok: false, path, reason: "conflict", issues: [{ severity: "error", code: "file.conflict", message: cp.known[path] ? `${path} changed since you read it (the creator edited it). Read it again and redo your change on what is there now.` : `${path} already exists. Read it before you change it.`, path }] }
    }
    const [all, pages, theme, c] = await Promise.all([sources(), store.listPages(), store.readSettings(), caps()])
    const issues = validateFile(path, content, {
      caps: c,
      instances: instancesOf(typeOfPath(path), pages),
      theme,
      sources: all,
      before: current?.text ?? null,
      lenient: attempts >= 2,
      formPicker: formPickerOn(deps),
      brief: job.prompt,
    })
    const errors = errorsOf(issues)
    if (errors.length) {
      cp.repairs[path] = attempts + 1
      ctx.emit({ kind: "repair", path, attempt: attempts + 1 })
      const left = job.budget.maxRepairsPerFile - attempts - 1
      return { ok: false, path, reason: "invalid", issues: errors, message: `Not saved. ${left > 0 ? `Fix exactly these and send the file again (${left} attempt${left === 1 ? "" : "s"} left for this file).` : outOfAttempts(path)}` }
    }
    const saved = await store.writeFile(path, content, { expectedVersion: currentVersion, author: "ai", jobId: job.jobId })
    if (saved.ok === false) {
      if (saved.conflict) return { ok: false, path, reason: "conflict", issues: [{ severity: "error", code: "file.conflict", message: `${path} changed while you were writing it. Read it again.`, path }] }
      return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: "file.save", message: `${path} could not be saved: ${saved.error.slice(0, 200)}`, path }] }
    }
    const version = versionOf(content)
    cp.known[path] = version
    cp.filesTouched = addUnique(cp.filesTouched, path)
    if (saved.created) cp.created = addUnique(cp.created, path)
    ctx.emit({ kind: "file", path, action: current ? "updated" : "created", bytes: Buffer.byteLength(content, "utf8") })
    const warnings = issues.filter((i) => i.severity === "warning").slice(0, 6)
    return { ok: true, path, version, ...(warnings.length ? { warnings } : {}) }
  }

  /* ── pages ─────────────────────────────────────────────────────────── */

  async function pageMap(): Promise<Map<string, SectionInstance[]>> {
    return new Map((await store.listPages()).map((p) => [p.key, p.sections]))
  }

  const isChrome = (s: SectionInstance) => CHROME_GROUPS.has(String(s.group ?? "")) || s.type === "header" || s.type === "footer"

  function mintId(type: string): string {
    cp.ids += 1
    return `${type.slice(0, 40)}-${job.jobId.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}-${cp.ids}`
  }

  /** Settings kept to the ids the schema has; binding values checked against real data. */
  function cleanSettings(type: string, given: Record<string, unknown> | undefined, fields: { id: string; type: string }[], c: RuntimeCapabilities, pageKeys: string[], menus: string[], where: string): { settings: Record<string, unknown>; issues: ValidationIssue[] } {
    const issues: ValidationIssue[] = []
    const settings: Record<string, unknown> = {}
    const byId = new Map(fields.map((f) => [f.id, f.type]))
    for (const [k, v] of Object.entries(given ?? {})) {
      const control = byId.get(k)
      if (!control) {
        issues.push({ severity: "warning", code: "settings.unknown", message: `${where}: ${type} has no setting "${k}"; it was left out.` })
        continue
      }
      if (control === "form_picker" && !formPickerOn(deps)) {
        issues.push({ severity: "error", code: "binding.form_unavailable", message: `${where}: forms cannot be bound yet. Link to the form's page instead.` })
        continue
      }
      const bad = unknownBindingIds(control, v, c, pageKeys, menus)
      if (bad.length) {
        issues.push({ severity: "error", code: "binding.unknown_id", message: `${where}: "${k}" names ${bad.join(", ")}, which this store does not have. Use ids from list_capabilities.` })
        continue
      }
      settings[k] = v
    }
    return { settings, issues }
  }

  /** The page written, and site-wide chrome mirrored to every page as the editor keeps it. */
  async function savePages(changed: Map<string, SectionInstance[]>, all: Map<string, SectionInstance[]>, chromeChanged: boolean) {
    const files = (await store.listFiles()).map((f) => ({ path: f.path, draft_content: f.text }))
    const own = ownSectionFields(files)
    const out: StoredPage[] = []
    if (chromeChanged) {
      const home = changed.get("home") ?? all.get("home") ?? []
      const chrome = home.filter((s) => CHROME_GROUPS.has(String(s.group ?? "")))
      for (const [key, sections] of all) {
        if (key === "home") continue
        const base = changed.get(key) ?? sections
        const body = base.filter((s) => !CHROME_GROUPS.has(String(s.group ?? "")))
        changed.set(key, [...chrome.filter((s) => s.group === "header"), ...body, ...chrome.filter((s) => s.group === "footer")])
      }
    }
    for (const [key, sections] of changed) out.push({ key, sections: sanitizeSections(sections, own) })
    await store.writePages(out)
  }

  async function placeSections(input: AgentToolInputs["set_page_sections"]): Promise<AgentToolOutputs["set_page_sections"]> {
    const wait = blocked()
    if (wait) return { ok: false, ids: [], issues: [{ severity: "error", code: wait.code, message: wait.message }] }
    const all = await pageMap()
    /*
      A TEMPLATE IS A PAGE THE AGENT DESIGNS (round N, N3): product, collection, the shop, search, cart, 404,
      contact and the blog's two are placed on by key even before they are stored; the first placement makes
      the row, with home's header and footer as add_page does. They are not added to the menu: a visitor reaches
      them through a product, a collection, the cart button, a search.
    */
    const homeChrome = (all.get("home") ?? []).filter((s) => CHROME_GROUPS.has(String(s.group ?? "")))
    const newTemplate = !all.has(input.page) && isTemplateKey(input.page)
    const current = all.get(input.page) ?? (newTemplate ? [...homeChrome.filter((s) => s.group === "header"), ...homeChrome.filter((s) => s.group === "footer")] : undefined)
    if (!current) return { ok: false, ids: [], issues: [{ severity: "error", code: "page.missing", message: `There is no page "${input.page}". Add it with add_page first (templates such as product or collection need no add_page).` }] }
    const [src, c, settings] = await Promise.all([sources(), caps(), store.readSettings()])
    const pageKeys = [...all.keys()]
    const menus = Object.keys((settings.menus as Record<string, unknown>) ?? {})
    const issues: ValidationIssue[] = []
    const existing = new Map<string, SectionInstance>()
    for (const sections of all.values()) for (const s of sections) existing.set(s.id, s)
    const body: SectionInstance[] = []
    const chrome: SectionInstance[] = []
    const ids: string[] = []
    const seen = new Set<string>()
    for (const [i, raw] of (input.sections ?? []).entries()) {
      const p = raw as PlacedSectionInput
      const where = `${input.page} #${i + 1}`
      if (!p || typeof p.type !== "string") {
        issues.push({ severity: "error", code: "page.section", message: `${where}: a section needs a type.` })
        continue
      }
      if (job.mode === "blank" && !isAiComponentType(p.type)) {
        issues.push({ severity: "error", code: "chrome.builtin", message: `${where}: "${p.type}" is a built-in theme section. A blank website is made of your own ai_ components.` })
        continue
      }
      const info = schemaInfo(p.type, src)
      if (!info) {
        issues.push({ severity: "error", code: "page.unknown_type", message: `${where}: there is no section "${p.type}". Write sections/${p.type}.storelib first.` })
        continue
      }
      const group = p.group && ["header", "footer", "overlay"].includes(p.group) ? p.group : undefined
      if (group && group !== "overlay" && info.kind !== group && !(info.groups ?? []).includes(group)) {
        issues.push({ severity: "error", code: "chrome.kind", message: `${where}: ${p.type} is not a ${group}. Its schema needs "kind": "${group}" and "enabled_on": { "groups": ["${group}"] }.` })
        continue
      }
      const keep = p.id && existing.get(p.id)?.type === p.type ? existing.get(p.id)! : null
      const id = keep && !seen.has(keep.id) ? keep.id : mintId(p.type)
      seen.add(id)
      const cleaned = cleanSettings(p.type, p.settings, info.settings, c, pageKeys, menus, where)
      issues.push(...cleaned.issues)
      /*
        The component's own scheme, saved on the instance. A section with no saved scheme is drawn in the
        theme's default one whatever its schema's default says (lib/storelib-theme/render.ts, on purpose for
        theme sections), so a footer written for `site_inverse` and placed without settings drew light
        (found by tests/ai-builder-journey.test.ts). A new placement keeps what its author asked for.
      */
      if (!keep) {
        const scheme = (info.settings as { id: string; type: string; default?: unknown }[]).find((f) => f.type === "color_scheme")
        if (scheme && cleaned.settings[scheme.id] === undefined && typeof scheme.default === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(scheme.default)) cleaned.settings[scheme.id] = scheme.default
      }
      const blocks: BlockInstance[] = []
      for (const b of p.blocks ?? []) {
        const fields = info.blocks[b.type]
        if (!fields) {
          issues.push({ severity: "error", code: "page.block", message: `${where}: ${p.type} has no block type "${b.type}".` })
          continue
        }
        const bc = cleanSettings(`${p.type} block ${b.type}`, b.settings, fields, c, pageKeys, menus, where)
        issues.push(...bc.issues)
        const prior = keep?.blocks?.find((x) => x.id === b.id && x.type === b.type)
        blocks.push({ id: prior?.id ?? mintId(b.type), type: b.type, settings: bc.settings })
      }
      const name = (() => {
        const text = src[`sections/${p.type}.storelib`]
        const compiled = text ? compileSection(text, { file: `sections/${p.type}.storelib` }) : null
        return compiled && compiled.ok ? compiled.value.schema.name : keep?.name ?? pageTitleFromKey(p.type.replace(/_/g, "-"))
      })()
      /*
        ROUND P (P5): A NEW PLACEMENT THAT SENDS NO BLOCKS STARTS FROM THE SCHEMA'S FIRST PRESET, as Add section does
        for a person (lib/website-builder/ai-placement.ts instanceFromSchema). It used to start with none: a section
        placed without its items drew its heading and nothing else (Andrew's "Who it is for and not for" with one
        block, others empty). Blocks the agent sends are its own and are kept as sent; `blocks: []` means none.
      */
      let placedBlocks = p.blocks === undefined && keep ? keep.blocks ?? [] : blocks
      let placedSettings = p.settings === undefined && keep ? keep.settings : cleaned.settings
      if (!keep && p.blocks === undefined) {
        const preset = presetParts(p.type, src, mintId)
        if (preset) {
          placedBlocks = preset.blocks
          placedSettings = { ...preset.settings, ...placedSettings }
          issues.push({ severity: "warning", code: "blocks.from_preset", message: `${where}: ${p.type} was placed with its preset's ${preset.blocks.length} item${preset.blocks.length === 1 ? "" : "s"}. Send blocks to give this placement its own.` })
        }
      }
      const section: SectionInstance = {
        id,
        type: p.type,
        name,
        settings: placedSettings,
        blocks: placedBlocks,
        ...(group ? { group } : {}),
        ...(p.hidden ? { hidden: true } : {}),
      }
      ;(group && group !== "overlay" ? chrome : body).push(section)
      ids.push(id)
    }
    if (errorsOf(issues).length) return { ok: false, ids: [], issues }
    for (const g of ["header", "footer"]) if (chrome.filter((s) => s.group === g).length > 1) return { ok: false, ids: [], issues: [{ severity: "error", code: "chrome.two", message: `Only one ${g} per site.` }] }

    const changed = new Map<string, SectionInstance[]>()
    const groupsSent = new Set(chrome.map((s) => String(s.group)))
    const headerOf = (list: SectionInstance[]) => list.filter((s) => isChrome(s) && (s.group === "header" || (!s.group && s.type === "header")))
    const footerOf = (list: SectionInstance[]) => list.filter((s) => isChrome(s) && (s.group === "footer" || (!s.group && s.type === "footer")))
    /*
      Chrome is site-wide and lives on home (universal-chrome.ts reads it
      there). A component sent for a group replaces that group's component;
      a built-in header/footer it replaces is hidden, never deleted
      (section-groups.ts: one of each drawn).
    */
    let home = all.get("home") ?? []
    if (chrome.length) home = home.filter((s) => !(s.group && groupsSent.has(String(s.group)))).map((s) => (!s.group && groupsSent.has(s.type) ? { ...s, hidden: true } : s))
    if (input.page === "home") {
      changed.set("home", [...headerOf(home), ...chrome.filter((s) => s.group === "header"), ...body, ...footerOf(home), ...chrome.filter((s) => s.group === "footer")])
    } else {
      if (chrome.length) changed.set("home", [...headerOf(home), ...chrome.filter((s) => s.group === "header"), ...home.filter((s) => !isChrome(s)), ...footerOf(home), ...chrome.filter((s) => s.group === "footer")])
      changed.set(input.page, [...headerOf(current), ...body, ...footerOf(current)])
    }
    await savePages(changed, all, chrome.length > 0)
    cp.pagesTouched = addUnique(cp.pagesTouched, input.page)
    if (chrome.length) cp.pagesTouched = addUnique(cp.pagesTouched, "home")
    ctx.emit({ kind: "page", page: input.page, title: pageTitleFromKey(input.page), action: newTemplate ? "created" : "updated", sections: body.length })
    const warnings = issues.filter((i) => i.severity === "warning")
    return { ok: true, ids, ...(warnings.length ? { issues: warnings } : {}) }
  }

  async function findSection(page: string, sectionId: string) {
    const all = await pageMap()
    const sections = all.get(page)
    if (!sections) return { error: `There is no page "${page}".` as const }
    const index = sections.findIndex((s) => s.id === sectionId)
    if (index < 0) return { error: `The page ${page} has no section ${sectionId}. list_pages shows the ids.` as const }
    return { all, sections, index, section: sections[index] }
  }

  async function updateSection(page: string, sectionId: string, patch: (s: SectionInstance, info: NonNullable<ReturnType<typeof schemaInfo>>, c: RuntimeCapabilities, pageKeys: string[], menus: string[]) => { settings?: Record<string, unknown>; issues: ValidationIssue[] }): Promise<{ ok: boolean; issues?: ValidationIssue[] }> {
    const wait = blocked()
    if (wait) return { ok: false, issues: [{ severity: "error", code: wait.code, message: wait.message }] }
    const found = await findSection(page, sectionId)
    if ("error" in found) return { ok: false, issues: [{ severity: "error", code: "page.section_missing", message: found.error ?? "" }] }
    const [src, c, settings] = await Promise.all([sources(), caps(), store.readSettings()])
    const info = schemaInfo(found.section.type, src)
    if (!info) return { ok: false, issues: [{ severity: "error", code: "page.unknown_type", message: `${found.section.type} has no schema.` }] }
    const r = patch(found.section, info, c, [...found.all.keys()], Object.keys((settings.menus as Record<string, unknown>) ?? {}))
    if (errorsOf(r.issues).length || !r.settings) return { ok: false, issues: r.issues }
    const next = [...found.sections]
    next[found.index] = { ...found.section, settings: { ...found.section.settings, ...r.settings } }
    const changed = new Map([[page, next]])
    await savePages(changed, found.all, page === "home" && CHROME_GROUPS.has(String(found.section.group ?? "")))
    cp.pagesTouched = addUnique(cp.pagesTouched, page)
    ctx.emit({ kind: "page", page, title: pageTitleFromKey(page), action: "updated", sections: next.length })
    const warnings = r.issues.filter((i) => i.severity === "warning")
    return { ok: true, ...(warnings.length ? { issues: warnings } : {}) }
  }

  /* Round O (O5): what the plan's home is checked against: the creator's words and the kind of website they picked. */
  const planBrief = { prompt: job.prompt, category: job.options?.category ?? null }

  /** Every problem with a site plan, as issues (code plan.site_invalid). */
  function siteIssues(pages: unknown, c: RuntimeCapabilities): ValidationIssue[] {
    const read = readSitePlan(pages, c, planBrief)
    return read.ok === true ? [] : read.missing.slice(0, 30).map((m) => ({ severity: "error" as const, code: "plan.site_invalid", message: m.slice(0, 400) }))
  }

  /* ── the tools ─────────────────────────────────────────────────────── */

  return {
    async list_files({ prefix }) {
      const files = await store.listFiles()
      return { files: files.filter((f) => !prefix || f.path.startsWith(prefix)).map((f) => ({ path: f.path, updatedAt: f.updatedAt })) }
    },

    async read_file({ path }) {
      if (typeof path !== "string" || path.includes("..")) return { path: String(path), missing: true }
      const f = await store.readFile(path)
      if (f) {
        const version = versionOf(f.text)
        cp.known[path] = version
        return { path, content: f.text.slice(0, MAX_READ_CHARS), version }
      }
      const theme = (DEFAULT_THEME_SOURCES as Record<string, string>)[path]
      if (theme) return { path, content: theme.slice(0, MAX_READ_CHARS), version: versionOf(theme) }
      return { path, missing: true }
    },

    async write_file({ path, content, manifest }) {
      if (typeof content !== "string") return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: "file.content", message: "content must be the whole file as text." }] }
      if (manifest) {
        if (manifest.type !== typeOfPath(path)) return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: "manifest.type", message: `manifest.type is "${manifest.type}" but the path is ${path}.` }] }
        try {
          content = withManifest(content, manifest)
        } catch {
          return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: "manifest.shape", message: "The manifest could not be read: props need kind, id and label." }] }
        }
      }
      return commitFile(path, content)
    },

    async edit_file({ path, old, new: replacement }) {
      const f = await store.readFile(path)
      if (!f) return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: "file.missing", message: `${path} does not exist. Use write_file to create it.` }] }
      if (!cp.known[path]) return { ok: false, path, reason: "conflict", issues: [{ severity: "error", code: "file.unread", message: `Read ${path} before you edit it.` }] }
      if (typeof old !== "string" || !old) return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: "edit.old", message: "old must be the exact text to replace." }] }
      const count = f.text.split(old).length - 1
      if (count !== 1) return { ok: false, path, reason: "invalid", issues: [{ severity: "error", code: count ? "edit.ambiguous" : "edit.not_found", message: count ? `That text occurs ${count} times in ${path}. Include more around it so it is unique.` : `That text is not in ${path}. Read the file again and copy it exactly.` }] }
      return commitFile(path, f.text.replace(old, String(replacement ?? "")))
    },

    async delete_file({ path }) {
      /* A refusal says why (round M): a bare { ok: false } left the model guessing and retrying. */
      if (!WRITABLE_PATH.test(path)) return { ok: false, reason: `${path} is not one of your files: only sections/ai_*, blocks/ai_* and snippets/ai_* .storelib files can be deleted.` }
      const wait = blocked()
      if (wait) return { ok: false, reason: wait.message }
      const type = typeOfPath(path)
      const pages = await store.listPages()
      const placed = path.startsWith("sections/") ? pages.filter((p) => p.sections.some((s) => s.type === type)).map((p) => p.key) : []
      if (placed.length) return { ok: false, reason: `${path} is placed on ${placed.join(", ")}. Take it off those pages with set_page_sections first.` }
      const r = await store.deleteFile(path, { author: "ai", jobId: job.jobId })
      if (!r.ok) return { ok: false, reason: `${path} could not be deleted${r.error ? `: ${String(r.error).slice(0, 200)}` : ""}.` }
      delete cp.known[path]
      cp.filesTouched = cp.filesTouched.filter((p) => p !== path)
      ctx.emit({ kind: "file", path, action: "deleted", bytes: 0 })
      return { ok: true }
    },

    async list_pages() {
      const [pages, settings, c] = await Promise.all([store.listPages(), store.readSettings(), caps()])
      const seo = (settings.page_seo ?? {}) as Record<string, { title?: string }>
      /* The templates too, stored or not (round N): each says where a visitor meets it and what its sections can read. */
      const templates = new Map(templatesFor(c).map((t) => [t.key, t]))
      const listed = pages.map((p) => {
        const t = templates.get(p.key)
        return { key: p.key, title: t?.title ?? (seo[p.key]?.title || pageTitleFromKey(p.key)), sections: p.sections.map((s) => ({ id: s.id, type: s.type, ...(s.group ? { group: s.group } : {}) })), ...(t ? { template: true, stored: true, url: t.url, reads: t.reads } : {}) }
      })
      const have = new Set(pages.map((p) => p.key))
      for (const t of templates.values()) if (!have.has(t.key)) listed.push({ key: t.key, title: t.title, sections: [], template: true, stored: false, url: t.url, reads: t.reads })
      return { pages: listed }
    },

    async add_page({ key, title, seo }) {
      const wait = blocked()
      if (wait) return { ok: false, key, error: wait.message }
      const k = String(key ?? "").toLowerCase()
      if (isTemplateKey(k)) return { ok: false, key: k, error: `"${k}" is a template the site already has (list_pages). Design it with set_page_sections page "${k}"; it needs no add_page.` }
      if (!isPageKey(k) || RESERVED_PAGE_KEYS.has(k)) return { ok: false, key: k, error: `"${k}" cannot be a page: use lowercase letters, digits and dashes, and not a name the platform serves (${[...RESERVED_PAGE_KEYS].slice(0, 8).join(", ")}...).` }
      const all = await pageMap()
      if (all.has(k)) return { ok: false, key: k, error: `The page ${k} already exists.` }
      const name = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || pageTitleFromKey(k)
      const homeChrome = (all.get("home") ?? []).filter((s) => CHROME_GROUPS.has(String(s.group ?? "")))
      await store.writePages([{ key: k, sections: [...homeChrome.filter((s) => s.group === "header"), ...homeChrome.filter((s) => s.group === "footer")] }])
      const settings = await store.readSettings()
      const pageSeo = { ...((settings.page_seo as Record<string, unknown>) ?? {}) }
      pageSeo[k] = { title: (seo?.title ?? name).slice(0, 70), ...(seo?.description ? { description: String(seo.description).slice(0, 160) } : {}) }
      const menus = { ...((settings.menus as Record<string, { title: string; links: { title: string; url: string }[] }>) ?? {}) }
      const main = menus["main-menu"] ?? { title: "Main menu", links: [] }
      const url = pagePath(k)
      if (!main.links.some((l) => l.url === url)) menus["main-menu"] = { ...main, links: [...main.links, { title: name, url }] }
      await store.writeSettings({ page_seo: pageSeo, menus })
      cp.pagesTouched = addUnique(cp.pagesTouched, k)
      ctx.emit({ kind: "page", page: k, title: name, action: "created", sections: 0 })
      return { ok: true, key: k }
    },

    set_page_sections: placeSections,

    async set_section_settings({ page, sectionId, settings }) {
      return updateSection(page, sectionId, (s, info, c, pageKeys, menus) => {
        const r = cleanSettings(s.type, settings, info.settings, c, pageKeys, menus, `${page} › ${sectionId}`)
        /* Every setting left out (none of them is the section's) is a refusal, not ok with warnings: nothing changed. */
        if (!Object.keys(r.settings).length) return { issues: [...r.issues, { severity: "error", code: "settings.nothing", message: `${page} › ${sectionId}: nothing was changed. ${s.type}'s settings are: ${info.settings.map((f) => f.id).slice(0, 40).join(", ") || "(none)"}.` }] }
        return r
      })
    },

    async set_tokens({ tokens, settings }) {
      const wait = blocked()
      if (wait) return { ok: false, changed: [], issues: [{ severity: "error", code: wait.code, message: wait.message }] }
      const current = await store.readSettings()
      /* Round O (O2): tokens the creator changed since the AI last set them are theirs; kept unless the request asks for that kind of change. */
      const guarded = tokens ? protectOverrides(tokens as never, current, job.prompt) : { tokens, kept: [] as string[] }
      if (guarded.kept.length) tokens = guarded.tokens as typeof tokens
      /* Round N: the overused faces are never the headline font unless the concept allows "default-fonts" (the creator named one). */
      const fontIssues: ValidationIssue[] = []
      const allowDefaults = ((cp.concept as { allow?: string[] } | undefined)?.allow ?? []).includes("default-fonts")
      if (tokens?.fonts?.heading && isSlopDisplayFont(String(tokens.fonts.heading)) && !allowDefaults) {
        fontIssues.push({ severity: "error", code: "token.default_font", message: `"${String(tokens.fonts.heading).slice(0, 60)}" was not set as the heading font: it is the face every generated site uses. Pick a display face with character from the type library (search_knowledge "type library").` })
        tokens = { ...tokens, fonts: { ...tokens.fonts, heading: undefined } } as unknown as typeof tokens
      }
      const mapped0 = (deps.tokensToSettings ?? tokensToThemeSettings)(tokens ?? {}, current)
      const mapped = { ...mapped0, issues: [...fontIssues, ...mapped0.issues] }
      /*
        The site's own Theme settings (round N, N5, lib/ai-builder/site-settings.ts): declared groups,
        read against the tokens this call sets, so a setting bound to colors.accent reads the new accent.
      */
      const declared = settings === undefined ? null : designSettingsWrite(settings, { ...current, ...mapped.settings })
      const write = { ...mapped.settings, ...(declared?.settings ?? {}) }
      const changed = Object.keys(write).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(write[k]))
      const issues = [...mapped.issues, ...(declared?.issues ?? [])]
      if (guarded.kept.length) issues.push({ severity: "warning", code: "token.user_override", message: `Kept what the creator set in Theme settings: ${guarded.kept.join(", ")}. Change these only when the request asks for it.` })
      if (changed.length) {
        /* Round O (O2): the contract's metadata records the AI's values; DESIGN.md follows the new settings. */
        const after = { ...current, ...write }
        await store.writeSettings({ ...write, ...contractMetaAfter(current, after) })
        await syncContractFile(store, job, after)
      }
      if (changed.length) ctx.emit({ kind: "tokens", changed })
      /* Nothing set is not ok, whatever the reason (round M): every value refused, or no tokens sent. */
      if (!changed.length) return { ok: false, changed: [], issues: issues.length ? issues.map((i) => ({ ...i, severity: "error" as const })) : [{ severity: "error", code: "token.none", message: "No token was set: send colors, fonts, radius, spacing or the other DesignTokens fields, or settings." }] }
      return { ok: true, changed, ...(issues.length ? { issues } : {}) }
    },

    async list_capabilities() {
      const [c, pages, settings] = await Promise.all([caps(), store.listPages(), store.readSettings()])
      const seo = (settings.page_seo ?? {}) as Record<string, { title?: string }>
      const menus = Object.entries((settings.menus as Record<string, { title?: string }>) ?? {}).map(([handle, m]) => ({ handle, title: m?.title ?? handle }))
      return {
        ...c,
        forms: formPickerOn(deps) ? c.forms : [],
        pages: pages.map((p) => ({ key: p.key, title: seo[p.key]?.title || pageTitleFromKey(p.key), url: pagePath(p.key) })),
        menus,
      }
    },

    async bind_data({ page, sectionId, prop, kind, ids }) {
      const control = BINDING_CONTROL[kind as DataBindingKind]
      if (!control) return { ok: false, issues: [{ severity: "error", code: "binding.kind", message: `Unknown binding kind "${kind}".` }] }
      if (kind === "form" && !formPickerOn(deps)) return { ok: false, issues: [{ severity: "error", code: "binding.form_unavailable", message: "Forms cannot be bound yet: the editor has no form picker. Link to the form's page with a url setting." }] }
      const list = Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []
      const single = !kind.endsWith("s")
      if (!list.length || (single && list.length !== 1)) return { ok: false, issues: [{ severity: "error", code: "binding.ids", message: single ? "Give exactly one id." : "Give at least one id." }] }
      return updateSection(page, sectionId, (s, info, c, pageKeys, menus) => {
        const field = info.settings.find((f) => f.id === prop)
        if (!field) return { issues: [{ severity: "error", code: "binding.prop", message: `${s.type} has no setting "${prop}".` }] }
        if (field.type !== control) return { issues: [{ severity: "error", code: "binding.control", message: `"${prop}" is a ${field.type}, not a ${control}. A ${kind} binding needs a ${control} setting.` }] }
        const bad = unknownBindingIds(control, list, c, pageKeys, menus)
        if (bad.length) return { issues: [{ severity: "error", code: "binding.unknown_id", message: `${bad.join(", ")} ${bad.length === 1 ? "is" : "are"} not in list_capabilities. Never invent an id.` }] }
        return { settings: { [prop]: single ? list[0] : list }, issues: [] }
      })
    },

    async search_knowledge({ query, kinds, limit }) {
      const search = deps.knowledge ?? libraryKnowledge({ industry: job.options?.category?.replace(/_/g, " "), concept: () => cp.concept, caps: () => cp.caps })
      const entries = await search({ query: String(query ?? "").slice(0, 300), kinds, limit: Math.min(8, Math.max(1, Number(limit) || 4)) }).catch(() => [])
      return { entries: entries.map((e) => ({ id: e.id, kind: e.kind, title: e.title, body: e.body.slice(0, 4000), ...(e.examples?.length ? { examples: e.examples.slice(0, 2).map((x) => x.slice(0, 6000)) } : {}) })) }
    },

    async validate({ path }) {
      const issues = await validateAll(ctx, path ? { path } : {})
      ctx.emit({ kind: "validation", ...(path ? { path } : {}), errors: errorsOf(issues).length, warnings: issues.length - errorsOf(issues).length })
      return { ok: errorsOf(issues).length === 0, issues: issues.slice(0, 40) }
    },

    async render_check({ page }) {
      const r = await renderPage(ctx, page)
      return { ok: r.ok, issues: r.issues.slice(0, 30), htmlBytes: r.htmlBytes }
    },

    async report_progress({ phase, label, concept, tasks, pages, brief }) {
      if (Array.isArray(tasks)) cp.openTasks = tasks.filter((t) => typeof t === "string").map((t) => t.slice(0, 160)).slice(0, 20)
      const notes: string[] = []
      /* Round O (O2): the plan model's refinements to the creative brief, within its shape. */
      if (brief !== undefined && cp.brief) cp.brief = refineBrief(cp.brief, brief)
      if (concept !== undefined) {
        const read0 = readConcept(concept)
        /* Round O (O2): an otherwise valid concept is checked against the chosen art direction (a display serif nobody asked for, the editorial-serif AI look, the creator's colours dropped, a named style ignored). */
        const fit = read0.ok === true ? conceptDirectionIssues(read0.concept, cp) : { errors: [], warnings: [] }
        const read: ReturnType<typeof readConcept> = read0.ok === true && fit.errors.length ? { ok: false, missing: fit.errors } : read0
        if (read.ok === true) {
          cp.concept = read.concept
          notes.push(`Concept "${read.concept.name}" accepted. Keep to it:
${describeConcept(read.concept)}${fit.warnings.length ? `
Notes: ${fit.warnings.join(" ")}` : ""}`)
          /* Round O (O3): the editorial-serif cliché by the concept's own words, unless the creator asked for that look. Refused at finish if built. */
          for (const w of conceptClicheIssues(read.concept, job.prompt)) notes.push(`Warning: ${w.message}`)
          /* The accepted concept becomes the site's design contract, DESIGN.md (a new website or a full redesign). */
          if (!job.edit && job.redesign !== "changes") {
            const problem = await writeContract(store, job, cp, read.concept)
            if (problem) notes.push(problem)
          }
        } else {
          /*
            A refused concept is a refusal, not a success with a footnote (round M): before, this answered
            ok: true with a note, so the progress events showed a concept the validator threw out as fine
            and the model could read "ok" and carry on. Now it is ok: false with every reason as an issue.
          */
          const missing = "missing" in read ? read.missing : ["the concept could not be read"]
          const planMissing = pages !== undefined && !job.edit && !job.redesign ? siteIssues(pages, await caps()) : []
          if (needsConcept()) ctx.setPhase("plan", String(label ?? "").slice(0, 120))
          return {
            ok: false,
            reason: `The visual concept needs another pass. Nothing was accepted${cp.concept ? ` (the concept "${cp.concept.name}" stays)` : " and the write tools stay closed"}. Fix every item below and send the whole concept again with report_progress phase "plan".`,
            issues: [...missing.slice(0, 20).map((m) => ({ severity: "error" as const, code: "plan.concept_invalid", message: m.slice(0, 400) })), ...planMissing],
          }
        }
      }
      /* Round N (N3): the site plan, every page and template with its sections. A new website's writes wait for it. */
      if (pages !== undefined && !job.edit && !job.redesign) {
        const problems = siteIssues(pages, await caps())
        if (problems.length) {
          if (needsConcept() || needsPlan()) ctx.setPhase("plan", String(label ?? "").slice(0, 120))
          return {
            ok: false,
            reason: `${notes.length ? `${notes[0].split("\n")[0]} ` : ""}The site plan needs another pass${cp.sitePlan ? " (the earlier plan stays)" : ", and the write tools stay closed"}. Fix every item below and send the whole pages list again with report_progress phase "plan".`,
            issues: problems,
          }
        }
        const read = readSitePlan(pages, await caps(), planBrief)
        if (read.ok === true) {
          cp.sitePlan = read.plan
          notes.push(`Site plan accepted:\n${describeSitePlan(read.plan)}`)
        }
      }
      if (needsConcept() && phase !== "plan") {
        /* A move past plan without a concept is refused too: the phase stays plan and the model is told why. */
        ctx.setPhase("plan", String(label ?? "").slice(0, 120))
        return { ok: false, reason: conceptFirst, issues: [{ severity: "error", code: "plan.concept_missing", message: conceptFirst }] }
      }
      if (!needsConcept() && needsPlan() && phase !== "plan") {
        ctx.setPhase("plan", String(label ?? "").slice(0, 120))
        return { ok: false, reason: planFirst, issues: [{ severity: "error", code: "plan.site_missing", message: planFirst }] }
      }
      const open = !needsConcept() && !needsPlan()
      if (open && notes.length) {
        ctx.setPhase("build", `Building ${cp.concept?.name ?? "the site"}`)
        return { ok: true, note: `${notes.join("\n\n")}\n\nYou can write now.` }
      }
      if (notes.length) {
        ctx.setPhase("plan", String(label ?? "").slice(0, 120))
        return { ok: true, note: `${notes.join("\n\n")}\n\nThe write tools open once ${needsConcept() ? "the visual concept" : "the site plan"} is in: report_progress phase "plan" with ${needsConcept() ? "a concept" : "pages (every page and template with its sections; list_pages shows the templates)"}.` }
      }
      ctx.setPhase(needsConcept() || needsPlan() ? "plan" : phase === "finish" || phase === "verify" ? cp.phase : phase, String(label ?? "").slice(0, 120))
      return { ok: true, ...(needsConcept() ? { note: "Noted. The write tools open once the visual concept is accepted: report_progress phase \"plan\" with a concept." } : needsPlan() ? { note: `Noted. ${planFirst.replace(" Nothing was changed.", "")}` } : {}) }
    },

    finish: (input) => ctx.onFinish(input),
  }
}

/* ── shared by the validate tool and the verify phase ─────────────────── */

/**
 * Every file this job touched (or one) and the site. An edit job checks only
 * what it touched: the rest of the site is the creator's and is not its
 * business to judge, let alone change.
 */
export async function validateAll(ctx: Pick<ToolContext, "job" | "deps" | "cp">, opts: { path?: string } = {}): Promise<ValidationIssue[]> {
  const { deps, job, cp } = ctx
  const store = deps.store
  const [files, pages, theme] = await Promise.all([store.listFiles(), store.listPages(), store.readSettings()])
  const src: Record<string, string> = {}
  for (const f of files) if (f.text.trim()) src[f.path] = f.text
  const issues: ValidationIssue[] = []
  if (cp.caps === undefined) cp.caps = (await deps.capabilities().catch(() => null)) ?? null
  const paths = opts.path ? [opts.path] : cp.filesTouched
  for (const path of paths) {
    const text = src[path]
    if (text === undefined) {
      if (opts.path) issues.push({ severity: "error", code: "file.missing", message: `${path} does not exist.`, path })
      continue
    }
    const type = typeOfPath(path)
    issues.push(...validateFile(path, text, { instances: pages.flatMap((p) => p.sections.filter((s) => s.type === type)), theme, sources: src, lenient: (cp.repairs[path] ?? 0) >= 2, formPicker: formPickerOn(deps), brief: job.prompt, caps: cp.caps ?? null }))
  }
  if (!opts.path) {
    issues.push(...validateSite({ pages, sources: src, settings: theme, caps: cp.caps ?? null, mode: job.mode, ...(job.edit || job.redesign === "changes" ? { only: new Set(cp.pagesTouched) } : {}) }))
  }
  return issues
}

/** One page drawn and checked, with the runtime errors the editor reported for it. */
export async function renderPage(ctx: Pick<ToolContext, "deps" | "cp">, page: string): Promise<{ ok: boolean; issues: ValidationIssue[]; htmlBytes: number; drawn?: { html: string; css: string } }> {
  const { deps, cp } = ctx
  const [files, pages, settings] = await Promise.all([deps.store.listFiles(), deps.store.listPages(), deps.store.readSettings()])
  const p = pages.find((x) => x.key === page)
  if (!p) return { ok: false, issues: [{ severity: "error", code: "page.missing", message: `There is no page "${page}".` }], htmlBytes: 0 }
  const src: Record<string, string> = {}
  for (const f of files) if (f.text.trim()) src[f.path] = f.text
  if (cp.caps === undefined) cp.caps = (await deps.capabilities().catch(() => null)) ?? null
  const routes = siteRoutes(pages.map((x) => x.key), cp.caps ?? null)
  const r = await (deps.renderCheck ?? renderCheckPage)({ page, sections: p.sections, settings, sources: src, routes, capabilities: cp.caps ? { ...cp.caps, pages: pages.map((x) => ({ key: x.key, title: x.key, url: pagePath(x.key) })) } : null })
  const runtime = (await deps.previewErrors?.().catch(() => []))?.filter((e) => e.page === page) ?? []
  const issues = [...r.issues, ...runtime.slice(0, 10).map((e) => ({ severity: "error" as const, code: "runtime.preview", message: `The editor's preview hit an error in section ${e.sectionId}: ${e.message.slice(0, 200)}`, sectionId: e.sectionId }))]
  return { ok: r.ok && !runtime.length, issues, htmlBytes: r.htmlBytes, ...(r.drawn ? { drawn: r.drawn } : {}) }
}
