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
