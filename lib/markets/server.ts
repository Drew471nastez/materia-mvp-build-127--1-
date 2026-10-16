import "server-only"

/**
 * ===========================================================================
 *  MARKETS, LANGUAGES AND TRANSLATIONS: READ AND WRITTEN ON THE SERVER ONLY
 * ===========================================================================
 * The three tables of SQL part 136 are the service role's alone; every page
 * and route that reads them names the store it is for (the caller's own,
 * through lib/team), and nothing here takes a store from a request.
 *
 *   localizationOf    the store's settings, or the default (one language,
 *                     one market) when it has none or part 136 has not run
 *   translationsOf    one language's values, by key
 *   siteTexts         every piece of text on the store's website (its
 *                     published pages, or its draft when nothing is
 *                     published yet), products and collections, in order
 *
 * The live website reads the first two through the cached readers at the
 * end, invalidated by tag when the settings or a translation is saved.
 */
import { uiTranslatables } from "./ui-words"
import { checkoutTranslatables, emailTranslatables } from "./checkout-words"
import { unstable_cache, revalidateTag } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { pageSections } from "@/lib/website-builder/preview-link"
import { sectionSources } from "@/lib/website-builder/storefront-render"
import { textFieldsFrom } from "@/lib/website-builder/custom-schemas"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import type { SectionInstance } from "@/lib/website-builder/types"
import { defaultLocalization, validateLocalization, type Localization } from "./model"
import { normalizeLocale } from "./locales"
import { MAX_TRANSLATION_LENGTH, isTranslationKey, menuTranslatables, optionTranslatables, themeWordKey, seoTranslatables, sourceHash, themeTextTranslatables, translatablesOf, type Translatable, type TranslationRow } from "./translate"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { storeMenusOrNull } from "@/lib/website-builder/store-menus-server"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { compatThemeFor, installFiles } from "@/lib/website-builder/compat-site"
import { compatFields } from "./compat"
import { markTranslationsChanged, queueMissing } from "./translate-queue"
import { withCurated } from "./curated-words"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const MARKETS_NOT_SET_UP = "Markets and languages aren't set up yet. Run SQL part 136 in Supabase, then try again."

/** Part 136 has not run: the table is not there (or not in the schema cache yet). */
export function marketsMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || /does not exist|schema cache/i.test(error.message ?? "")
}

export const localizationTag = (creatorId: string) => `site-localization:${creatorId}`
export const translationsTag = (creatorId: string, locale: string) => `site-translations:${creatorId}:${locale.toLowerCase()}`

/** The store's own country (Store details), the home market's first country when nothing is set. */
async function homeCountryOf(db: Db, creatorId: string): Promise<string | null> {
  /* The column is default_country (supabase/migrations/20261201_store_settings.sql): reading "country" errored and the home market never had one. */
  const { data } = await db.from("store_settings").select("default_country").eq("creator_id", creatorId).maybeSingle().then(
    (r: { data: unknown }) => r,
    () => ({ data: null }),
  )
  const c = (data as { default_country?: unknown } | null)?.default_country
  return typeof c === "string" && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null
}

/** The language the website is written in (Website Settings › General › Language), the default before Markets and languages is saved. */
async function websiteLanguageOf(db: Db, creatorId: string): Promise<string> {
  const { data } = await db
    .from("store_theme_installs")
    .select("store_theme_settings ( lang:settings->>site_language )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .limit(1)
    .maybeSingle()
    .then(
      (r: { data: unknown }) => r,
      () => ({ data: null }),
    )
  const nested = (data as { store_theme_settings?: { lang?: unknown } | { lang?: unknown }[] } | null)?.store_theme_settings
  const lang = Array.isArray(nested) ? nested[0]?.lang : nested?.lang
  return normalizeLocale(lang) ?? "en"
}

/** store_localization.visitor_language is SQL part 173's: a database without it answers as before, with the setting off. */
export function visitorLanguageMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && /visitor_language/.test(error.message ?? "")
}

