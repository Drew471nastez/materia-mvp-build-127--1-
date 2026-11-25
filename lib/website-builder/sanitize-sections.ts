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
import { withMediaUrls } from "@/lib/storage/media-url"
import { schemaFromStorelib, themeBlockCatalog } from "./storelib-schemas"
import { MAX_BLOCK_DEPTH } from "@/lib/storelib-theme/types"
import { compatHtmlFieldsOf, htmlFieldsOf, sanitizeSettings, type HtmlFieldMap } from "./sanitize"
import { cleanMenus } from "@/lib/storelib-theme/values"
import type { SectionInstance, SectionSchema } from "./types"
import { fileCols, resolveRefs } from "@/lib/website-builder/theme-file-refs"

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

/**
 * ===========================================================================
 *  A SECTION TYPE THE INSTALL DEFINES IN ITS OWN FILE
 * ===========================================================================
 * The registry above knows the theme's sections. A type it has never heard
 * of, one the creator wrote in the code editor or one an imported theme
 * brought with it, was cleaned only by the id list in sanitize.ts, so a
 * richtext setting called anything else (`promo_text`, say) went into the
 * database as written and out through the template's `raw`.
 *
 * The schema for such a type is in the install's own `sections/<type>.storelib`,
 * so it is read from there and every richtext setting, on the section and on
 * each block, is cleaned like a built-in one. Both halves of a file count, the
 * draft and what is live, because either may be the one that draws the value.
 * The install's file wins over the theme's for the same type, because that
 * file is what draws it.
 */
/** `exact`: an imported Shopify section's file, cleaned by its own types alone (sanitize.ts, compatHtmlFieldsOf). */
export type OwnSectionFields = Record<string, { section: HtmlFieldMap; blocks: Record<string, HtmlFieldMap>; exact?: boolean }>

type SectionFile = { path: string; content?: string | null; draft_content?: string | null }

const SECTION_FILE = /^sections\/([a-z0-9_-]+)\.storelib$/

