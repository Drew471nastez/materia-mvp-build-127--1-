/**
 * ===========================================================================
 *  A PAGE'S WORTH OF CREATOR HTML, CLEANED
 * ===========================================================================
 * lib/website-builder/sanitize.ts knows how to clean one value. This knows
 * which values a page holds: it walks a page's sections and their blocks,
 * asks each section's schema which of its settings are HTML, and cleans
 * those.
 *
 * Kept apart from `sanitize.ts` so that file stays a pure function of a
 * string, and so the schema registry, which pulls in every section's JSON,
 * is only loaded where a whole page is being handled.
 */
import { SECTION_SCHEMAS } from "./section-schemas"
import { htmlFieldsOf, sanitizeSettings, type HtmlFieldMap } from "./sanitize"
import { cleanMenus } from "@/lib/storelib-theme/values"
import type { SectionInstance, SectionSchema } from "./types"

const cache = new Map<string, HtmlFieldMap>()

/**
 * Where a type's schema comes from when the built-in registry is not the
 * whole truth: a section the creator wrote in the code editor, or their
 * copy of one the theme ships. Its rich text is cleaned by its own schema,
 * not only by the id list, or a creator's `intro` richtext setting would
 * reach the page as it was typed.
 */
export type SchemaLookup = (type: string) => SectionSchema | undefined

/**
 * Which of a section type's settings hold HTML. A type the registry does not
 * know is a section the creator wrote themselves, and the answer for it is
 * the id list in `sanitize.ts`.
 */
function fieldsFor(type: string): HtmlFieldMap {
  const hit = cache.get(type)
  if (hit) return hit
  const out = htmlFieldsOf(SECTION_SCHEMAS[type]?.fields)
  cache.set(type, out)
  return out
}

function blockFieldsFor(type: string, blockType: string): HtmlFieldMap {
  const key = `${type} ${blockType}`
  const hit = cache.get(key)
  if (hit) return hit
  const block = SECTION_SCHEMAS[type]?.blocks?.find((b) => b.type === blockType)
  const out = htmlFieldsOf(block?.fields)
  cache.set(key, out)
  return out
}

interface LooseSection {
  type: string
  settings?: Record<string, unknown>
  blocks?: { type: string; settings?: Record<string, unknown> }[]
}

/** One section, settings and blocks. The same object back when nothing changed. */
export function sanitizeSection<T extends LooseSection>(section: T, schemaOf?: SchemaLookup): T {
  const own = schemaOf?.(section.type)
  const settings = sanitizeSettings(section.settings, own ? htmlFieldsOf(own.fields) : fieldsFor(section.type))
  let blocks = section.blocks
  if (blocks?.length) {
    let touched = false
    const next = blocks.map((b) => {
      const s = sanitizeSettings(
        b.settings,
        own ? htmlFieldsOf(own.blocks?.find((d) => d.type === b.type)?.fields) : blockFieldsFor(section.type, b.type),
      )
      if (s === b.settings) return b
      touched = true
      return { ...b, settings: s }
    })
    if (touched) blocks = next
  }
  if (settings === section.settings && blocks === section.blocks) return section
  return { ...section, settings, ...(blocks ? { blocks } : {}) }
}

/** A page. The same array back when nothing in it changed. */
export function sanitizeSections<T extends SectionInstance>(sections: T[] | null | undefined, schemaOf?: SchemaLookup): T[] {
  if (!Array.isArray(sections)) return []
  let touched = false
  const out = sections.map((s) => {
    const next = sanitizeSection(s as unknown as LooseSection, schemaOf) as unknown as T
    if (next !== (s as unknown)) touched = true
    return next
  })
  return touched ? out : sections
}

/**
 * The theme's own settings. A few of them reach the DOM drawn by the theme
 * rather than by a section.
 */
const THEME_HTML_SETTINGS: HtmlFieldMap = {
  announcement_bar_text: "rich",
  cookie_banner_text: "rich",
  footer_text: "rich",
  tagline: "rich",
}