export const VISITOR_LANGUAGE_NEEDS_PART = "Showing visitors their own language needs a database update. Run SQL part 173 in Supabase, then turn it on again."

/** The row, with Show visitors their own language when part 173 has run. */
export async function readLocalizationRow(db: Db, creatorId: string): Promise<{ data: { default_language: string; languages: unknown; markets: unknown; visitor_language?: boolean | null } | null; error: { code?: string; message?: string } | null }> {
  const first = await db.from("store_localization").select("default_language, languages, markets, visitor_language").eq("creator_id", creatorId).maybeSingle()
  if (!visitorLanguageMissing(first.error)) return first
  return db.from("store_localization").select("default_language, languages, markets").eq("creator_id", creatorId).maybeSingle()
}

/** store_localization.auto_translate and auto_translate_run are SQL part 175's: a database without them reads as the setting off. */
export function autoTranslateMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && /auto_translate/.test(error.message ?? "")
}

export const AUTO_TRANSLATE_NEEDS_PART = "Translating changes automatically needs a database update. Run SQL part 175 in Supabase, then turn it on again."

/** What the last automatic run did (lib/markets/auto-translate.ts), for the switch to say. */
export interface AutoTranslateRun {
  /** When it ran, ISO. */
  at: string
  /** Texts translated and put live. */
  translated: number
  /** Texts still to do, for the next run. */
  left: number
  /** Set when Storelib AI could not be reached (no key, no credit, every call failed): the switch says it tries again. */
  error?: "unavailable"
  /** Changes saved since, waiting for the next run (store_localization.translate_dirty_at, part 186). Read, never stored in the run. */
  pending?: boolean
}

/** Translate changes automatically, and its last run. Off, with no run, before part 175 or on any failed read. */
export async function readAutoTranslate(db: Db, creatorId: string): Promise<{ on: boolean; run: AutoTranslateRun | null; ready: boolean }> {
  const read = (columns: string) =>
    db.from("store_localization").select(columns).eq("creator_id", creatorId).maybeSingle().then(
      (r: { data: unknown; error: { code?: string; message?: string } | null }) => r,
      (e: unknown) => ({ data: null, error: { message: String(e) } }),
    )
  let { data, error } = await read("auto_translate, auto_translate_run, translate_dirty_at")
  /* Part 186 not run: read as before, with nothing waiting. */
  if (error && queueMissing(error)) ({ data, error } = await read("auto_translate, auto_translate_run"))
  if (error) return { on: false, run: null, ready: !autoTranslateMissing(error) && !marketsMissing(error) }
  const row = data as { auto_translate?: boolean | null; auto_translate_run?: Partial<AutoTranslateRun> | null; translate_dirty_at?: string | null } | null
  const r = row?.auto_translate_run
  const pending = typeof row?.translate_dirty_at === "string"
  const run = r && typeof r.at === "string" ? { at: r.at, translated: Number(r.translated) || 0, left: Number(r.left) || 0, ...(r.error === "unavailable" ? { error: "unavailable" as const } : {}), ...(pending ? { pending: true } : {}) } : pending ? { at: "", translated: 0, left: 0, pending: true } : null
  return { on: row?.auto_translate === true, run, ready: true }
}

