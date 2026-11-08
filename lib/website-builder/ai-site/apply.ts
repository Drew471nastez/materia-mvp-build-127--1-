/**
 * ===========================================================================
 *  START WITH AI: THE PLAN, BUILT IN CODE
 * ===========================================================================
 * The plan (lib/website-builder/agent/site-plan.ts) becomes pages through the
 * paths the chat agent already uses, so what lands is exactly what the editor
 * would make by hand:
 *
 *   THEME     the preset's settings and the plan's adjustments, checked
 *             against Theme settings' own controls, as one update_theme;
 *   PAGES     each page through ./plan-apply.ts applyPlan (the palette into
 *             the built-in schemes, the fonts, every planned section added
 *             in order on its colour band), then each section's layout
 *             choices as an update_section;
 *   CHROME    the header and footer are the home page's, on every page (as
 *             the editor's sync-global keeps them); the header shows this
 *             site's own pages as its links, and the footer gets a column of
 *             them, without touching the store's shared menus, which other
 *             websites read.
 *
 * Every change is a ThemeOp applied with the editor's applier
 * (lib/website-builder/agent/operations.ts applyOp) and kept, in order, with
 * the page it belongs to: the editor replays the same operations onto its
 * canvas, so the build is editable and undoable there as it lands.
 *
 * Ids are made from the job's id and a counter, so building the same plan
 * twice (a step resumed after a crash) makes the same ids, and an operation
 * that is already on the page is skipped (`applyOnce`).
 */
import { applyOp, fieldsFor, type ThemeOp, type ThemeState } from "../agent/operations"
import { applyPlan } from "../agent/plan-apply"
import { toCreativePlan, themeSettingsFor, type SitePlan } from "../agent/site-plan"
import type { Intent } from "../agent/intent"
import type { SchemaMap } from "../agent/schemas"
import type { SectionInstance } from "../types"
import type { DesignPreset } from "../design-presets"
import { pagePath } from "../site-pages"

/** Operations that reach every page the editor might be on: theme settings and the header and footer. */
export const ANY_PAGE = "*"

export interface SiteState {
  settings: Record<string, unknown>
  pages: Record<string, SectionInstance[]>
}

export interface PageOp {
  page: string
  op: ThemeOp
}

export interface PlacedSection {
  page: string
  id: string
  type: string
  /** Its index in the plan's page, so the planned brief can be found again. */
  plan: number
}

const isChrome = (s: { type: string; group?: unknown }) => s.type === "header" || s.type === "footer" || !!s.group

/** An operation that would do nothing new is skipped: an add of an id that is there, a removal of one that is not. Pure. */
export function applyOnce(state: ThemeState, op: ThemeOp, schemas?: SchemaMap): { state: ThemeState; applied: boolean } {
  const section = (id: string) => state.sections.find((s) => s.id === id)
  if (op.kind === "add_section" && section(op.id)) return { state, applied: false }
  if (op.kind === "remove_section" && !section(op.id)) return { state, applied: false }
  if (op.kind === "add_block") {
    const s = section(op.sectionId)
    if (!s || (s.blocks ?? []).some((b) => b.id === op.blockId)) return { state, applied: false }
  }
  if (op.kind === "remove_block" || op.kind === "update_block") {
    const s = section(op.sectionId)
    if (!s || !(s.blocks ?? []).some((b) => b.id === op.blockId)) return { state, applied: false }
  }
  if ((op.kind === "update_section" || op.kind === "move_section") && !section(op.id)) return { state, applied: false }
  return { state: applyOp(state, op, schemas), applied: true }
}

/** The site with `ops` applied to the pages they name; chrome and theme operations reach every page. Pure. */
export function applySiteOps(site: SiteState, ops: PageOp[], schemas?: SchemaMap): { site: SiteState; applied: PageOp[] } {
  let settings = site.settings
  const pages: Record<string, SectionInstance[]> = { ...site.pages }
  const applied: PageOp[] = []
  for (const item of ops) {
    if (item.op.kind === "update_theme") {
      settings = applyOp({ sections: [], settings }, item.op).settings
      applied.push(item)
      continue
    }
    const keys = item.page === ANY_PAGE ? Object.keys(pages) : [item.page]
    let any = false
    for (const key of keys) {
      const before = pages[key]
      if (!before) continue
      const r = applyOnce({ sections: before, settings }, item.op, schemas)
      if (r.applied) {
        pages[key] = r.state.sections
        any = true
      }
    }
    if (any) applied.push(item)
  }
  return { site: { settings, pages }, applied }
}

/** Every page's header and footer made the home page's, in place: the site's frame is one frame. Pure. */
export function syncChrome(site: SiteState): SiteState {
  const home = site.pages.home
  if (!home) return site
  const header = home.find((s) => s.type === "header")
  const footer = home.find((s) => s.type === "footer")
  const pages: Record<string, SectionInstance[]> = {}
  for (const [key, sections] of Object.entries(site.pages)) {
    if (key === "home") {
      pages[key] = sections
      continue
    }
    const body = sections.filter((s) => !isChrome(s))
    pages[key] = [...(header ? [header] : []), ...body, ...(footer ? [footer] : [])]
  }
  return { ...site, pages }
}

const INTENT = (kind: Intent["kind"]): Intent => ({ kind, also: [], scope: kind === "PAGE_REDESIGN" ? "page" : "site", plan: true, preserveStructure: false, followUp: false, wantsMotion: false, reasons: ["start with ai"] }) as Intent

