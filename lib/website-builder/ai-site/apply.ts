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
import { rhythmFor, toCreativePlan, themeSettingsFor, type SitePlan } from "../agent/site-plan"
import type { Intent } from "../agent/intent"
import type { SchemaMap } from "../agent/schemas"
import type { SectionInstance } from "../types"
import type { DesignPreset } from "../design-presets"
import { pagePath } from "../site-pages"
import { opIsNew } from "./replay"

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

/** An operation that would do nothing new is skipped: an add of an id that is there, a removal of one that is not (./replay.ts). Pure. */
export function applyOnce(state: ThemeState, op: ThemeOp, schemas?: SchemaMap): { state: ThemeState; applied: boolean } {
  if (!opIsNew(state.sections, op)) return { state, applied: false }
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
  /* By group as well as by type: a header the job coded for the site is in the header group under a type of its own (./code.ts). */
  const { header, footer } = homeChrome(home)
  const pages: Record<string, SectionInstance[]> = {}
  for (const [key, sections] of Object.entries(site.pages)) {
    if (key === "home") {
      pages[key] = sections
      continue
    }
    const body = sections.filter((s) => !isChrome(s))
    pages[key] = [...header, ...body, ...footer]
  }
  return { ...site, pages }
}

/** The home page's frame: everything in the header group (the built-in header among it), and everything in the footer group. Pure. */
export function homeChrome(home: readonly SectionInstance[]): { header: SectionInstance[]; footer: SectionInstance[] } {
  const groupOf = (s: SectionInstance) => (s as { group?: string }).group ?? (s.type === "header" ? "header" : s.type === "footer" ? "footer" : null)
  return { header: home.filter((s) => groupOf(s) === "header"), footer: home.filter((s) => groupOf(s) === "footer") }
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
  presets?: readonly DesignPreset[]
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
  const rhythm = rhythmFor(plan, input.presets)
  const ownPalette = !!plan.palette.colors.background
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
    let band = 0
    applied.placed.forEach((id, i) => {
      if (!id) return
      const planned = page.sections[i]
      placed.push({ page: key, id, type: planned.type, plan: i })
      /* The preset's palette: each section on the next scheme of its rhythm, the hero first (unless the plan brought its own colours). */
      const scheme = !ownPalette && rhythm.length && fieldsFor(planned.type, schemas).some((f) => f.id === "color_scheme") ? { color_scheme: rhythm[band++ % rhythm.length] } : {}
      const settings = { ...planned.layout, ...scheme }
      if (Object.keys(settings).length) push(key, [{ kind: "update_section", id, settings }])
    })
  }

  push(ANY_PAGE, chromeOps(site, plan, schemas, { shop: input.shop, credits: false }))
  site = syncChrome(site)
  return { ops, site, placed, notes }
}

/** Pages a visitor books, enquires or gets in touch through, best first. */
const ACTION_PAGES: [RegExp, (title: string) => string][] = [
  [/\b(book|booking|appointment|reserve|schedule)/i, (t) => t],
  [/\b(enquir|inquir|quote|brief|consult)/i, (t) => t],
  [/\b(contact|get in touch|hire|work with)/i, () => "Get in touch"],
]

/**
 * The header button's words and page (round 56): Shop now where the site sells (published products), else the
 * page a visitor books or enquires through, else none. Pure.
 */
export function headerAction(plan: SitePlan, site: SiteState, shop: boolean): { label: string; url: string } | null {
  if (shop) return { label: "Shop now", url: "/products" }
  const pages = plan.pages.filter((p) => p.key !== "home" && site.pages[p.key])
  for (const [re, label] of ACTION_PAGES) {
    const page = pages.find((p) => re.test(`${p.key} ${p.title}`))
    if (page) return { label: label(page.title).slice(0, 24), url: pagePath(page.key) }
  }
  return null
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
    /*
      THE HEADER'S BUTTON IS THE SITE'S MAIN ACTION, IN THE SITE'S COLOURS
      (round 56). The starting website's header carried "Shop now" to
      /products painted in its preset's own indigo, so every native site drew
      an indigo Shop now whatever it was and whatever its palette. Its colour
      fields are cleared so the button takes the header's scheme (the site's
      accent and button label, contrast checked where it is drawn), and the
      words are what the site does: Shop now where it sells, its booking or
      contact page where it does not, and no button where it has neither.
    */
    if (!opts.credits) {
      const action = headerAction(plan, site, opts.shop)
      if (ids.has("show_cta_button")) set.show_cta_button = !!action
      if (action && ids.has("cta_text")) set.cta_text = action.label
      if (action && ids.has("cta_url")) set.cta_url = action.url
      if (ids.has("cta_color")) set.cta_color = ""
      if (ids.has("cta_text_color")) set.cta_text_color = ""
    }
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