export async function localizationOf(db: Db, creatorId: string, baseCurrency: string): Promise<{ ready: boolean; value: Localization; autoTranslateRun?: AutoTranslateRun | null; homeCountry: string | null }> {
  const [{ data, error }, auto, homeCountry] = await Promise.all([readLocalizationRow(db, creatorId), readAutoTranslate(db, creatorId), homeCountryOf(db, creatorId)])
  const fresh = async () => defaultLocalization(homeCountry, await websiteLanguageOf(db, creatorId))
  if (error) return { ready: !marketsMissing(error), value: await fresh(), homeCountry }
  if (!data) return { ready: true, value: await fresh(), homeCountry }
  const row = data
  /* The store's own country is never in a More currencies market: a list saved with it in reads without it (lib/markets/market-countries.ts). */
  const checked = validateLocalization({ defaultLanguage: row.default_language, languages: row.languages, markets: row.markets, visitorLanguage: row.visitor_language === true, autoTranslate: auto.on }, { baseCurrency, homeCountry })
  if (checked.ok) return { ready: true, value: checked.value, autoTranslateRun: auto.run, homeCountry }
  /*
    A SAVED LIST NEVER LOST. Markets saved under another store currency can
    stop passing the check after the currency changes; the languages did not
    change, so they are kept and only the markets start again from the home
    one. Losing them read as "French isn't saved on your website yet".
  */
  const home = defaultLocalization(homeCountry, row.default_language)
  const kept = validateLocalization({ defaultLanguage: row.default_language, languages: row.languages, markets: home.markets, visitorLanguage: row.visitor_language === true, autoTranslate: auto.on }, { baseCurrency, homeCountry })
  return { ready: true, value: kept.ok ? kept.value : home, autoTranslateRun: auto.run, homeCountry }
}

export async function saveLocalization(db: Db, creatorId: string, input: unknown, baseCurrency: string): Promise<{ ok: true; value: Localization } | { ok: false; status: number; error: string }> {
  const checked = validateLocalization(input, { baseCurrency, homeCountry: await homeCountryOf(db, creatorId) })
  if (checked.ok === false) return { ok: false, status: 400, error: checked.error }
  const v = checked.value
  const row = { creator_id: creatorId, default_language: v.defaultLanguage, languages: v.languages, markets: v.markets, updated_at: new Date().toISOString() }
  let { error } = await db.from("store_localization").upsert({ ...row, visitor_language: v.visitorLanguage === true }, { onConflict: "creator_id" })
  /* Part 173 not run: everything else is kept, and the switch says what it needs when it was turned on. */
  if (error && visitorLanguageMissing(error)) {
    ;({ error } = await db.from("store_localization").upsert(row, { onConflict: "creator_id" }))
    if (!error && v.visitorLanguage) {
      revalidateTag(localizationTag(creatorId), { expire: 0 })
      return { ok: false, status: 409, error: VISITOR_LANGUAGE_NEEDS_PART }
    }
    v.visitorLanguage = false
  }
  if (error) return marketsMissing(error) ? { ok: false, status: 503, error: MARKETS_NOT_SET_UP } : { ok: false, status: 500, error: "Could not save. Try again." }
  /* Translate changes automatically: its own write, so a database without part 175 keeps everything else and the switch says what it needs. */
  const auto = await db.from("store_localization").update({ auto_translate: v.autoTranslate === true }).eq("creator_id", creatorId).then(
    (r: { error: { code?: string; message?: string } | null }) => r,
    (e: unknown) => ({ error: { message: String(e) } }),
  )
  if (auto.error) {
    revalidateTag(localizationTag(creatorId), { expire: 0 })
    if (!autoTranslateMissing(auto.error)) return { ok: false, status: 500, error: "Could not save. Try again." }
    if (v.autoTranslate) return { ok: false, status: 409, error: AUTO_TRANSLATE_NEEDS_PART }
    v.autoTranslate = false
  }
  /* Turned on, or a language added with it on: the next three-minute run translates what is missing (./translate-queue.ts). */
  if (!auto.error && v.autoTranslate) await markTranslationsChanged(db, creatorId)
  revalidateTag(localizationTag(creatorId), { expire: 0 })
  return { ok: true, value: v }
}

/**
 * One language's translations as everything reads them: the saved rows with
 * Storelib's hand written shop and checkout words laid in (./curated-words.ts),
 * so the live site, the Translate sheet and the automatic run all see a
 * written word as done. A word the merchant wrote stays theirs.
 */