export function ownSectionFields(files: readonly SectionFile[] | null | undefined): OwnSectionFields {
  const out: OwnSectionFields = {}
  for (const file of files ?? []) {
    const type = SECTION_FILE.exec(file.path)?.[1]
    if (!type) continue
    for (const source of [file.content, file.draft_content]) {
      if (typeof source !== "string" || !source.trim()) continue
      const read = schemaFromStorelib(source, file.path)
      if (read.ok !== true) continue
      const own = (out[type] ??= { section: {}, blocks: {} })
      const fieldsOf = read.schema.imported ? compatHtmlFieldsOf : htmlFieldsOf
      if (read.schema.imported) own.exact = true
      Object.assign(own.section, fieldsOf(read.schema.fields))
      for (const block of read.schema.blocks ?? []) Object.assign((own.blocks[block.type] ??= {}), fieldsOf(block.fields))
    }
  }
  return out
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The install's own files for the section types in hand. Only those types,
 * because a page is saved every couple of seconds while somebody edits and
 * most of its types are the theme's. A read that fails falls back to the
 * registry, which is how every save was cleaned before this existed: a save
 * is never refused because this could not be read.
 */
export async function readOwnSectionFields(db: Db, installId: string, types: Iterable<string>): Promise<OwnSectionFields> {
  const paths = [...new Set([...types].filter((t) => typeof t === "string" && /^[a-z0-9_-]{1,64}$/.test(t)))].map((t) => `sections/${t}.storelib`)
  if (paths.length === 0) return {}
  try {
    const both = await db.from("store_theme_custom_files").select(await fileCols("path, content, draft_content")).eq("install_id", installId).in("path", paths)
    if (!both.error) return ownSectionFields(await resolveRefs(both.data as { path: string; content: string | null; draft_content?: string | null }[] | null))
    /* An install from before file drafts existed has no draft column. */
    const live = await db.from("store_theme_custom_files").select("path, content").eq("install_id", installId).in("path", paths)
    if (!live.error) return ownSectionFields(live.data)
    console.error(`[sanitize] could not read the section files, cleaning by the registry: ${live.error.message}`)
  } catch (e) {
    console.error("[sanitize] could not read the section files, cleaning by the registry:", e instanceof Error ? e.message : e)
  }
  return {}
}

interface LooseBlock {
  type: string
  settings?: Record<string, unknown>
  blocks?: LooseBlock[]
}

interface LooseSection {
  type: string
  settings?: Record<string, unknown>
  blocks?: LooseBlock[]
}

/**
 * A THEME BLOCK'S HTML FIELDS, from its file in blocks/. A block inside a
 * block is always a theme block, so this is where every nested block's rich
 * text is found; what is not here is still cleaned by the id list, and again
 * when it is drawn (resolve.ts, storelib/raw-html.ts).
 */
const themeBlockFields = new Map<string, HtmlFieldMap>()
function themeBlockFieldsFor(type: string): HtmlFieldMap {
  const hit = themeBlockFields.get(type)
  if (hit) return hit
  const out = htmlFieldsOf(themeBlockCatalog()[type]?.fields)
  themeBlockFields.set(type, out)
  return out
}

/** One block and every block inside it. The same object back when nothing changed. */
function sanitizeBlock<B extends LooseBlock>(b: B, fields: HtmlFieldMap, depth: number, exact = false): B {
  const settings = sanitizeSettings(b.settings, fields, exact ? { byId: false } : undefined)
  let blocks = b.blocks
  if (Array.isArray(blocks) && blocks.length && depth < MAX_BLOCK_DEPTH) {
    let touched = false
    const next = blocks.map((c) => {
      const cleaned = sanitizeBlock(c, exact ? {} : themeBlockFieldsFor(c.type), depth + 1, exact)
      if (cleaned !== c) touched = true
      return cleaned
    })
    if (touched) blocks = next
  }
  if (settings === b.settings && blocks === b.blocks) return b
  return { ...b, settings, ...(blocks ? { blocks } : {}) }
}

/**
 * Where a section's own fields come from: the install's section files read
 * into field maps (ownSectionFields), or a lookup that answers with a type's
 * schema (lib/website-builder/custom-schemas.ts). Either way the install's
 * file wins over the theme's for the type it defines.
 */
export type OwnFields = OwnSectionFields | SchemaLookup

function ownOf(own: OwnFields | undefined, type: string): { section: HtmlFieldMap; blocks: Record<string, HtmlFieldMap>; exact?: boolean } | undefined {
  if (!own) return undefined
  if (typeof own !== "function") return own[type]
  const schema = own(type)
  if (!schema) return undefined
  const fieldsOf = schema.imported ? compatHtmlFieldsOf : htmlFieldsOf
  const blocks: Record<string, HtmlFieldMap> = {}
  for (const block of schema.blocks ?? []) blocks[block.type] = fieldsOf(block.fields)
  return { section: fieldsOf(schema.fields), blocks, ...(schema.imported ? { exact: true } : {}) }
}

/** One section, settings and blocks. The same object back when nothing changed. */
export function sanitizeSection<T extends LooseSection>(section: T, own?: OwnFields): T {
  const mine = ownOf(own, section.type)
  const exact = mine?.exact === true
  const settings = sanitizeSettings(section.settings, mine ? mine.section : fieldsFor(section.type), exact ? { byId: false } : undefined)
  let blocks = section.blocks
  if (blocks?.length) {
    let touched = false
    const next = blocks.map((b) => {
      const local = mine ? mine.blocks[b.type] : SECTION_SCHEMAS[section.type]?.blocks?.some((d) => d.type === b.type) ? blockFieldsFor(section.type, b.type) : undefined
      const cleaned = sanitizeBlock(b, local ?? (exact ? {} : themeBlockFieldsFor(b.type)), 1, exact)
      if (cleaned !== b) touched = true
      return cleaned
    })
    if (touched) blocks = next
  }
  if (settings === section.settings && blocks === section.blocks) return section
  return { ...section, settings, ...(blocks ? { blocks } : {}) }
}

/**
 * A page. The same array back when nothing in it changed. `own` is the
 * install's own section files (ownSectionFields, or a schema lookup), for
 * the types it defines.
 */
export function sanitizeSections<T extends SectionInstance>(sections: T[] | null | undefined, own?: OwnFields): T[] {
  if (!Array.isArray(sections)) return []
  let touched = false
  const out = sections.map((s) => {
    /* Storelib's own address for every uploaded file, never the storage host's (lib/storage/media-url.ts). */
    const next = withMediaUrls(sanitizeSection(s as unknown as LooseSection, own)) as unknown as T
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
  const cleaned = withMediaUrls(sanitizeSettings(settings, THEME_HTML_SETTINGS)) as T
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