export interface Built {
  ops: PageOp[]
  site: SiteState
  placed: PlacedSection[]
  notes: string[]
}

/**
 * The plan, built. `site` is the website as it is stored now (a new one: a
 * home page with its header and footer); pages the plan names that do not
 * exist yet are made from the home page's chrome, as the builder's Add page
 * does.
 */
export function buildSite(input: {
  plan: SitePlan
  site: SiteState
  schemas?: SchemaMap
  addable: string[]
  idSeed: string
  presets?: DesignPreset[]
  /** Published products exist: the header links to the shop. */
  shop: boolean
}): Built {
  const { plan, schemas, addable } = input
  let counter = 0
  const newId = (type: string) => `${type}-${input.idSeed}-${(counter++).toString(36)}`
  const ops: PageOp[] = []
  const notes: string[] = []
  let site: SiteState = { settings: input.site.settings, pages: { ...input.site.pages } }
  if (!site.pages.home) site.pages.home = []
  const push = (page: string, list: ThemeOp[]) => {
    const r = applySiteOps(site, list.map((op) => ({ page, op })), schemas)
    site = r.site
    ops.push(...r.applied)
  }

  /* ── the art direction ── */
  const theme = themeSettingsFor(plan, input.presets)
  notes.push(...theme.notes)
  if (Object.keys(theme.settings).length) push(ANY_PAGE, [{ kind: "update_theme", settings: theme.settings }])

  const placed: PlacedSection[] = []
  for (const [p, page] of plan.pages.entries()) {
    const key = page.key
    if (!site.pages[key]) site.pages[key] = (site.pages.home ?? []).filter(isChrome)
    /* The palette is written once, with the home page; the other pages use the schemes it made. */
    const creative = toCreativePlan(plan, page)
    if (p > 0) creative.palette = { direction: "", colors: {} }
    const applied = applyPlan({
      plan: creative,
      state: { sections: site.pages[key], settings: site.settings },
      schemas: schemas ?? {},
      addable,
      intent: INTENT(p === 0 ? "NEW_SITE_GENERATION" : "PAGE_REDESIGN"),
      newId,
    })
    notes.push(...applied.skipped)
    /* Theme writes and the header and footer's colours reach every page; the sections are this page's. */
    for (const { op } of applied.ops) {
      const chrome = op.kind === "update_theme" || ((op.kind === "update_section" || op.kind === "remove_section") && site.pages[key].some((s) => s.id === op.id && isChrome(s)))
      push(chrome ? ANY_PAGE : key, [op])
    }
    applied.placed.forEach((id, i) => {
      if (!id) return
      const planned = page.sections[i]
      placed.push({ page: key, id, type: planned.type, plan: i })
      if (Object.keys(planned.layout).length) push(key, [{ kind: "update_section", id, settings: planned.layout }])
    })
  }

  push(ANY_PAGE, chromeOps(site, plan, schemas, { shop: input.shop, credits: false }))
  site = syncChrome(site)
  return { ops, site, placed, notes }
}

/** The header's own links and the footer's column for this site's pages (and its Photo credits page, once it has one). Pure. */
export function chromeOps(site: SiteState, plan: SitePlan, schemas: SchemaMap | undefined, opts: { shop: boolean; credits: boolean }): ThemeOp[] {
  const home = site.pages.home ?? []
  const header = home.find((s) => s.type === "header")
  const footer = home.find((s) => s.type === "footer")
  const ops: ThemeOp[] = []
  const pages = plan.pages.filter((p) => p.key !== "home" && site.pages[p.key])
  const links = [...(opts.shop ? [{ label: "Shop", url: "/products" }] : []), ...pages.map((p) => ({ label: p.title, url: pagePath(p.key) }))]
  if (header) {
    const ids = new Set(fieldsFor("header", schemas).map((f) => f.id))
    const set: Record<string, unknown> = {}
    /* Its own links, not the store's Main menu: the menu is shared by every website of the store. */
    if (ids.has("menu")) set.menu = ""
    if (ids.has("logo_text") && plan.brand.name) set.logo_text = plan.brand.name
    if (Object.keys(set).length) ops.push({ kind: "update_section", id: header.id, settings: set })
    if (!opts.credits) {
      for (const b of header.blocks ?? []) if (b.type === "nav_link") ops.push({ kind: "remove_block", sectionId: header.id, blockId: b.id })
      links.slice(0, 6).forEach((l, i) =>
        ops.push({ kind: "add_block", sectionId: header.id, blockId: `nav_link-${header.id}-ai${i}`, blockType: "nav_link", settings: { label: l.label, url: l.url, link_type: "custom" } }),
      )
    }
  }
  if (footer && fieldsFor("footer", schemas).length) {
    const column = `footer_column-${footer.id}-ai`
    const hasColumn = (footer.blocks ?? []).some((b) => b.id === column)
    if (!opts.credits && !hasColumn && links.length) {
      ops.push({ kind: "add_block", sectionId: footer.id, blockId: column, blockType: "footer_column", settings: { heading: plan.brand.name || "Explore" } })
      links.forEach((l, i) => ops.push({ kind: "add_block", sectionId: footer.id, blockId: `footer_link-${footer.id}-ai${i}`, blockType: "footer_link", settings: { label: l.label, url: l.url } }))
    }
    if (opts.credits) ops.push({ kind: "add_block", sectionId: footer.id, blockId: `footer_link-${footer.id}-credits`, blockType: "footer_link", settings: { label: "Photo credits", url: "/photo-credits" } })
  }
  return ops
}