export async function translationsOf(db: Db, creatorId: string, locale: string): Promise<{ ready: boolean; rows: TranslationRow[] }> {
  const saved = await savedTranslations(db, creatorId, locale)
  return { ready: saved.ready, rows: withCurated(saved.rows, locale) }
}

/** The rows saved for one language, and nothing else. */
export async function savedTranslations(db: Db, creatorId: string, locale: string): Promise<{ ready: boolean; rows: TranslationRow[] }> {
  const rows: TranslationRow[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db
      .from("site_translations")
      .select("key, value, source_hash, status, source")
      .eq("creator_id", creatorId)
      .eq("locale", locale)
      .order("id", { ascending: true })
      .range(from, from + 999)
    if (error) return { ready: !marketsMissing(error), rows: [] }
    for (const r of (data ?? []) as { key: string; value: string; source_hash: string; status: string; source: string }[]) {
      rows.push({ key: r.key, value: r.value, sourceHash: r.source_hash, status: r.status === "approved" ? "approved" : "draft", source: r.source === "ai" ? "ai" : "manual" })
    }
    if ((data ?? []).length < 1000) break
  }
  return { ready: true, rows }
}

export interface TranslationWrite {
  key: string
  /** An empty value takes the translation away: the original shows again. */
  value: string
  /** The original as the person saw it, so a later change to it reads as outdated. */
  source: string
  approved: boolean
  /** Written by the AI and not yet looked at by a person. */
  ai?: boolean
  /** A rich text setting: its HTML is cleaned as the original's is. */
  rich?: boolean
}

const escapeText = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
/** Plain words as rich text: a blank line starts a paragraph, a single line break stays one. */
export function paragraphsOf(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeText(p).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

/** One language's values, saved. Each is checked: a known key shape, a sane length, rich text cleaned, plain text kept plain. */
export async function saveTranslations(
  db: Db,
  creatorId: string,
  locale: string,
  items: unknown,
  userId: string | null,
  /** keepManual: an AI write, which never replaces a translation the merchant wrote (read again here, just before the write). */
  opts: { keepManual?: boolean } = {},
): Promise<{ ok: true; saved: number; removed: number } | { ok: false; status: number; error: string }> {
  const lang = normalizeLocale(locale)
  if (!lang) return { ok: false, status: 400, error: "That isn't a language we recognise." }
  if (!Array.isArray(items) || items.length === 0) return { ok: true, saved: 0, removed: 0 }
  if (items.length > 500) return { ok: false, status: 400, error: "Save up to 500 at a time." }
  const upserts: Record<string, unknown>[] = []
  const removals: string[] = []
  const now = new Date().toISOString()
  for (const raw of items as Partial<TranslationWrite>[]) {
    if (!isTranslationKey(raw?.key)) return { ok: false, status: 400, error: "One of the texts isn't one we know." }
    const source = typeof raw.source === "string" ? raw.source : ""
    let value = typeof raw.value === "string" ? raw.value.replace(/\r\n?/g, "\n") : ""
    /* Rich text typed as plain words (the Translate sheet's field): its paragraphs and line breaks made into the HTML the original is drawn from. */
    if (raw.rich && !/<[a-z][\s\S]*>/i.test(value)) value = paragraphsOf(value)
    value = raw.rich ? sanitizeRichText(value) : value.replace(/<[^>]*>/g, "")
    value = value.slice(0, MAX_TRANSLATION_LENGTH)
    if (!value.trim()) {
      removals.push(raw.key)
      continue
    }
    upserts.push({ creator_id: creatorId, locale: lang, key: raw.key, value, source_hash: sourceHash(source), status: raw.approved === false ? "draft" : "approved", source: raw.ai ? "ai" : "manual", updated_by: userId, updated_at: now })
  }
  /*
    ONE ROW PER KEY. The same text can come in twice in one write (a header
    or footer read on more than one page, a product in two collections), and
    Postgres refuses an upsert that touches a row twice ("cannot affect row a
    second time"): the whole write failed with "Could not save the
    translations". The last one wins.
  */
  for (let i = upserts.length - 1, seen = new Set<string>(); i >= 0; i--) {
    const k = upserts[i].key as string
    if (seen.has(k)) upserts.splice(i, 1)
    else seen.add(k)
  }
  if (upserts.length && opts.keepManual) {
    const { data: theirs } = await db.from("site_translations").select("key").eq("creator_id", creatorId).eq("locale", lang).eq("source", "manual").in("key", upserts.map((u) => u.key as string))
    const kept = new Set(((theirs ?? []) as { key: string }[]).map((r) => r.key))
    for (let i = upserts.length - 1; i >= 0; i--) if (kept.has(upserts[i].key as string)) upserts.splice(i, 1)
  }
  if (upserts.length) {
    const { error } = await db.from("site_translations").upsert(upserts, { onConflict: "creator_id,locale,key" })
    if (error) {
      console.error(`[translations] save ${lang}: ${error.code ?? ""} ${String(error.message ?? "").slice(0, 200)}`)
      return marketsMissing(error) ? { ok: false, status: 503, error: MARKETS_NOT_SET_UP } : { ok: false, status: 500, error: "Could not save the translations. Try again." }
    }
  }
  if (removals.length) {
    const { error } = await db.from("site_translations").delete().eq("creator_id", creatorId).eq("locale", lang).in("key", removals)
    if (error && !marketsMissing(error)) return { ok: false, status: 500, error: "Could not save the translations. Try again." }
  }
  revalidateTag(translationsTag(creatorId, lang), { expire: 0 })
  return { ok: true, saved: upserts.length, removed: removals.length }
}

/* ── What there is to translate ───────────────────────────────────────── */

/** A page's name, as the translations list heads its group. */
function pageName(key: string): string {
  if (key === "home") return "Home page"
  if (key === "product") return "Product page"
  if (key === "collection" || key === "collections") return "Collections"
  return key.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase())
}

