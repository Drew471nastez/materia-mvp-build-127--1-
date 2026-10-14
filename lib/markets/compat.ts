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
import type { SectionInstance } from "@/lib/website-builder/types"
import { cachedTranslations } from "./server"
import { marketPricing, siteLanguages, type LiveMarket } from "./live"
import { cachedRates } from "./fx-server"
import { fxFresh } from "./money"
import { commerceInMarket, compatPrices, compatShop, themeCountries } from "./compat-prices"
import { localizeMenus, localizeRecord, localizeSections, translationMap, type TranslationMap } from "./translate"
import { linkLanguageScript } from "./link-script"
import { compatFields } from "./compat-fields"

export { compatFields }

type O = Record<string, unknown>

/**
 * The site for one request: in `locale` (null: the website's own
 * language), and with prices in `market`'s currency when the visitor's
 * country is in a market that shows its own (null: the store's prices).
 * Untouched for a store with one language and no such market.
 */
export async function localizeCompatSite(site: SiteData, locale: string | null, market: string | null = null, visitorCountry: string | null = null): Promise<SiteData> {
  const langs = await siteLanguages(site.creatorId)
  const base = site.shop.currency ?? "USD"
  /*
    THE THEME'S OWN COUNTRY SELECTOR ("Show currency" on its header,
    announcement bar or footer) lists every country, as Shopify's does, with
    the currency each sees prices in, and the visitor's own picked
    (lib/markets/compat-prices.ts themeCountries, which the builder's canvas
    asks too). Without this it had a single country and the theme hid it.
  */
  const marketsFor = langs.saved ? langs.markets : []
  const pricing = market && langs.saved ? await marketPricing(site.creatorId, market, base) : null
  /* Converted prices need the day's rates: without them a market's country sees the store's own. */
  const fresh = !pricing && marketsFor.length > 0 ? fxFresh(await cachedRates().catch(() => null)) : false
  const { countries: shownCountries, country: shownCountry } = themeCountries({ markets: marketsFor, base, marketId: pricing?.market.id ?? null, visitorCountry, homeCountry: langs.homeCountry, fresh })
  /* A store that never saved Markets and languages: its theme's own language, every country, its own prices. */
  if (!langs.saved) {
    const own = site.theme.language
    return { ...site, i18n: { ...(site.i18n ?? {}), locale: own, defaultLanguage: own, languages: [own], countries: shownCountries, ...(shownCountry ? { country: { ...shownCountry, currency: base } } : {}) } }
  }
  const all = [langs.defaultLanguage, ...langs.others]
  const code = (locale && langs.others.find((l) => l.toLowerCase() === locale.toLowerCase())) || null
  const i18n = {
    ...(site.i18n ?? {}),
    locale: code ?? langs.defaultLanguage,
    defaultLanguage: langs.defaultLanguage,
    languages: all,
    countries: shownCountries,
    ...(shownCountry ? { country: shownCountry } : {}),
  }

  const rows = code ? await cachedTranslations(site.creatorId, code).catch(() => []) : []
  const map: TranslationMap = translationMap(rows.filter((r) => r.status === "approved"))
  /* No "charged in USD" line put into an imported theme's cart (the owner): the website's checkout says it, where the card is charged. */
  const extraBodyEnd = `${site.extraBodyEnd ?? ""}${code ? linkLanguageScript(code, langs.defaultLanguage, all) : ""}`
  if (map.size === 0 && !pricing) return { ...site, i18n, extraBodyEnd }

  const opts = { approvedOnly: true }
  const { fieldsOf, blockFieldsOf } = compatFields(site.theme)
  const pages: Record<string, StoredSection[]> = {}
  for (const [key, list] of Object.entries(site.pages)) pages[key] = map.size ? (localizeSections(list as unknown as SectionInstance[], map, fieldsOf, blockFieldsOf, opts) as unknown as StoredSection[]) : list
  const card = <T extends { id: string; settings: O; descriptionHtml?: string }>(c: T): T => {
    let settings = map.size ? localizeRecord(c.settings, `product:${c.id}`, ["title", "description"], map, opts) : c.settings
    /* In the market's currency, as the builder's canvas previews it (lib/markets/compat-prices.ts). */
    if (pricing) settings = compatPrices(settings, pricing)
    const html = map.size && c.descriptionHtml !== undefined ? (localizeRecord({ description: c.descriptionHtml }, `product:${c.id}`, ["description"], map, opts).description as string) : c.descriptionHtml
    return settings === c.settings && html === c.descriptionHtml ? c : { ...c, settings, ...(html !== undefined ? { descriptionHtml: html } : {}) }
  }
  const product = site.product
  return {
    ...site,
    i18n,
    extraBodyEnd,
    pages,
    /* Shown in the market's currency, written its way; checkout charges the store's and says so (note). */
    shop: compatShop(site.shop, pricing, code ?? langs.defaultLanguage),
    /* The free shipping banner counts in the currency the cart is shown in (lib/storelib-theme/compat/site-commerce-markup.ts). */
    commerce: commerceInMarket(site.commerce, pricing, code ?? langs.defaultLanguage),
    products: site.products.map((p) => card(p as never)) as SiteData["products"],
    pickable: site.pickable?.map((p) => card(p as never)) as SiteData["pickable"],
    /* Each collection's own title and description (collection:<id>, offered in Translations), and its products as the cards above, in a language with no currency change too. */
    collections: site.collections.map((c) => {
      const words = map.size ? localizeRecord(c as unknown as O, `collection:${c.id}`, ["title", "description"].filter((f) => typeof (c as unknown as O)[f] === "string") as never, map, opts) : (c as unknown as O)
      return { ...(words as unknown as typeof c), ...(c.products ? { products: c.products.map((p) => card(p as never)) } : {}) }
    }),
    menus: map.size ? (localizeMenus(site.menus as never, map, opts) as SiteData["menus"]) : site.menus,
    product: product ? async (handle) => { const p = await product(handle); return p ? card(p as never) : p } : undefined,
  }
}
