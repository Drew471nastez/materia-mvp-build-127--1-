/**
 * ===========================================================================
 *  A WEBSITE IN ANOTHER LANGUAGE: TRANSLATIONS LAID OVER THE ORIGINAL
 * ===========================================================================
 * A translation is never a copy of the theme. Each piece of text the visitor
 * reads has a stable key, and a language holds a value for some keys:
 *
 *   section:<sectionId>:<settingId>            a heading, a paragraph, a button
 *   block:<sectionId>:<blockId>:<settingId>    the same, inside a block
 *   product:<productId>:<field>                title, description, SEO title...
 *   collection:<collectionId>:<field>          title, description
 *   menu:<menuId>:<itemId>                     a navigation link's label
 *   page:<pageKey>:<field>                     a page's SEO title, description
 *
 * Drawing a page in a language lays its values over the original
 * (localizeSections, localizeRecord); a key with no value, or a value that is
 * only a draft on the live site, falls back to the original, so a page is
 * never half empty. Only text is laid over: links, pictures, colours, ids
 * and numbers are the original's in every language.
 *
 * OUTDATED, NEVER OVERWRITTEN. Each value keeps a hash of the original it was
 * written for (sourceHash). When the original changes, the value is said to
 * be outdated in the translations list; it is still used until someone
 * reviews it, and nothing here ever rewrites a value a person wrote.
 *
 * Pure.
 */
import type { BlockInstance, SchemaField, SectionInstance } from "@/lib/website-builder/types"

export type TranslationStatus = "draft" | "approved"
export type TranslationSource = "manual" | "ai"

export interface TranslationRow {
  key: string
  value: string
  /** sourceHash of the original this was written for. */
  sourceHash: string
  status: TranslationStatus
  source: TranslationSource
}

/** One language's values, by key. */
export type TranslationMap = Map<string, TranslationRow>

/** The setting types that hold words a visitor reads. Everything else is the same in every language. */
export const TRANSLATABLE_TYPES = new Set(["text", "textarea", "richtext", "inline_richtext", "html_text"])

export const MAX_TRANSLATION_LENGTH = 20_000

/** A short, stable fingerprint of a piece of text (FNV-1a, 32 bits, hex): equal text, equal hash, on the server and in the browser. */
export function sourceHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

export const sectionKey = (sectionId: string, settingId: string) => `section:${sectionId}:${settingId}`
export const blockKey = (sectionId: string, blockId: string, settingId: string) => `block:${sectionId}:${blockId}:${settingId}`

/** A key that is one of the shapes above, at a sane length, and nothing else. */
export function isTranslationKey(key: unknown): key is string {
  return typeof key === "string" && key.length <= 300 && /^(section:[^:\s]+:[^:\s]+|block:[^:\s]+:[^:\s]+:[^:\s]+|product:[0-9a-f-]{36}:[a-z_]+|collection:[0-9a-f-]{36}:[a-z_]+|menu:[^:\s]+:[^:\s]+|page:[^:\s]+:[a-z_]+)$/i.test(key)
}

/** Where a key's value is shown, in words, for the translations list. */
export type Translatable = { key: string; source: string; label: string; where: string; multiline: boolean }

type FieldsOf = (type: string) => SchemaField[] | undefined
type BlockFieldsOf = (sectionType: string, blockType: string) => SchemaField[] | undefined

/**
 * Every piece of text on these sections, in page order, with its key and the
 * original words: what the translations list shows and what a language
 * needs a value for. Only settings whose schema says they are text.
 */
export function translatablesOf(sections: SectionInstance[], fieldsOf: FieldsOf, blockFieldsOf: BlockFieldsOf, nameOf: (s: SectionInstance) => string = (s) => s.label || s.name || s.type): Translatable[] {
  const out: Translatable[] = []
  const take = (fields: SchemaField[] | undefined, settings: Record<string, unknown>, key: (id: string) => string, where: string) => {
    for (const f of fields ?? []) {
      if (!TRANSLATABLE_TYPES.has(f.type)) continue
      const v = settings?.[f.id]
      if (typeof v !== "string" || !v.trim()) continue
      out.push({ key: key(f.id), source: v, label: f.label || f.id, where, multiline: f.type !== "text" })
    }
  }
  const walkBlocks = (section: SectionInstance, blocks: BlockInstance[] | undefined, where: string) => {
    for (const b of blocks ?? []) {
      if (b.hidden) continue
      take(blockFieldsOf(section.type, b.type), b.settings, (id) => blockKey(section.id, b.id, id), where)
      walkBlocks(section, b.blocks, where)
    }
  }
  for (const s of sections) {
    if (s.hidden) continue
    const where = nameOf(s)
    take(fieldsOf(s.type), s.settings, (id) => sectionKey(s.id, id), where)
    walkBlocks(s, s.blocks, where)
  }
  return out
}

