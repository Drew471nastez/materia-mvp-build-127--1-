/**
 * ===========================================================================
 *  THE PROJECT TOOLS: READ THE SITE, CHANGE ITS PAGES, TEST, PREVIEW
 * ===========================================================================
 * What mcp.storelib.com offers beyond section files (./operations.ts):
 *
 *   read_project            the site, its pages, files and what is open
 *   read_page               one page's sections with their settings
 *   read_selected_section   the section the creator has selected, with
 *                           every control it has
 *   search_components       the sections this site can use
 *   create_section          a new section file, placed on a page
 *   edit_section            a change to a section file the creator has
 *   update_styles           settings on a section, a block or the theme
 *   create_page             a new page, with sections from the library
 *   create_safe_patch       several page operations as one change, with a
 *                           restore point taken first
 *   run_tests               ./checks.ts over a file or a page
 *   run_preview             the draft preview link, and the page checks
 *
 * SCOPE. Every read and write below is keyed on `who.installId`, which the
 * token decided (./tokens.ts); no argument an agent sends names an install,
 * a creator or a table. Page keys are checked against the same shape and
 * reserved names the public site uses, section and block ids are looked up
 * on that page, and paths go through ./protected.ts.
 *
 * NOTHING IS LOST. Before any page or theme write, a backup of the whole
 * site is taken (lib/website-builder/backups.ts, restorable from Website
 * Settings › Backups), every value is sanitised by the same function the
 * editor's save uses, and everything lands in the DRAFT columns. Section
 * files keep a version on every save (theme-file-drafts.ts).
 *
 * THE OPEN BUILDER. A page change is logged with its operations, and a
 * builder that is open replays them into what it is showing rather than
 * saving over them (app/website-builder/editor, handleAgentEvents). Without
 * the log (RUN_AGENT_MCP.sql not yet run) a page write could be undone by
 * the next autosave, so page tools refuse until it exists.
 */
import "server-only"

import type { AgentIdentity } from "./tokens"
import { agentMayWrite } from "./protected"
import { readFile, writeSection, type OpResult } from "./operations"
import { siteBrief } from "./site-brief"
import { checkOps, opsScope, type PageOpInput } from "./page-ops"
import { searchComponents } from "./components"
import { ALL_CHECKS, checkPageState, checkSectionFile, describeResults, type CheckResult } from "./checks"
import { validateSection } from "@/lib/storelib-ai/validate"
import { checksFor, selectSkills, type CheckId } from "@/lib/agent-skills"
import { describeSection, type ThemeOp, type ThemeState } from "@/lib/website-builder/agent/operations"
import { applySourceEdits } from "@/lib/website-builder/agent/code-edits"
import { schemaMapFor, type SchemaMap } from "@/lib/website-builder/agent/schemas"
import { editorContent } from "@/lib/website-builder/theme-file-drafts"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { takeBackup } from "@/lib/website-builder/backups"
import { BUILT_IN_PAGE_KEYS, pageKeyFromSegment, pageTitleFromKey } from "@/lib/website-builder/site-pages"
import { ADDABLE_SECTIONS, SECTION_CATEGORIES } from "@/lib/website-builder/section-schemas"
import { newPreviewToken } from "@/lib/website-builder/preview-link"
import { siteOrigin } from "@/lib/website-builder/site-seo-data"
import { toPageSlug } from "@/lib/sites/slug"
import type { SectionInstance } from "@/lib/website-builder/types"
import { storeMenusOrNull, withStoreMenus, writeStoreMenus } from "@/lib/website-builder/store-menus-server"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

const NOT_READY = "Page changes over MCP need RUN_AGENT_MCP.sql to be run once on this Storelib database. Section files work already."

export interface Focus {
  page_key: string
  section_id: string | null
  block_id: string | null
  updated_at: string
}

/* ── reads ─────────────────────────────────────────────────────────── */