export interface TextGroup {
  id: string
  title: string
  items: Translatable[]
}

/**
 * Every piece of text on the store's website, grouped by where it is: each
 * page's sections (the header and footer once, under their own name), then
 * products and collections. The website's published pages; when nothing is
 * published yet, its draft, so a creator can prepare a language first.
 */
export async function siteTexts(db: Db, creatorId: string): Promise<TextGroup[]> {
  /*
    STARTED TOGETHER. The menus, the products and the collections need
    nothing from the theme, and were read after it, one after another: four
    round trips in a row before the translation sheet could open. They are
    asked for now and awaited where they are used.
  */
  const menusRead = storeMenusOrNull(db, creatorId).catch(() => null)
  /* `.then` is what sends a query (it is lazy until then); its failure is still this function's, below, and marked handled until it is awaited there. */
  const productsRead = db.from("products").select("id, title, description, seo_title, seo_description").eq("creator_id", creatorId).eq("status", "published").order("created_at", { ascending: false }).limit(200).then((r: { data: unknown }) => r)
  productsRead.catch(() => undefined)
  const collectionsRead = db.from("product_collections").select("id, title, description").eq("creator_id", creatorId).limit(200).then(
    (r: { data: unknown }) => r,
    () => ({ data: [] }),
  )
  const { data: install } = await db.from("store_theme_installs").select("id, status").eq("creator_id", creatorId).order("status", { ascending: false }).limit(5)
  const installs = (install ?? []) as { id: string; status: string }[]
  const chosen = installs.find((i) => i.status === "published") ?? installs[0]
  const groups: TextGroup[] = []
  let themeWords: Translatable[] = []
  if (chosen) {
    const [sources, pagesRead, themeRead] = await Promise.all([
      sectionSources(db as never, chosen.id).catch(() => ({}) as Record<string, string>),
      db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", chosen.id),
      db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", chosen.id).maybeSingle().then(
        (r: { data: unknown }) => r,
        () => ({ data: null }),
      ),
    ])
    const themeRow = themeRead?.data as { settings?: Record<string, unknown> | null; draft_settings?: Record<string, unknown> | null } | null
    const themeValues = (chosen.status === "published" ? themeRow?.settings : (themeRow?.draft_settings ?? themeRow?.settings)) ?? null
    /* A section's own blocks and the theme's (a heading in a Blocks section), as the live site lays them over (live.ts). */
    let { fieldsOf, blockFieldsOf } = textFieldsFrom(sources)
    /* A theme imported from Shopify: its texts read with its own section and block schemas (lib/markets/compat.ts), as the live website lays them over. */
    if (compatOf(themeValues)) {
      const files = await installFiles(db, chosen.id, chosen.status !== "published").catch(() => null)
      if (files) {
        const compatTheme = compatThemeFor(chosen.id, "texts", files, themeValues)
        const read = compatFields(compatTheme)
        fieldsOf = read.fieldsOf
        blockFieldsOf = read.blockFieldsOf
        /* Its own words (`| t`, its default locale file), for a language the theme does not ship: laid over by lib/markets/compat.ts. */
        themeWords = compatTheme.defaultWords().map((w) => ({ key: themeWordKey(w.key), source: w.value, label: w.key, where: "Theme words", multiline: w.value.length > 80 }))
      }
    }
    const seenChrome = new Set<string>()
    const rows = ((pagesRead?.data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]).sort((a, b) => (a.page_key === "home" ? -1 : b.page_key === "home" ? 1 : a.page_key.localeCompare(b.page_key)))
    const chrome: Translatable[] = []
    for (const r of rows) {
      const sections = pageSections<SectionInstance[]>(r as never, chosen.status !== "published") ?? pageSections<SectionInstance[]>(r as never, true) ?? []
      const body: SectionInstance[] = []
      for (const s of sections) {
        const isChrome = s.group === "header" || s.group === "footer" || (!s.group && (s.type === "header" || s.type === "footer"))
        if (!isChrome) body.push(s)
        else if (!seenChrome.has(s.id)) {
          seenChrome.add(s.id)
          chrome.push(...translatablesOf([s], fieldsOf, blockFieldsOf))
        }
      }
      const items = translatablesOf(body, fieldsOf, blockFieldsOf)
      if (items.length) groups.push({ id: `page:${r.page_key}`, title: pageName(r.page_key), items })
    }
    if (chrome.length) groups.unshift({ id: "chrome", title: "Header and footer", items: chrome })

    /* The store's menus (the header's and footer's links), and the website's search engine text. */
    const menus = await menusRead
    const theme = themeValues
    const menuItems = menuTranslatables((menus ?? (theme?.menus as never)) ?? null)
    if (menuItems.length) groups.splice(groups[0]?.id === "chrome" ? 1 : 0, 0, { id: "menus", title: "Menus", items: menuItems })
    const seoItems = seoTranslatables(theme)
    if (seoItems.length) groups.push({ id: "seo", title: "Search engines", items: seoItems })
    /* The theme's own words: Branding's tagline and headline, the sale badge, the cookie banner (translate.ts themeTextTranslatables). */
    const themeItems = themeTextTranslatables(theme, THEME_SETTINGS_GROUPS.flatMap((g) => g.fields ?? []))
    if (themeItems.length) groups.push({ id: "theme", title: "Theme settings", items: themeItems })
  }

  const { data: products } = await productsRead
  const productItems: Translatable[] = []
  for (const p of (products ?? []) as Record<string, unknown>[]) {
    const title = typeof p.title === "string" ? p.title : ""
    const where = title || "Product"
    if (title) productItems.push({ key: `product:${p.id}:title`, source: title, label: "Title", where, multiline: false })
    if (typeof p.description === "string" && p.description.trim()) productItems.push({ key: `product:${p.id}:description`, source: p.description, label: "Description", where, multiline: true })
    if (typeof p.seo_title === "string" && p.seo_title.trim()) productItems.push({ key: `product:${p.id}:seo_title`, source: p.seo_title, label: "Search engine title", where, multiline: false })
    if (typeof p.seo_description === "string" && p.seo_description.trim()) productItems.push({ key: `product:${p.id}:seo_description`, source: p.seo_description, label: "Search engine description", where, multiline: true })
  }
  if (productItems.length) groups.push({ id: "products", title: "Products", items: productItems })
  /* Their option names and values (Size, Small), once each for the whole shop (translate.ts optionKey). */
  const productIds = ((products ?? []) as { id?: unknown }[]).map((p) => p.id).filter((id): id is string => typeof id === "string")
  if (productIds.length) {
    const { data: optionRows } = await db.from("product_options").select("product_id, name, values, position").in("product_id", productIds).order("position", { ascending: true }).then(
      (r: { data: unknown }) => r,
      () => ({ data: [] }),
    )
    const lists = productIds.map((id) =>
      ((optionRows ?? []) as { product_id?: unknown; name?: unknown; values?: unknown }[])
        .filter((o) => o.product_id === id && typeof o.name === "string" && Array.isArray(o.values))
        .map((o) => ({ name: o.name as string, values: (o.values as unknown[]).filter((v): v is string => typeof v === "string") })),
    )
    const optionItems = optionTranslatables(lists)
    if (optionItems.length) groups.push({ id: "options", title: "Product options", items: optionItems })
  }

  const { data: collections } = await collectionsRead
  const collectionItems: Translatable[] = []
  for (const c of (collections ?? []) as Record<string, unknown>[]) {
    const title = typeof c.title === "string" ? c.title : ""
    if (title) collectionItems.push({ key: `collection:${c.id}:title`, source: title, label: "Title", where: title, multiline: false })
    if (typeof c.description === "string" && c.description.trim()) collectionItems.push({ key: `collection:${c.id}:description`, source: c.description, label: "Description", where: title || "Collection", multiline: true })
  }
  if (collectionItems.length) groups.push({ id: "collections", title: "Collections", items: collectionItems })
  if (themeWords.length) groups.push({ id: "theme-words", title: "Theme words", items: themeWords })
  /* The words the theme draws itself: the cart's, the buy buttons' (lib/markets/ui-words.ts). */
  groups.push({ id: "ui", title: "Shop words", items: uiTranslatables() })
  /* The website's checkout, sentence by sentence (lib/markets/checkout-words.ts). */
  groups.push({ id: "checkout", title: "Checkout", items: checkoutTranslatables() })
  /* A buyer's emails: order confirmed, shipped, a return, a refund (lib/emails/words.ts). */
  groups.push({ id: "emails", title: "Order emails", items: emailTranslatables() })
  return groups
}

/* ── The live website's readers, cached ──────────────────────────────── */

/** The store's settings for its website, cached until they are saved again. */
export function cachedLocalization(creatorId: string, baseCurrency: string): Promise<Localization> {
  return unstable_cache(async () => (await localizationOf(createAdminClient(), creatorId, baseCurrency)).value, ["site-localization", creatorId, baseCurrency], {
    tags: [localizationTag(creatorId)],
    revalidate: 300,
  })()
}

/**
 * One language's values for the live website, cached until one of them is
 * saved again. The saved rows are what is held; the hand written words are
 * laid in after, so a deploy that corrects one shows it at once rather than
 * after a copy held from before it runs out.
 */
export function cachedTranslations(creatorId: string, locale: string): Promise<TranslationRow[]> {
  return unstable_cache(async () => (await savedTranslations(createAdminClient(), creatorId, locale)).rows, ["site-translations", creatorId, locale.toLowerCase()], {
    tags: [translationsTag(creatorId, locale)],
    revalidate: 300,
  })().then((rows) => withCurated(rows, locale))
}
