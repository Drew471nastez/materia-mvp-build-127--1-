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
import { cachedOriginalProducts, cachedTranslations } from "./server"
import { marketPricing, siteLanguages, type LiveMarket, type SiteLanguages } from "./live"
import { cachedRates } from "./fx-server"
import { pricingFor } from "./pricing"
import { commerceInMarket, compatPrices, compatShop, themeCountries } from "./compat-prices"
import { localizeMenus, localizeSections, translationMap, valueFor, type TranslationMap } from "./translate"
import { linkLanguageScript } from "./link-script"
import { compatCardIn, compatCollectionIn, compatFields, compatThemeWords, compatUiWords } from "./compat-fields"

export { compatFields }

type O = Record<string, unknown>

/**
 * The site for one request: in `locale` (null: the website's own
 * language), and with prices in `market`'s currency when the visitor's
 * country is in a market that shows its own (null: the store's prices).
 * Untouched for a store with one language and no such market.
 */
export async function localizeCompatSite(site: SiteData, locale: string | null, market: string | null = null, visitorCountry: string | null = null, asked?: Promise<SiteLanguages | undefined>): Promise<SiteData> {
  /* `asked`: the same read, started by the caller beside the site's own (app/api/site-theme/site). */
  const langs = (asked ? await asked.catch(() => undefined) : undefined) ?? (await siteLanguages(site.creatorId))
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
  /* Each country in its market's currency only while that converts today (fresh rates, or the store's own rate for it); else the store's. */
  const rates = marketsFor.length > 0 ? await cachedRates().catch(() => null) : null
  const converting = marketsFor.filter((m) => pricingFor(m, base, rates))
  const { countries: shownCountries, country: shownCountry } = themeCountries({ markets: converting, base, marketId: pricing?.market.id ?? null, visitorCountry, homeCountry: langs.homeCountry, fresh: converting.length > 0 })
  /* A store that never saved Markets and languages: its theme's own language, every country, its own prices. */
  if (!langs.saved) {
    const own = site.theme.language
    return { ...site, i18n: { ...(site.i18n ?? {}), locale: own, defaultLanguage: own, languages: [own], countries: shownCountries, ...(shownCountry ? { country: { ...shownCountry, currency: base } } : {}) } }
  }
  const all = [langs.defaultLanguage, ...langs.others]
  const code = (locale && langs.others.find((l) => l.toLowerCase() === locale.toLowerCase())) || null
  const i18n: NonNullable<SiteData["i18n"]> = {
    ...(site.i18n ?? {}),
    locale: code ?? langs.defaultLanguage,
    defaultLanguage: langs.defaultLanguage,
    languages: all,
    countries: shownCountries,
    ...(shownCountry ? { country: shownCountry } : {}),
  }

  /* In the default language, every translation into it is laid over (an English theme on a Spanish store reads Spanish): the theme's own words among them (lib/markets/detect-language.ts defaultLanguageScope). */
  const rows = code ? await cachedTranslations(site.creatorId, code).catch(() => []) : await cachedTranslations(site.creatorId, langs.defaultLanguage).catch(() => [])
  const map: TranslationMap = translationMap(rows.filter((r) => r.status === "approved"))
  /* THE THEME'S OWN WORDS (`| t`) as the store translated them, each only while written for the theme's word as it is now (the builder's canvas asks the same function). */
  const themeWords = map.size ? compatThemeWords(site.theme.defaultWords(), map) : {}
  if (Object.keys(themeWords).length) i18n.words = themeWords
  /* And Storelib's own words in this language (Translate › Shop words), for what Storelib draws in the theme: the review widgets (lib/reviews/widgets). */
  /* Storelib Reviews' blocks and section read them too (lib/storelib-theme/compat/storelib-reviews.ts), by the function the builder's canvas asks (compat-fields.ts). */
  const shopUiWords = compatUiWords(map)
  if (Object.keys(shopUiWords).length) i18n.uiWords = shopUiWords
  /* No "charged in USD" line put into an imported theme's cart (the owner): the website's checkout says it, where the card is charged. */
  const extraBodyEnd = `${site.extraBodyEnd ?? ""}${code ? linkLanguageScript(code, langs.defaultLanguage, all) : ""}`
  if (map.size === 0 && !pricing) return { ...site, i18n, extraBodyEnd }

  const opts = { approvedOnly: true, fresh: true }
  const { fieldsOf, blockFieldsOf } = compatFields(site.theme)
  const original = new Set(await cachedOriginalProducts(site.creatorId).catch(() => [] as string[]))
  const pages: Record<string, StoredSection[]> = {}
  for (const [key, list] of Object.entries(site.pages)) pages[key] = map.size ? (localizeSections(list as unknown as SectionInstance[], map, fieldsOf, blockFieldsOf, opts) as unknown as StoredSection[]) : list
  const card = <T extends { id: string; settings: O; descriptionHtml?: string }>(c: T): T => {
    /* Its words (title, plain description, options, search engine title, the page's rich description), as the builder's canvas lays them (compat-fields.ts compatCardIn). */
    /* A product shown in its own words in every language (Products › Translations) keeps them. */
    const worded = original.has(c.id) ? c : compatCardIn(c, map, opts)
    /* In the market's currency, as the builder's canvas previews it (lib/markets/compat-prices.ts). */
    return pricing ? { ...worded, settings: compatPrices(worded.settings, pricing, code ?? langs.defaultLanguage, c.id) } : worded
  }
  /*
    THE PAGE'S SEARCH ENGINE TEXT (Website settings › SEO, each page's own),
    offered in Translations (page:<key>:seo_title, :seo_description) and
    until now laid over only on a built website. Each translation only
    while written for the words the page says now.
  */
  const seoOf = site.seo
  const seo: SiteData["seo"] = seoOf && map.size
    ? (key) => {
        const s = seoOf(key)
        if (!s) return s
        const title = s.title ? (valueFor(map, `page:${key}:seo_title`, opts, s.title) ?? s.title) : s.title
        const description = s.description ? (valueFor(map, `page:${key}:seo_description`, opts, s.description) ?? valueFor(map, "page:home:seo_description", opts, s.description) ?? s.description) : s.description
        return { ...s, title, description }
      }
    : seoOf
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
      const words = compatCollectionIn(c, map, opts)
      return { ...words, ...(c.products ? { products: c.products.map((p) => card(p as never)) } : {}) }
    }),
    menus: map.size ? (localizeMenus(site.menus as never, map, opts) as SiteData["menus"]) : site.menus,
    seo,
    product: product ? async (handle) => { const p = await product(handle); return p ? card(p as never) : p } : undefined,
  }
}