/**
 * The value a key has in a language, for the live website (`approvedOnly`)
 * or the editor's preview (drafts too): null when the original should show.
 */
export function valueFor(map: TranslationMap | null | undefined, key: string, opts: { approvedOnly?: boolean } = {}): string | null {
  const row = map?.get(key)
  if (!row || !row.value.trim()) return null
  if (opts.approvedOnly && row.status !== "approved") return null
  return row.value
}

/** Missing, outdated (the original changed since), draft or done: what the translations list says about one key. */
export function statusOf(row: TranslationRow | undefined, source: string): "missing" | "outdated" | "draft" | "done" {
  if (!row || !row.value.trim()) return "missing"
  if (row.sourceHash !== sourceHash(source)) return "outdated"
  return row.status === "approved" ? "done" : "draft"
}

/**
 * The sections in a language: every text setting with a value laid over,
 * everything else the original's. A new array; the original is untouched.
 */
export function localizeSections(sections: SectionInstance[], map: TranslationMap | null | undefined, fieldsOf: FieldsOf, blockFieldsOf: BlockFieldsOf, opts: { approvedOnly?: boolean } = {}): SectionInstance[] {
  if (!map || map.size === 0) return sections
  const over = (fields: SchemaField[] | undefined, settings: Record<string, unknown>, key: (id: string) => string) => {
    let next: Record<string, unknown> | null = null
    for (const f of fields ?? []) {
      if (!TRANSLATABLE_TYPES.has(f.type) || typeof settings?.[f.id] !== "string") continue
      const v = valueFor(map, key(f.id), opts)
      if (v === null) continue
      next = next ?? { ...settings }
      next[f.id] = v
    }
    return next ?? settings
  }
  const blocksIn = (section: SectionInstance, blocks: BlockInstance[] | undefined): BlockInstance[] | undefined =>
    blocks?.map((b) => {
      const settings = over(blockFieldsOf(section.type, b.type), b.settings, (id) => blockKey(section.id, b.id, id))
      const inner = blocksIn(section, b.blocks)
      return settings === b.settings && inner === b.blocks ? b : { ...b, settings, ...(inner ? { blocks: inner } : {}) }
    })
  return sections.map((s) => {
    const settings = over(fieldsOf(s.type), s.settings, (id) => sectionKey(s.id, id))
    const blocks = blocksIn(s, s.blocks)
    return settings === s.settings && blocks === s.blocks ? s : { ...s, settings, ...(blocks ? { blocks } : {}) }
  })
}

/** A record (a product, a collection) with its translated fields laid over: `fields` names which, the key's prefix which record. */
export function localizeRecord<T extends Record<string, unknown>>(record: T, prefix: string, fields: readonly (keyof T & string)[], map: TranslationMap | null | undefined, opts: { approvedOnly?: boolean } = {}): T {
  if (!map || map.size === 0) return record
  let next: T | null = null
  for (const f of fields) {
    if (typeof record[f] !== "string") continue
    const v = valueFor(map, `${prefix}:${f}`, opts)
    if (v === null) continue
    next = next ?? { ...record }
    ;(next as Record<string, unknown>)[f] = v
  }
  return next ?? record
}

/** Rows as a map, the last of any duplicate kept. */
export function translationMap(rows: readonly TranslationRow[]): TranslationMap {
  const m: TranslationMap = new Map()
  for (const r of rows) if (isTranslationKey(r.key)) m.set(r.key, r)
  return m
}

/* ── Menus and search engine text ──────────────────────────────────────── */

/** A menu as the theme holds it (lib/storelib-theme/values Menu): links with titles, nested. */
interface MenuLike {
  title: string
  links: { title: string; url: string; links?: MenuLike["links"] }[]
}

export const menuKey = (handle: string, path: string) => `menu:${handle}:${path}`

/**
 * Every link title of the store's menus, keyed by menu and position
 * ("menu:main-menu:0.2"). Menus keep no ids, so a position is the key; a
 * translation is only laid over while the title it was written for is
 * still the one there (localizeMenus), so a reordered menu shows its
 * originals, never a word meant for another link.
 */
