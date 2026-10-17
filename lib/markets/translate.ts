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
 *   option:<hash>                              an option's name or value ("Size",
 *                                              "Small"), once for the whole shop
 *   checkout:<hash>                            a sentence of the website's checkout
 *                                              (lib/markets/checkout-words.ts)
 *   email:<hash>                               a sentence of a buyer's emails
 *                                              (lib/emails/words.ts)
 *   tw:<locale key>                            an imported theme's own word
 *                                              ("products.product.add_to_cart")
 *
 * Drawing a page in a language lays its values over the original
 * (localizeSections, localizeRecord); a key with no value, or a value that is
 * only a draft on the live site, falls back to the original, so a page is
 * never half empty. Only text is laid over: links, pictures, colours, ids
 * and numbers are the original's in every language.
 *
 * OUTDATED, NEVER OVERWRITTEN. Each value keeps a hash of the original it was
 * written for (sourceHash). When the original changes:
 *
 *   Storelib AI's   no longer shown (the new original shows) and written
 *                   again by the next automatic run, minutes after a publish
 *   the merchant's  kept on the website as they wrote it, never rewritten,
 *                   and listed as "Needs review" (needsReview) in Settings
 *                   until they edit it or keep it as it is
 *
 * The merchant's stays live because it is their words and the translation
 * they chose: hiding it would put the original language back in the middle
 * of their translated page, which reads as Storelib changing their work.
 * Shopify's Translate & Adapt does the same with an outdated translation.
 *
 * Pure.
 */
import type { BlockInstance, SchemaField, SectionInstance } from "@/lib/website-builder/types"
import { plainDescription } from "@/lib/products/plain-description"

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

/**
 * A setting whose words a visitor reads. A text box that holds a CSS value
 * (a gradient, which the editor draws with its own gradient control) is
 * not words: sent to a translator it came back as "gradient-liniar(...)".
 * The editor's sidebar asks the same question, so what it offers to
 * translate is exactly what the website lays over.
 *
 * Nor is a text box that holds an address or code rather than words (round
 * V8): an email or a phone number, a link, an embed, an anchor, a date.
 * A picture's description (alt text) and a button's label are words.
 */
export function isWordsField(f: Pick<SchemaField, "type"> & { id?: string; label?: string }): boolean {
  return TRANSLATABLE_TYPES.has(f.type) && !/gradient/i.test(`${f.id ?? ""} ${f.label ?? ""}`) && !NOT_WORDS_ID.test(f.id ?? "")
}

const NOT_WORDS_ID = /(^|_)(email|phone|url)$|^(embed_code|target_id|countdown_end|release_date|anchor|anchor_id|html_id|css_class)$/i

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
  return typeof key === "string" && key.length <= 300 && /^(section:[^:\s]+:[^:\s]+|block:[^:\s]+:[^:\s]+:[^:\s]+|product:[0-9a-f-]{36}:[a-z_]+|collection:[0-9a-f-]{36}:[a-z_]+|menu:[^:\s]+:[^:\s]+|page:[^:\s]+:[a-z_]+|theme:[a-z_]+|ui:[a-z_]+|option:[0-9a-f]{8}|checkout:[0-9a-f]{8}|email:[0-9a-f]{8}|tw:[A-Za-z0-9_.-]{1,200})$/i.test(key)
}

/** Where a key's value is shown, in words, for the translations list. */
export type Translatable = { key: string; source: string; label: string; where: string; multiline: boolean }

type FieldsOf = (type: string) => SchemaField[] | undefined

/**
 * THE WORDS A SETTING SHOWS, WRITTEN OR NOT. A section stores only what a
 * person changed (lib/storelib-theme/resolve.ts): a heading never touched
 * is drawn from its schema's default, and was neither listed to translate
 * nor laid over, so it stayed in the theme's language on every page. Its
 * default is its words until someone writes others. A default that is an
 * imported theme's locale key ("t:sections.x") is the theme's own word,
 * translated with its words (tw:), never here.
 */