export function sanitizeThemeSettings<T extends Record<string, unknown>>(settings: T | null | undefined): T {
  if (!settings) return {} as T
  const cleaned = sanitizeSettings(settings, THEME_HTML_SETTINGS) as T
  /*
    THE MENUS, TO THE SHAPE A SECTION READS: handles that are handles,
    titles cut to length, every address made safe, no more than three
    levels (lib/storelib-theme/values.ts, cleanMenus). The same function
    runs again as a menu is drawn; this is what keeps the stored copy honest.
  */
  if (cleaned.menus === undefined) return cleaned
  const menus = cleanMenus(cleaned.menus)
  return JSON.stringify(menus) === JSON.stringify(cleaned.menus) ? cleaned : ({ ...cleaned, menus } as T)
}

/**
 * ===========================================================================
 *  A WHOLE INSTALL, AS THE EDITOR LOADS IT
 * ===========================================================================
 * `/api/website-builder/themes/[installId]` answers with the install and
 * everything hanging off it in one query: `pages:store_theme_pages(*)` and
 * `settings:store_theme_settings(*)`. The editor builds its canvas from that
 * response, and the canvas renders section settings with
 * `dangerouslySetInnerHTML`.
 *
 * It was the last read that did not clean what it returned. The sections
 * endpoint one directory over does, and so does everything a visitor
 * reaches, which made this the one door left open into a signed-in session.
 *
 * Both shapes of embedded row are handled because PostgREST returns a
 * one-to-one join as an object or as a single-element array depending on how
 * the relationship is declared, and this code should not care which.
 */
type PageRow = { sections?: unknown; draft_sections?: unknown }
type SettingsRow = { settings?: unknown; draft_settings?: unknown }

function cleanPage<T extends PageRow>(page: T, schemaOf?: SchemaLookup): T {
  if (!page || typeof page !== "object") return page
  return {
    ...page,
    ...(page.sections ? { sections: sanitizeSections(page.sections as SectionInstance[], schemaOf) } : {}),
    ...(page.draft_sections ? { draft_sections: sanitizeSections(page.draft_sections as SectionInstance[], schemaOf) } : {}),
  }
}

function cleanSettings<T extends SettingsRow>(row: T): T {
  if (!row || typeof row !== "object") return row
  return {
    ...row,
    ...(row.settings ? { settings: sanitizeThemeSettings(row.settings as Record<string, unknown>) } : {}),
    ...(row.draft_settings ? { draft_settings: sanitizeThemeSettings(row.draft_settings as Record<string, unknown>) } : {}),
  }
}

/** One embedded relation, however PostgREST chose to shape it. */
function mapEmbedded<T>(value: unknown, fn: (row: T) => T): unknown {
  if (Array.isArray(value)) return value.map((row) => fn(row as T))
  if (value && typeof value === "object") return fn(value as T)
  return value
}

/** Every section on every page of an install row, for the schema lookup. */
export function sectionsOfInstallRow(install: unknown): SectionInstance[] {
  const pages = (install as { pages?: unknown } | null)?.pages
  const rows = Array.isArray(pages) ? pages : pages && typeof pages === "object" ? [pages] : []
  return rows.flatMap((p) => {
    const r = p as PageRow
    return [...(Array.isArray(r.sections) ? r.sections : []), ...(Array.isArray(r.draft_sections) ? r.draft_sections : [])] as SectionInstance[]
  })
}

export function sanitizeInstallRow<T>(install: T, schemaOf?: SchemaLookup): T {
  if (!install || typeof install !== "object") return install
  const row = install as Record<string, unknown>
  return {
    ...row,
    ...(row.pages !== undefined ? { pages: mapEmbedded<PageRow>(row.pages, (p) => cleanPage(p, schemaOf)) } : {}),
    ...(row.settings !== undefined ? { settings: mapEmbedded<SettingsRow>(row.settings, cleanSettings) } : {}),
  } as T
}
