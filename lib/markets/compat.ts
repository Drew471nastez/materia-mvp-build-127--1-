import "server-only"

/**
 * ===========================================================================
 *  AN IMPORTED SHOPIFY THEME IN THE WEBSITE'S OTHER LANGUAGES
 * ===========================================================================
 * The same as lib/markets/live.ts does for a builder theme, for a website
 * whose theme was imported from Shopify (lib/storelib-theme/compat): the
 * proxy sends /fr/… to the theme with the language named, and here, per
 * request and outside every cache, the site it draws gets
 *
 *   - every text the store approved a translation for laid over its
 *     sections and blocks (read with the theme's own schemas), its menus,
 *     and its products' titles and descriptions
 *   - `i18n`: the page's language and every published one, which the
 *     theme's language selector, request.locale, shop.published_locales and
 *     routes read, and which picks the theme's own locale file for `| t`
 *   - a small script that keeps every link of the page in its language
 *
 * Anything not translated stays as written; a language that is not
 * published draws the website as it is.
 */
import type { SiteData } from "@/lib/storelib-theme/compat/site"
import type { StoredSection } from "@/lib/storelib-theme/compat/page"
import type { CompatTheme } from "@/lib/storelib-theme/compat/theme"
import type { SchemaField, SectionInstance } from "@/lib/website-builder/types"
import { cachedTranslations } from "./server"
import { siteLanguages } from "./live"
import { localizeMenus, localizeRecord, localizeSections, translationMap, type TranslationMap } from "./translate"
import { linkLanguageScript } from "./link-script"

type O = Record<string, unknown>

/** The theme's own schema settings, as the translation reader takes them ({ id, type }). */
function settingsOf(schema: O | undefined): SchemaField[] | undefined {
  const list = schema?.settings
  return Array.isArray(list) ? (list as SchemaField[]).filter((f) => f && typeof f === "object" && typeof (f as { id?: unknown }).id === "string") : undefined
}

/** Which of a section's and a block's settings are text, for an imported theme: its section files' and theme blocks' schemas. */
export function compatFields(theme: CompatTheme): { fieldsOf: (t: string) => SchemaField[] | undefined; blockFieldsOf: (st: string, bt: string) => SchemaField[] | undefined } {
  /* Labels in the theme's own words ("Heading", not "t:sections.hero.settings.heading.label"), for the Translate sheet. */
  const named = (list: SchemaField[] | undefined) => list?.map((f) => ({ ...f, label: theme.schemaLabel((f as { label?: unknown }).label) || f.id }))
  return {
    fieldsOf: (t) => named(settingsOf(theme.schemaOf("sections", t))),
    blockFieldsOf: (st, bt) => {
      const own = (Array.isArray(theme.schemaOf("sections", st).blocks) ? (theme.schemaOf("sections", st).blocks as O[]) : []).find((b) => b.type === bt)
      return named(settingsOf(own) ?? settingsOf(theme.schemaOf("blocks", bt)))
    },
  }
}

/**
 * The site for one request, in `locale` (null: the website's own
 * language). Untouched when the store has one language.
 */
export async function localizeCompatSite(site: SiteData, locale: string | null): Promise<SiteData> {
  const langs = await siteLanguages(site.creatorId)
  if (!langs.saved || langs.others.length === 0) return site
  const all = [langs.defaultLanguage, ...langs.others]
  const code = (locale && langs.others.find((l) => l.toLowerCase() === locale.toLowerCase())) || null
  const i18n = { ...(site.i18n ?? {}), locale: code ?? langs.defaultLanguage, defaultLanguage: langs.defaultLanguage, languages: all }
  if (!code) return { ...site, i18n }

  const rows = await cachedTranslations(site.creatorId, code).catch(() => [])
  const map: TranslationMap = translationMap(rows.filter((r) => r.status === "approved"))
  const script = linkLanguageScript(code, langs.defaultLanguage, all)
  const extraBodyEnd = `${site.extraBodyEnd ?? ""}${script}`
  if (map.size === 0) return { ...site, i18n, extraBodyEnd }

  const opts = { approvedOnly: true }
  const { fieldsOf, blockFieldsOf } = compatFields(site.theme)
  const pages: Record<string, StoredSection[]> = {}
  for (const [key, list] of Object.entries(site.pages)) pages[key] = localizeSections(list as unknown as SectionInstance[], map, fieldsOf, blockFieldsOf, opts) as unknown as StoredSection[]
  const card = <T extends { id: string; settings: O; descriptionHtml?: string }>(c: T): T => {
    const settings = localizeRecord(c.settings, `product:${c.id}`, ["title", "description"], map, opts)
    const html = c.descriptionHtml !== undefined ? (localizeRecord({ description: c.descriptionHtml }, `product:${c.id}`, ["description"], map, opts).description as string) : undefined
    return settings === c.settings && html === c.descriptionHtml ? c : { ...c, settings, ...(html !== undefined ? { descriptionHtml: html } : {}) }
  }
  const product = site.product
  return {
    ...site,
    i18n,
    extraBodyEnd,
    pages,
    products: site.products.map((p) => card(p as never)) as SiteData["products"],
    pickable: site.pickable?.map((p) => card(p as never)) as SiteData["pickable"],
    menus: localizeMenus(site.menus as never, map, opts) as SiteData["menus"],
    product: product ? async (handle) => { const p = await product(handle); return p ? card(p as never) : p } : undefined,
  }
}