export function shownText(field: Pick<SchemaField, "default">, value: unknown): string | null {
  if (typeof value === "string") return value
  if (value !== undefined && value !== null) return null
  const d = field.default
  return typeof d === "string" && !/^t:/.test(d) ? d : null
}
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
      if (!isWordsField(f)) continue
      const v = shownText(f, settings?.[f.id])
      if (v === null || !v.trim()) continue
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
 *
 * `fresh`, with the original it stands for: Storelib AI's translation of a
 * text that has since changed is not shown, so a visitor reads the new
 * original until the automatic run writes it again. A translation the
 * merchant wrote or edited stays (see OUTDATED above): it is theirs, and the
 * Translate sheet lists it as Needs review (needsReview).
 */
export function valueFor(map: TranslationMap | null | undefined, key: string, opts: TranslateOpts = {}, original?: string): string | null {
  const row = map?.get(key)
  if (!row || !row.value.trim()) return null
  if (opts.approvedOnly && row.status !== "approved") return null
  if (opts.fresh && row.source === "ai" && original !== undefined && row.sourceHash && row.sourceHash !== sourceHash(original)) return null
  return row.value
}

/** How a translation is laid over: approved ones only (the live site), and Storelib AI's only while written for the original as it is now (`fresh`). */
export interface TranslateOpts {
  approvedOnly?: boolean
  fresh?: boolean
}

/** Missing, outdated (the original changed since), draft or done: what the translations list says about one key. */
export function statusOf(row: TranslationRow | undefined, source: string): "missing" | "outdated" | "draft" | "done" {
  if (!row || !row.value.trim()) return "missing"
  if (row.sourceHash !== sourceHash(source)) return "outdated"
  return row.status === "approved" ? "done" : "draft"
}

/**
 * THE WORDS STORELIB WRITES ITSELF are English: the shop's own words (a cart,
 * Add to cart, `ui:`), the checkout's (`checkout:`) and a buyer's emails'
 * (`email:`). A website written in
 * another language translates those two groups into its own language too,
 * and only those: the rest of its text is already in it.
 */
export const isEnglish = (locale: string) => /^en(-|$)/i.test(locale)
export const BUILT_IN_GROUPS: ReadonlySet<string> = new Set(["ui", "checkout", "emails", "theme-words"])
export const isBuiltInWordKey = (key: string) => /^(ui|checkout|email|tw):/.test(key)

/** An imported theme's own word, by its locale key (lib/storelib-theme/compat/theme.ts defaultWords). */
export const themeWordKey = (key: string) => `tw:${key}`

/**
 * A translation the merchant wrote or edited whose original has changed
 * since: still on the website, never rewritten by Storelib AI, and counted
 * in Settings until they edit it or keep it as it is.
 */
export function needsReview(row: TranslationRow | undefined, source: string): boolean {
  return !!row && row.source === "manual" && statusOf(row, source) === "outdated"
}

/** What Storelib AI may write, by the press or the automatic run: missing, or outdated and its own. Never the merchant's words. */
export function aiMayWrite(row: TranslationRow | undefined, source: string): boolean {
  if (row?.source === "manual") return false
  const s = statusOf(row, source)
  return s === "missing" || s === "outdated"
}

/**
 * Translations already written for the same original under another key
 * ("Shop" in the header menu and the footer's), by the original's hash:
 * reused as they are, with no call to Storelib AI. Approved ones only,
 * and the merchant's own first.
 */
export function reusableTranslations(rows: TranslationRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of [...rows].sort((a, b) => (a.source === "manual" ? 0 : 1) - (b.source === "manual" ? 0 : 1))) {
    if (r.status !== "approved" || !r.value.trim() || out.has(r.sourceHash)) continue
    out.set(r.sourceHash, r.value)
  }
  return out
}

/**
 * The sections in a language: every text setting with a value laid over,
 * everything else the original's. A new array; the original is untouched.
 */
