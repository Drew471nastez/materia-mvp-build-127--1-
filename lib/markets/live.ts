import "server-only"

/**
 * ===========================================================================
 *  THE LIVE WEBSITE IN ANOTHER LANGUAGE
 * ===========================================================================
 * A visitor at /fr/… of a website built in the website builder (the proxy
 * sends them to /w/<name>~fr/…, lib/markets/site-name.ts) gets the same
 * page, with every text the store approved a French translation for laid
 * over the original before anything is drawn: its sections and blocks, the
 * header and footer, the product it is about and the products in its lists.
 * Anything not translated stays in the website's own language, never blank.
 *
 * Only APPROVED translations, only a PUBLISHED language: an AI draft, or a
 * language the store is still preparing, is never on the live website.
 *
 * The site's creator pages, Explore and imported Shopify themes are not
 * touched by this (the first two stay as they are, the third has its own
 * pages).
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { schemaLookupFrom } from "@/lib/website-builder/custom-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { SectionInstance, SectionSchema } from "@/lib/website-builder/types"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { SiteLanguageChoice } from "@/components/website-builder/theme/language-switch"
import { localizationTag, marketsMissing, cachedTranslations } from "./server"
import { languageName, localizedPath, normalizeLocale } from "./locales"
import { localizeRecord, localizeSections, localizeTheme, translationMap, type TranslationMap } from "./translate"

export interface SiteLanguages {
  defaultLanguage: string
  /** The published languages other than the default, in the store's order. */
  others: string[]
}

const NONE: SiteLanguages = { defaultLanguage: "en", others: [] }

async function readLanguages(creatorId: string): Promise<SiteLanguages> {
  const { data, error } = await createAdminClient().from("store_localization").select("default_language, languages").eq("creator_id", creatorId).maybeSingle()
  if (error) {
    if (!marketsMissing(error)) throw error
    return NONE
  }
  if (!data) return NONE
  const row = data as { default_language?: unknown; languages?: unknown }
  const def = normalizeLocale(row.default_language) ?? "en"
  const others: string[] = []
  for (const l of Array.isArray(row.languages) ? row.languages : []) {
    const code = normalizeLocale((l as { code?: unknown })?.code)
    if (code && code !== def && (l as { published?: unknown }).published === true && !others.includes(code)) others.push(code)
  }
  return { defaultLanguage: def, others }
}

/** The website's languages, held until the store saves Markets and languages again. */
export function siteLanguages(creatorId: string): Promise<SiteLanguages> {
  return unstable_cache(() => readLanguages(creatorId), ["site-languages", creatorId], { tags: [localizationTag(creatorId)], revalidate: 300 })().catch(() => NONE)
}

const PRODUCT_FIELDS = ["title", "description", "seo_title", "seo_description"] as const

export interface Localizer {
  locale: string
  defaultLanguage: string
  sections(list: SectionInstance[], sources: Record<string, string> | undefined): SectionInstance[]
  product<T extends { id?: unknown } & Record<string, unknown>>(p: T): T
  cards<T extends ProductCard>(list: T[]): T[]
  /** The theme's settings: its menus, and its and its pages' search engine text. */
  theme<T extends Record<string, unknown>>(settings: T): T
}

/**
 * The overlay for one language of one store, or null when there is nothing
 * to lay over: no language asked for, one that is not published, or no
 * approved translation in it yet.
 */
export async function siteLocalizer(creatorId: string, locale: string | null | undefined): Promise<Localizer | null> {
  if (!locale) return null
  const langs = await siteLanguages(creatorId)
  const code = langs.others.find((l) => l.toLowerCase() === locale.toLowerCase())
  if (!code) return null
  const rows = await cachedTranslations(creatorId, code).catch(() => [])
  const map: TranslationMap = translationMap(rows.filter((r) => r.status === "approved"))
  const opts = { approvedOnly: true }
  return {
    locale: code,
    defaultLanguage: langs.defaultLanguage,
    sections(list, sources) {
      if (map.size === 0) return list
      const lookup = schemaLookupFrom(sources) ?? ((t: string) => SECTION_SCHEMAS[t])
      return localizeSections(
        list,
        map,
        (t) => lookup(t)?.fields,
        (st, bt) => (lookup(st) as SectionSchema | undefined)?.blocks?.find((b) => b.type === bt)?.fields,
        opts,
      )
    },
    product(p) {
      if (map.size === 0 || typeof p.id !== "string") return p
      return localizeRecord(p, `product:${p.id}`, PRODUCT_FIELDS.filter((f) => typeof p[f] === "string") as never, map, opts)
    },
    theme(settings) {
      return localizeTheme(settings, map, opts)
    },
    cards(list) {
      if (map.size === 0) return list
      return list.map((c) => {
        const title = localizeRecord({ title: c.settings.title }, `product:${c.id}`, ["title"], map, opts).title
        return title === c.settings.title ? c : { ...c, settings: { ...c.settings, title } }
      })
    },
  }
}

/**
 * What the page's language switch offers, or undefined for a website in one
 * language: `locale` is the language this page is drawn in (null, the
 * website's own).
 */
export async function languageChoice(creatorId: string, locale: string | null | undefined): Promise<SiteLanguageChoice | undefined> {
  const langs = await siteLanguages(creatorId)
  if (langs.others.length === 0) return undefined
  const all = [langs.defaultLanguage, ...langs.others]
  const code = (locale && all.find((l) => l.toLowerCase() === locale.toLowerCase())) || langs.defaultLanguage
  return { code, defaultLanguage: langs.defaultLanguage, languages: all.map((c) => ({ code: c, name: languageName(c) })) }
}

/**
 * The same page in every language, for search engines (hreflang), with
 * x-default the website's own: `path` is the page's address without a
 * language ("/products/mug").
 */
export async function languageAlternates(creatorId: string, origin: string, path: string): Promise<Record<string, string> | undefined> {
  const langs = await siteLanguages(creatorId)
  if (langs.others.length === 0) return undefined
  const out: Record<string, string> = {}
  for (const l of [langs.defaultLanguage, ...langs.others]) out[l] = `${origin}${localizedPath(path, l, langs.defaultLanguage)}`
  out["x-default"] = `${origin}${localizedPath(path, langs.defaultLanguage, langs.defaultLanguage)}`
  return out
}