/** The creator's own section files, the only sources that change the schema map. */
async function customSources(db: Db, installId: string): Promise<Record<string, string>> {
  const { data } = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).like("path", "sections/%")
  const out: Record<string, string> = {}
  for (const row of (data ?? []) as { path: string; content: string; draft_content?: string | null }[]) {
    const src = editorContent(row)
    if (typeof src === "string" && src.trim()) out[row.path] = src
  }
  return out
}

async function schemasFor(db: Db, installId: string): Promise<{ schemas: SchemaMap; custom: Set<string> }> {
  const sources = await customSources(db, installId)
  const custom = new Set(Object.keys(sources).map((p) => p.replace(/^sections\//, "").replace(/\.storelib$/, "")))
  return { schemas: schemaMapFor(sources), custom }
}

/** What the creator has open in the builder, or null. Fail-soft: the table may not exist yet. */
export async function readFocus(db: Db, installId: string): Promise<Focus | null> {
  try {
    const { data, error } = await db.from("theme_editor_focus").select("page_key, section_id, block_id, updated_at").eq("install_id", installId).maybeSingle()
    if (error || !data) return null
    return data as Focus
  } catch {
    return null
  }
}

/** The theme being edited, with the store's menus over its own: menus belong to the store (lib/website-builder/store-menus-server.ts). */
async function readTheme(db: Db, installId: string, creatorId: string): Promise<{ settings: Record<string, unknown>; rowId: string | null }> {
  const [{ data }, menus] = await Promise.all([
    db.from("store_theme_settings").select("id, settings, draft_settings").eq("install_id", installId).maybeSingle(),
    storeMenusOrNull(db, creatorId),
  ])
  const settings = (data?.draft_settings ?? data?.settings ?? {}) as Record<string, unknown>
  return { settings: withStoreMenus(settings, menus), rowId: (data?.id as string | undefined) ?? null }
}

async function readPageRow(db: Db, installId: string, pageKey: string): Promise<{ id: string | null; sections: SectionInstance[] }> {
  const { data } = await db.from("store_theme_pages").select("id, sections, draft_sections").eq("install_id", installId).eq("page_key", pageKey).maybeSingle()
  const sections = ((data?.draft_sections ?? data?.sections ?? []) as SectionInstance[]) || []
  return { id: (data?.id as string | undefined) ?? null, sections: sanitizeSections(Array.isArray(sections) ? sections : []) }
}

async function pageKeys(db: Db, installId: string): Promise<string[]> {
  const { data } = await db.from("store_theme_pages").select("page_key").eq("install_id", installId)
  return ((data ?? []) as { page_key: string }[]).map((r) => r.page_key).sort()
}

/** A page key an agent named, checked, or the open page, or home. */
function pageKeyOf(raw: unknown, focus: Focus | null): string | null {
  if (raw === undefined || raw === null || raw === "") return focus?.page_key ?? "home"
  if (typeof raw !== "string") return null
  const key = raw.trim().toLowerCase().replace(/^\//, "")
  if (key === "home" || key === "product" || key === "products" || key === "search") return key
  return pageKeyFromSegment(key)
}

const bad = (error: string, status = 400) => ({ ok: false as const, status, error })

export async function readProject(db: Db, who: AgentIdentity): Promise<OpResult<string>> {
  const [brief, focus, keys, { custom }] = await Promise.all([siteBrief(db, who), readFocus(db, who.installId), pageKeys(db, who.installId), schemasFor(db, who.installId)])
  if (brief.ok === false) return brief
  return {
    ok: true,
    value: JSON.stringify(
      {
        site: brief.value,
        pages: keys.map((k) => ({ key: k, title: pageTitleFromKey(k) })),
        your_sections: [...custom].sort(),
        open_in_builder: focus ? { page: focus.page_key, section_id: focus.section_id, block_id: focus.block_id, at: focus.updated_at } : null,
        next: "storelib_read_page for a page's sections and settings; storelib_skills with your task for how to do it.",
      },
      null,
      2,
    ),
  }
}

export async function readPage(db: Db, who: AgentIdentity, rawPage: unknown): Promise<OpResult<string>> {
  const focus = await readFocus(db, who.installId)
  const key = pageKeyOf(rawPage, focus)
  if (!key) return bad(`"${String(rawPage)}" is not a page on this site.`)
  const [{ id, sections }, { settings }] = await Promise.all([readPageRow(db, who.installId, key), readTheme(db, who.installId, who.creatorId)])
  if (!id && key !== "home") return bad(`There is no page "${key}". storelib_read_project lists the pages.`, 404)
  return {
    ok: true,
    value: JSON.stringify(
      {
        page: key,
        open_in_builder: focus?.page_key === key,
        sections: sections.map((s) => ({ id: s.id, type: s.type, name: s.name, hidden: s.hidden === true, settings: s.settings, blocks: (s.blocks ?? []).map((b) => ({ id: b.id, type: b.type, settings: b.settings })) })),
        theme_setting_ids: Object.keys(settings).slice(0, 120),
        next: "storelib_read_selected_section or a section id with storelib_read_selected_section for the controls a section has.",
      },
      null,
      2,
    ).slice(0, 60_000),
  }
}

export async function readSelectedSection(db: Db, who: AgentIdentity, args: { page?: unknown; section_id?: unknown }): Promise<OpResult<string>> {
  const focus = await readFocus(db, who.installId)
  const key = pageKeyOf(args.page, focus)
  if (!key) return bad(`"${String(args.page)}" is not a page on this site.`)
  const wantedId = typeof args.section_id === "string" && args.section_id ? args.section_id : focus?.page_key === key ? focus?.section_id : null
  if (!wantedId) {
    return bad(
      focus
        ? `Nothing is selected in the builder on "${key}". Pass section_id, from storelib_read_page.`
        : "The builder has not said what is selected (it is closed, or RUN_AGENT_MCP.sql has not been run). Pass section_id, from storelib_read_page.",
      404,
    )
  }
  const [{ sections }, { schemas, custom }] = await Promise.all([readPageRow(db, who.installId, key), schemasFor(db, who.installId)])
  const section = sections.find((s) => s.id === wantedId)
  if (!section) return bad(`There is no section "${wantedId}" on "${key}". storelib_read_page lists them.`, 404)
  const path = `sections/${section.type}.storelib`
  const writable = agentMayWrite(path).ok
  const block = focus?.section_id === section.id && focus?.block_id ? section.blocks?.find((b) => b.id === focus.block_id) : undefined
  return {
    ok: true,
    value: [
      `Page "${key}". ${focus?.section_id === section.id ? "Selected in the builder." : "Asked for by id."}${block ? ` Block [${block.id}] ${block.type} is selected in it.` : ""}`,
      describeSection(section, schemas),
      `FILE ${path}: ${custom.has(section.type) ? "the creator's own" : "built in"}, ${writable ? "writable with storelib_edit_section" : "read-only; write a new section beside it to change how it is built"}.`,
      "Change its settings with storelib_update_styles, its blocks with storelib_create_safe_patch.",
    ].join("\n\n"),
  }
}

export async function findComponents(db: Db, who: AgentIdentity, query: unknown, limit?: unknown): Promise<OpResult<string>> {
  const { schemas, custom } = await schemasFor(db, who.installId)
  const hits = searchComponents(schemas, typeof query === "string" ? query : "", {
    categories: SECTION_CATEGORIES,
    custom,
    addable: new Set([...ADDABLE_SECTIONS, ...custom]),
    limit: typeof limit === "number" ? limit : undefined,
  })
  return { ok: true, value: JSON.stringify({ query: typeof query === "string" ? query : "", results: hits }, null, 2) }
}

/* ── writes ────────────────────────────────────────────────────────── */

/** Whether the activity log can carry a page change. Asked before anything is written. */
async function logReady(db: Db): Promise<boolean> {
  try {
    const { error } = await db.from("theme_agent_activity").select("id, detail").limit(0)
    return !error
  } catch {
    return false
  }
}

async function logPage(db: Db, who: AgentIdentity, action: "page" | "page_created", pageKey: string, ops: ThemeOp[]) {
  await db.from("theme_agent_activity").insert({
    install_id: who.installId,
    token_id: who.tokenId,
    agent_name: who.name,
    path: `pages/${pageKey}`,
    action,
    detail: { page: pageKey, ops },
  })
}

export interface PatchResult {
  page: string
  applied: number
  created: string[]
  backup: string | null
  notes: string[]
  tests: CheckResult[]
}

/**
 * Apply a checked batch of operations to one page (and the theme, for
 * update_theme). The one write path for update_styles, create_safe_patch,
 * create_section's placement and create_page.
 */
export async function applyPatch(
  db: Db,
  who: AgentIdentity,
  args: { page?: unknown; ops: unknown; label?: unknown },
  opts: { create?: { key: string; start: SectionInstance[] } } = {},
): Promise<OpResult<PatchResult>> {
  if (!(await logReady(db))) return bad(NOT_READY, 503)
  const focus = await readFocus(db, who.installId)
  const key = opts.create?.key ?? pageKeyOf(args.page, focus)
  if (!key) return bad(`"${String(args.page)}" is not a page on this site.`)

  const [row, theme, { schemas }] = await Promise.all([
    opts.create ? Promise.resolve({ id: null, sections: opts.create.start }) : readPageRow(db, who.installId, key),
    readTheme(db, who.installId, who.creatorId),
    schemasFor(db, who.installId),
  ])
  if (!opts.create && !row.id && key !== "home") return bad(`There is no page "${key}". Make it with storelib_create_page.`, 404)

  const start: ThemeState = { sections: row.sections, settings: theme.settings }
  /* A new page with nothing asked for beyond its header and footer is still a page. */
  const empty = !!opts.create && Array.isArray(args.ops) && args.ops.length === 0
  const checked = empty ? { ok: true as const, ops: [] as ThemeOp[], state: start, notes: [] as string[], created: [] as string[] } : checkOps(start, args.ops, schemas)
  if (checked.ok === false) return bad(checked.error, 422)
  const scope = opsScope(checked.ops)

  /* A restore point of the whole site first. A failed backup stops the write: the promise is that nothing is lost. */
  const label = typeof args.label === "string" && args.label.trim() ? args.label.trim() : `${checked.ops.length} change${checked.ops.length === 1 ? "" : "s"} on ${key}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backup = await takeBackup(db as any, who.installId, { label: `Before ${who.name}: ${label}`, source: "ai" })
  if (backup.error) return bad("Could not take a backup before the change, so nothing was changed. Try again.", 503)

  if (scope.page || opts.create) {
    const sections = sanitizeSections(checked.state.sections)
    const write = row.id
      ? await db.from("store_theme_pages").update({ draft_sections: sections }).eq("id", row.id).eq("install_id", who.installId)
      : await db.from("store_theme_pages").insert({ install_id: who.installId, page_key: key, sections: [], draft_sections: sections })
    if (write.error) return bad("Could not save the page just now. Nothing reached visitors; try again.", 500)
  }
  if (scope.theme) {
    const write = theme.rowId
      ? await db.from("store_theme_settings").update({ draft_settings: checked.state.settings }).eq("id", theme.rowId).eq("install_id", who.installId)
      : await db.from("store_theme_settings").insert({ install_id: who.installId, settings: {}, draft_settings: checked.state.settings })
    if (write.error) return bad("Could not save the theme settings just now. Try again.", 500)
    /* A change to the menus is the store's, on every theme, the way the editor saves it. */
    const menusChanged = checked.ops.some((o) => o.kind === "update_theme" && "menus" in (o.settings ?? {}))
    if (menusChanged) await writeStoreMenus(db, who.creatorId, checked.state.settings.menus)
  }

  try {
    await logPage(db, who, opts.create ? "page_created" : "page", key, checked.ops)
  } catch {
    /* the change is saved; an open builder picks it up when it next loads the page */
  }

  const tests = checkPageState(key, checked.state, schemas, ["page-types", "page-settings", "contrast", "limits"])
  return {
    ok: true,
    value: { page: key, applied: checked.ops.length, created: checked.created, backup: backup.backup?.id ?? null, notes: checked.notes, tests },
  }
}

export function describePatch(r: PatchResult, who: AgentIdentity): string {
  return [
    `Saved as a draft on "${r.page}": ${r.applied} change${r.applied === 1 ? "" : "s"}.${r.created.length ? ` New sections: ${r.created.join(", ")}.` : ""}`,
    r.backup ? `Restore point taken first ("Before ${who.name}"), in Website Settings › Backups.` : "",
    r.notes.length ? `Adjusted: ${r.notes.join("; ")}` : "",
    describeResults(r.tests),
    "A builder that is open shows it now. Nothing is live until the creator publishes.",
  ]
    .filter(Boolean)
    .join("\n")
}

/** update_styles: one settings change on a section, a block or the theme, as a one-operation patch. */
export async function updateStyles(db: Db, who: AgentIdentity, args: Record<string, unknown>): Promise<OpResult<PatchResult>> {
  const scope = typeof args.scope === "string" ? args.scope : args.block_id ? "block" : args.section_id ? "section" : "theme"
  const settings = args.settings
  let op: PageOpInput
  if (scope === "theme") op = { op: "update_theme", settings: settings as Record<string, unknown> }
  else if (scope === "block") op = { op: "update_block", section_id: String(args.section_id ?? ""), block_id: String(args.block_id ?? ""), settings: settings as Record<string, unknown> }
  else if (scope === "section") op = { op: "update_section", section_id: String(args.section_id ?? ""), settings: settings as Record<string, unknown> }
  else return bad('scope is "section", "block" or "theme".')
  return applyPatch(db, who, { page: args.page, ops: [op], label: `Styles on ${scope === "theme" ? "the theme" : String(args.section_id)}` })
}

export async function createPage(db: Db, who: AgentIdentity, args: { title?: unknown; sections?: unknown }): Promise<OpResult<PatchResult>> {
  const title = typeof args.title === "string" ? args.title.replace(/\s+/g, " ").trim().slice(0, 80) : ""
  if (!title) return bad("title is the page's name, such as \"Size guide\".")
  const key = toPageSlug(title)
  if (!key || pageKeyFromSegment(key) === null) return bad("That name does not make a usable address. Use letters or numbers.")
  const existing = await pageKeys(db, who.installId)
  if (BUILT_IN_PAGE_KEYS.has(key) || existing.includes(key)) return bad(`There is already a page at /${key}.`, 409)
  if (existing.length >= 60) return bad("This site has 60 pages, which is the most it holds.", 413)

  /* The new page takes the site's own header and footer, as the builder's Add page does. */
  const home = await readPageRow(db, who.installId, "home")
  const start = home.sections.filter((s) => s.type === "header" || s.type === "footer")
  const types = Array.isArray(args.sections) ? args.sections.filter((t): t is string => typeof t === "string").slice(0, 20) : []
  const ops: PageOpInput[] = types.map((t) => ({ op: "add_section", section_type: t }))
  return applyPatch(db, who, { ops, label: `New page ${title}` }, { create: { key, start } })
}

/** The quality gate the write tools share: compile, then the checks. A file that fails is not saved. */
function gate(path: string, source: string): OpResult<null> {
  const type = /^sections\/([a-z0-9_-]+)\.storelib$/.exec(path)?.[1]
  const v = validateSection(source, { path, expectType: type, strict: true })
  if (v.ok === true) return { ok: true, value: null }
  return { ok: false, status: 422, error: `${path} was not saved.\n${v.feedback}` }
}

export async function createSection(
  db: Db,
  who: AgentIdentity,
  args: { path?: unknown; source?: unknown; page?: unknown; index?: unknown },
  mirror: (path: string, source: string) => void,
): Promise<OpResult<string>> {
  const path = typeof args.path === "string" ? args.path : ""
  const source = typeof args.source === "string" ? args.source : ""
  const allowed = agentMayWrite(path)
  if (allowed.ok === false) return bad(allowed.error, allowed.status)
  const existing = await readFile(db, who.installId, path)
  if (existing.ok === true) return bad(`${path} already exists. Change it with storelib_edit_section, or pick another name.`, 409)
  const g = gate(path, source)
  if (g.ok === false) return g

  const place = args.page !== undefined && args.page !== null && args.page !== ""
  /* Placed on a page, the page change is what the builder follows, so the file itself is logged as not to be placed twice. */
  const saved = await writeSection(db, who, path, source, undefined, { placed: place })
  if (saved.ok === false) return saved
  mirror(path, source)
  const lines = [`${path} saved as a draft (${saved.value.type}). It passed compile and quality.`]
  if (place) {
    const index = typeof args.index === "number" ? args.index : undefined
    const r = await applyPatch(db, who, { page: args.page, ops: [{ op: "add_section", section_type: saved.value.type, index }], label: `New section ${saved.value.type}` })
    lines.push(r.ok === true ? describePatch(r.value, who) : `The file is saved but was not placed on the page: ${r.error}`)
  } else {
    lines.push("A builder that is open puts it on the page it shows; otherwise it is in Add section under the creator's own.")
  }
  return { ok: true, value: lines.join("\n\n") }
}

export async function editSection(
  db: Db,
  who: AgentIdentity,
  args: { path?: unknown; source?: unknown; base_updated_at?: unknown },
  mirror: (path: string, source: string) => void,
): Promise<OpResult<string>> {
  const path = typeof args.path === "string" ? args.path : ""
  const source = typeof args.source === "string" ? args.source : ""
  const allowed = agentMayWrite(path)
  if (allowed.ok === false) return bad(allowed.error, allowed.status)
  const existing = await readFile(db, who.installId, path)
  if (existing.ok === false) return bad(`There is no ${path} to change. Make it with storelib_create_section.`, 404)
  const base = typeof args.base_updated_at === "string" && args.base_updated_at ? args.base_updated_at : undefined
  if (!base && existing.value.updated_at) {
    return bad(`Send base_updated_at (${existing.value.updated_at}) from storelib_read_file, so a newer save by the creator is never written over.`, 409)
  }
  const g = gate(path, source)
  if (g.ok === false) return g
  const saved = await writeSection(db, who, path, source, base)
  if (saved.ok === false) return saved
  mirror(path, source)
  return { ok: true, value: `${path} saved as a draft. It passed compile and quality. updated_at ${saved.value.updated_at ?? "unknown"}. The previous version is kept.` }
}

/**
 * A CHANGE TO PART OF A SECTION FILE, as find-and-replace edits rather than
 * the whole file resent (lib/website-builder/agent/code-edits.ts, the same
 * rule the builder's assistant works by). Each find must be in the file
 * exactly once. What the edits produce then goes through storelib_edit_section
 * unchanged: the built-in refusal, base_updated_at, compile, quality, a
 * draft with the previous version kept, and the mirror to GitHub.
 */
export async function patchSection(
  db: Db,
  who: AgentIdentity,
  args: { path?: unknown; edits?: unknown; base_updated_at?: unknown },
  mirror: (path: string, source: string) => void,
): Promise<OpResult<string>> {
  const path = typeof args.path === "string" ? args.path : ""
  const allowed = agentMayWrite(path)
  if (allowed.ok === false) return bad(allowed.error, allowed.status)
  const existing = await readFile(db, who.installId, path)
  if (existing.ok === false) return bad(`There is no ${path} to change. Make it with storelib_create_section.`, 404)
  const applied = applySourceEdits(existing.value.source, args.edits)
  if (applied.ok === false) return bad(`${applied.error.replace(/write_section_code/g, "storelib_edit_section")} Nothing was saved.`, 400)
  const saved = await editSection(db, who, { path, source: applied.source, base_updated_at: args.base_updated_at }, mirror)
  return saved.ok === true ? { ok: true, value: `${saved.value} ${applied.applied} edit${applied.applied === 1 ? "" : "s"} applied.` } : saved
}

/* ── tests and preview ─────────────────────────────────────────────── */

export async function runTests(db: Db, who: AgentIdentity, args: { path?: unknown; page?: unknown; checks?: unknown; request?: unknown }): Promise<OpResult<string>> {
  let wanted: CheckId[] = ALL_CHECKS
  if (Array.isArray(args.checks) && args.checks.length) wanted = args.checks.filter((c): c is CheckId => (ALL_CHECKS as string[]).includes(String(c)))
  else if (typeof args.request === "string" && args.request.trim()) {
    /* A task whose skills name no checks (asking a question) still gets them all. */
    const named = checksFor(selectSkills(args.request))
    wanted = named.length ? named : ALL_CHECKS
  }
  if (!wanted.length) return bad(`checks are any of: ${ALL_CHECKS.join(", ")}.`)

  const results: CheckResult[] = []
  const path = typeof args.path === "string" ? args.path : ""
  if (path) {
    const file = await readFile(db, who.installId, path)
    if (file.ok === false) return file
    results.push(...checkSectionFile(path, file.value.source, wanted))
  }
  if (!path || args.page !== undefined) {
    const focus = await readFocus(db, who.installId)
    const key = pageKeyOf(args.page, focus)
    if (!key) return bad(`"${String(args.page)}" is not a page on this site.`)
    const [{ sections }, { settings }, { schemas }] = await Promise.all([readPageRow(db, who.installId, key), readTheme(db, who.installId, who.creatorId), schemasFor(db, who.installId)])
    results.push(...checkPageState(key, { sections, settings }, schemas, wanted))
    if (!path && (wanted.includes("compile") || wanted.includes("quality"))) {
      /* The creator's own section files used on this page: the ones an agent can have broken. */
      const own = await customSources(db, who.installId)
      const used = new Set(sections.map((s) => `sections/${s.type}.storelib`))
      for (const [p, src] of Object.entries(own)) if (used.has(p)) results.push(...checkSectionFile(p, src, wanted))
    }
  }
  return { ok: true, value: describeResults(results) }
}

export async function runPreview(db: Db, who: AgentIdentity, args: { page?: unknown }): Promise<OpResult<string>> {
  const focus = await readFocus(db, who.installId)
  const key = pageKeyOf(args.page, focus)
  if (!key) return bad(`"${String(args.page)}" is not a page on this site.`)
  const [{ data: install }, { data: creator }] = await Promise.all([
    db.from("store_theme_installs").select("id, preview_token").eq("id", who.installId).eq("creator_id", who.creatorId).maybeSingle(),
    db.from("creators").select("slug").eq("id", who.creatorId).maybeSingle(),
  ])
  if (!install) return bad("This connection's site no longer exists.", 404)

  let token = (install as { preview_token?: string | null }).preview_token ?? null
  let made = false
  if (!token) {
    token = newPreviewToken()
    const { error } = await db.from("store_theme_installs").update({ preview_token: token }).eq("id", who.installId).eq("creator_id", who.creatorId)
    if (error) token = null
    else made = true
  }
  const slug = (creator as { slug?: string } | null)?.slug ?? ""
  const origin = slug ? await siteOrigin(who.creatorId, slug) : ""
  const draftUrl = token && origin ? `${origin}/preview/${token}${key === "home" ? "" : `/${key}`}` : null
  const builderUrl = `https://storelib.com/website-builder/editor/${who.installId}?page=${encodeURIComponent(key)}`

  const [{ sections }, { settings }, { schemas }] = await Promise.all([readPageRow(db, who.installId, key), readTheme(db, who.installId, who.creatorId), schemasFor(db, who.installId)])
  const tests = checkPageState(key, { sections, settings }, schemas, ["page-types", "contrast", "limits"])
  return {
    ok: true,
    value: [
      draftUrl
        ? `Draft preview of "${key}": ${draftUrl}\nOpen it at 375px and 1280px wide. It shows the drafts and is not indexed.${made ? " This made the site's preview link; the creator can turn it off under Publish." : ""}`
        : "No draft link could be made (RUN_THEME_PREVIEW_LINK.sql may not have been run).",
      `In the builder: ${builderUrl}`,
      `On the page, top to bottom: ${sections.map((s) => `${s.type}${s.hidden ? " (hidden)" : ""}`).join(", ") || "nothing yet"}`,
      describeResults(tests),
    ].join("\n\n"),
  }
}