export function localizeSections(sections: SectionInstance[], map: TranslationMap | null | undefined, fieldsOf: FieldsOf, blockFieldsOf: BlockFieldsOf, opts: TranslateOpts = {}): SectionInstance[] {
  if (!map || map.size === 0) return sections
  const over = (fields: SchemaField[] | undefined, settings: Record<string, unknown>, key: (id: string) => string) => {
    let next: Record<string, unknown> | null = null
    for (const f of fields ?? []) {
      if (!isWordsField(f)) continue
      const shown = shownText(f, settings?.[f.id])
      if (shown === null) continue
      const v = valueFor(map, key(f.id), opts, shown)
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
export function localizeRecord<T extends Record<string, unknown>>(record: T, prefix: string, fields: readonly (keyof T & string)[], map: TranslationMap | null | undefined, opts: TranslateOpts = {}): T {
  if (!map || map.size === 0) return record
  let next: T | null = null
  for (const f of fields) {
    if (typeof record[f] !== "string") continue
    const v = valueFor(map, `${prefix}:${f}`, opts, record[f] as string)
    if (v === null) continue
    next = next ?? { ...record }
    ;(next as Record<string, unknown>)[f] = v
  }
  return next ?? record
}

/**
 * Product cards with their titles and descriptions laid over, in the
 * builder's canvas and on the live site (live.ts cards). A card's
 * description is plain text (shop-products plainDescription) and its
 * translation is the product's rich text, so it is made plain the same way.
 */
export function localizeCards<T extends { id: string; settings: unknown }>(list: T[], map: TranslationMap | null | undefined, opts: TranslateOpts = {}, original?: ReadonlySet<string> | null): T[] {
  if (!map || map.size === 0) return list
  return list.map((c) => {
    /* A product the merchant shows in its own language everywhere (Products › Translations): its card stays as written. */
    if (original?.has(c.id)) return c
    const own = c.settings as Record<string, unknown>
    const title = typeof own.title === "string" ? valueFor(map, `product:${c.id}:title`, opts, own.title) : null
    /* The card holds a plain excerpt of the description, not the text it was translated from: no freshness to compare here. */
    const description = typeof own.description === "string" ? valueFor(map, `product:${c.id}:description`, opts) : null
    /* Its options and variants' names, from the shop's option words (localizeOptions). */
    const optioned = localizeOptions(own, map, opts)
    if (title === null && description === null && optioned === own) return c
    return { ...c, settings: { ...optioned, ...(title !== null ? { title } : {}), ...(description !== null ? { description: plainDescription(description) } : {}) } }
  })
}

/* ── Product options ───────────────────────────────────────────────────── */

/** An option's name or value, keyed by its words: "Small" is translated once for every product that has it. */
export const optionKey = (text: string) => `option:${sourceHash(text.trim())}`

type OptionList = { name: string; values: string[] }[]

/** Every distinct option name and value of these products, in order, for the translations list. */
export function optionTranslatables(lists: OptionList[]): Translatable[] {
  const out: Translatable[] = []
  const seen = new Set<string>()
  const add = (text: string, label: string, where: string) => {
    const t = text.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push({ key: optionKey(t), source: t, label, where, multiline: false })
  }
  for (const list of lists) {
    for (const o of list) {
      add(o.name, "Option", o.name)
      for (const v of o.values) add(v, "Value", o.name)
    }
  }
  return out
}

/**
 * A product's options and variants in a language: the option names and
 * values, each variant's values, and its name when it is made of them
 * ("S / Red", as the product editor names a variant). Card settings and the
 * product page's data alike. Variant ids and prices are untouched, so the
 * chips still match the variant they buy.
 */
export function localizeOptions<T>(data: T, map: TranslationMap | null | undefined, opts: TranslateOpts = {}): T {
  if (!map || map.size === 0 || !data || typeof data !== "object") return data
  const own = data as Record<string, unknown>
  const word = (text: unknown): unknown => (typeof text === "string" && text.trim() ? (valueFor(map, optionKey(text), opts, text.trim()) ?? text) : text)
  let changed = false
  const out: Record<string, unknown> = { ...own }
  if (Array.isArray(own.options)) {
    out.options = (own.options as { name?: unknown; values?: unknown }[]).map((o) => (o && typeof o === "object" ? { ...o, name: word(o.name), values: Array.isArray(o.values) ? o.values.map(word) : o.values } : o))
    changed = true
  }
  if (Array.isArray(own.variants)) {
    out.variants = (own.variants as Record<string, unknown>[]).map((v) => {
      if (!v || typeof v !== "object") return v
      const values = Array.isArray(v.options) ? (v.options as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "") : []
      const parts = typeof v.name === "string" ? v.name.split(" / ").map((p) => p.trim()) : []
      /* Named from its values: written again from their translations. Named by the merchant: left as named, unless it is one value. */
      const madeOfValues = parts.length > 0 && (values.length ? parts.length === values.length && parts.every((p, i) => p === values[i].trim()) : parts.length === 1)
      return {
        ...v,
        ...(madeOfValues ? { name: parts.map((p) => word(p)).join(" / ") } : {}),
        ...(Array.isArray(v.options) ? { options: (v.options as unknown[]).map((x) => (typeof x === "string" ? word(x) : x)) } : {}),
      }
    })
    changed = true
  }
  return (changed ? out : data) as T
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

/** Theme settings that are a setting's id and never words to translate, though their control takes text: the shop's own name. */
const THEME_NOT_WORDS = new Set(["brand_name"])

/**
 * The theme's own words (Theme settings: Branding's tagline, headline and
 * description, the sale badge, the cookie banner), by `theme:<setting id>`.
 * `fields` is the theme settings schema, so a text setting added to it later
 * is translatable with nothing else to change.
 */
export function themeTextTranslatables(theme: Record<string, unknown> | null | undefined, fields: readonly SchemaField[]): Translatable[] {
  const out: Translatable[] = []
  for (const f of fields) {
    if (!isWordsField(f) || THEME_NOT_WORDS.has(f.id)) continue
    /* Its default when never set: the cookie banner's sentence and buttons, the sale badge's word. */
    const v = shownText(f, theme?.[f.id])
    if (typeof v === "string" && v.trim()) out.push({ key: `theme:${f.id}`, source: v, label: f.label, where: "Theme settings", multiline: f.type !== "text" })
  }
  return out
}

/**
 * The theme's settings in a language: its menus, its own words (theme:<id>),
 * and its and its pages' search engine text. `fields`, the theme settings
 * schema (as themeTextTranslatables takes it), lays a translation over a
 * setting never set, whose default is what the page shows. Passed in rather
 * than imported, so the checkout's bundle, which reads this file, does not
 * carry the whole schema.
 */
export function localizeTheme<T extends Record<string, unknown>>(theme: T, map: TranslationMap | null | undefined, opts: TranslateOpts = {}, fields: readonly SchemaField[] = []): T {
  if (!map || map.size === 0) return theme
  const next: Record<string, unknown> = { ...theme }
  if (theme.menus && typeof theme.menus === "object") next.menus = localizeMenus(theme.menus as Record<string, MenuLike>, map, opts)
  for (const key of map.keys()) {
    if (!key.startsWith("theme:")) continue
    const id = key.slice(6)
    const field = fields.find((f) => f.id === id && isWordsField(f))
    const shown = field ? shownText(field, theme[id]) : typeof theme[id] === "string" ? (theme[id] as string) : null
    if (THEME_NOT_WORDS.has(id) || shown === null) continue
    const v = valueFor(map, key, opts, shown)
    if (v !== null) next[id] = v
  }
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

/* ── A product's own fields (Products › Translations) ─────────────────── */

/** A product's fields that have their own translation, in the order Products › Translations lists them. */
export const PRODUCT_TRANSLATED_FIELDS = ["title", "description", "seo_title", "seo_description"] as const
export type ProductTranslatedField = (typeof PRODUCT_TRANSLATED_FIELDS)[number]
export const productKey = (productId: string, field: ProductTranslatedField) => `product:${productId}:${field}`