export function menuTranslatables(menus: Record<string, MenuLike> | null | undefined): Translatable[] {
  const out: Translatable[] = []
  for (const [handle, menu] of Object.entries(menus ?? {})) {
    const walk = (links: MenuLike["links"] | undefined, at: string) =>
      (links ?? []).forEach((l, i) => {
        const path = at ? `${at}.${i}` : String(i)
        if (typeof l.title === "string" && l.title.trim()) out.push({ key: menuKey(handle, path), source: l.title, label: "Link", where: menu.title || handle, multiline: false })
        walk(l.links, path)
      })
    walk(menu.links, "")
  }
  return out
}

/** The menus in a language: a link's title replaced only where its translation was written for the title it has now. */
export function localizeMenus<T extends Record<string, MenuLike>>(menus: T, map: TranslationMap | null | undefined, opts: { approvedOnly?: boolean } = {}): T {
  if (!map || map.size === 0) return menus
  const inLinks = (handle: string, links: MenuLike["links"] | undefined, at: string): MenuLike["links"] | undefined =>
    links?.map((l, i) => {
      const path = at ? `${at}.${i}` : String(i)
      const row = typeof l.title === "string" ? map.get(menuKey(handle, path)) : undefined
      const fits = row && row.sourceHash === sourceHash(l.title)
      const title = fits ? (valueFor(map, menuKey(handle, path), opts) ?? l.title) : l.title
      const inner = inLinks(handle, l.links, path)
      return title === l.title && inner === l.links ? l : { ...l, title, ...(inner ? { links: inner } : {}) }
    })
  const out: Record<string, MenuLike> = {}
  for (const [handle, menu] of Object.entries(menus)) out[handle] = { ...menu, links: inLinks(handle, menu.links, "") ?? menu.links }
  return out as T
}

/** The website's search engine text: its own title and description, and each page's (Website settings › SEO, Pages). */
export function seoTranslatables(theme: Record<string, unknown> | null | undefined): Translatable[] {
  const out: Translatable[] = []
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
  const title = str(theme?.seo_title)
  const description = str(theme?.seo_description)
  if (title) out.push({ key: "page:home:seo_title", source: title, label: "Title", where: "Website", multiline: false })
  if (description) out.push({ key: "page:home:seo_description", source: description, label: "Description", where: "Website", multiline: true })
  const pages = theme?.page_seo
  if (pages && typeof pages === "object") {
    for (const [key, raw] of Object.entries(pages as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object" || !/^[^:\s]+$/.test(key)) continue
      const r = raw as Record<string, unknown>
      const name = key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " ")
      if (str(r.title)) out.push({ key: `page:${key}:seo_title`, source: r.title as string, label: "Title", where: name, multiline: false })
      if (str(r.description)) out.push({ key: `page:${key}:seo_description`, source: r.description as string, label: "Description", where: name, multiline: true })
    }
  }
  return out
}

/** The theme's settings in a language: its menus, and its and its pages' search engine text. */
export function localizeTheme<T extends Record<string, unknown>>(theme: T, map: TranslationMap | null | undefined, opts: { approvedOnly?: boolean } = {}): T {
  if (!map || map.size === 0) return theme
  const next: Record<string, unknown> = { ...theme }
  if (theme.menus && typeof theme.menus === "object") next.menus = localizeMenus(theme.menus as Record<string, MenuLike>, map, opts)
  const t = valueFor(map, "page:home:seo_title", opts)
  const d = valueFor(map, "page:home:seo_description", opts)
  if (t && typeof theme.seo_title === "string") next.seo_title = t
  if (d && typeof theme.seo_description === "string") next.seo_description = d
  if (theme.page_seo && typeof theme.page_seo === "object") {
    const pages: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(theme.page_seo as Record<string, unknown>)) {
      if (!raw || typeof raw !== "object") {
        pages[key] = raw
        continue
      }
      const r = { ...(raw as Record<string, unknown>) }
      const pt = valueFor(map, `page:${key}:seo_title`, opts)
      const pd = valueFor(map, `page:${key}:seo_description`, opts)
      if (pt && typeof r.title === "string") r.title = pt
      if (pd && typeof r.description === "string") r.description = pd
      pages[key] = r
    }
    next.page_seo = pages
  }
  return next as T
}
