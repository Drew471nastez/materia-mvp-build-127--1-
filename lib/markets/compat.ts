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
import { convertedCents, moneyFormatFor } from "./pricing"
import { priceCents } from "@/lib/storelib-theme/compat/objects"
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { localizeCards, localizeMenus, localizeRecord, localizeSections, translationMap, type TranslationMap } from "./translate"
import { linkLanguageScript } from "./link-script"
import { compatFields } from "./compat-fields"

export { compatFields }

type O = Record<string, unknown>

/** Every country, named in English, with the currency its visitors see prices in: a market's own, else the store's. Built once per set of markets. */
const countriesHeld = new Map<string, { code: string; name: string; currency: string }[]>()
function countryList(markets: LiveMarket[], base: string): { code: string; name: string; currency: string }[] {
  const key = `${base}|${markets.map((m) => `${m.currency}:${m.countries.join(",")}`).join(";")}`
  const hit = countriesHeld.get(key)
  if (hit) return hit
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" })
  } catch {
    names = null
  }
  const list = [...COUNTRY_CODES]
    .map((code) => ({ code, name: names?.of(code) ?? code, currency: markets.find((m) => m.countries.includes(code))?.currency ?? base }))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (countriesHeld.size > 500) countriesHeld.clear()
  countriesHeld.set(key, list)
  return list
}


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
    the currency each sees prices in, and the visitor's own picked: the one
    they chose, else where they are, else the store's home. Without this it
    had a single country and the theme hid it.
  */
  const marketsFor = langs.saved ? langs.markets : []
  const countries = countryList(marketsFor, base)
  const pricing = market && langs.saved ? await marketPricing(site.creatorId, market, base) : null
  const inMarket = pricing ? marketsFor.find((m) => m.id === pricing.market.id) : undefined
  const wanted = visitorCountry?.toUpperCase() ?? null
  const country =
    (wanted && (!inMarket || inMarket.countries.includes(wanted)) ? countries.find((c) => c.code === wanted) : undefined) ??
    (inMarket ? countries.find((c) => inMarket.countries.includes(c.code)) : undefined) ??
    countries.find((c) => c.code === langs.homeCountry) ??
    countries.find((c) => c.code === "US")
  /* A store that never saved Markets and languages: its theme's own language, every country, its own prices. */
  if (!langs.saved) {
    const own = site.theme.language
    return { ...site, i18n: { ...(site.i18n ?? {}), locale: own, defaultLanguage: own, languages: [own], countries, ...(country ? { country: { ...country, currency: base } } : {}) } }
  }
  const all = [langs.defaultLanguage, ...langs.others]
  const code = (locale && langs.others.find((l) => l.toLowerCase() === locale.toLowerCase())) || null
  /* Converted prices need the day's rates: without them a market's country sees the store's own. */
  const shownCountries = pricing || (langs.markets.length > 0 && fxFresh(await cachedRates().catch(() => null))) ? countries : countries.map((c) => ({ ...c, currency: base }))
  const shownCountry = country ? shownCountries.find((c) => c.code === country.code) : undefined
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

  const opts = { approvedOnly: true, fresh: true }
  const { fieldsOf, blockFieldsOf } = compatFields(site.theme)
  const pages: Record<string, StoredSection[]> = {}
  for (const [key, list] of Object.entries(site.pages)) pages[key] = map.size ? (localizeSections(list as unknown as SectionInstance[], map, fieldsOf, blockFieldsOf, opts) as unknown as StoredSection[]) : list
  /* A price in the store's currency as the market's, in the major-unit decimal the theme's money filter reads (priceCents). */
  const shown = (v: unknown): unknown => {
    if (!pricing || v === undefined || v === null || v === "") return v
    const out = convertedCents(priceCents(v), pricing)
    return out === null ? v : (out / 100).toFixed(2)
  }
  const card = <T extends { id: string; settings: O; descriptionHtml?: string }>(c: T): T => {
    /* The card's description is plain text, made plain from the translated rich text as a built website's card is (translate.ts localizeCards). */
    let settings = map.size ? (localizeCards([{ id: c.id, settings: c.settings }], map, opts)[0].settings as O) : c.settings
    if (pricing) {
      settings = {
        ...settings,
        price: shown(settings.price),
        compare_price: shown(settings.compare_price),
        currency: pricing.currency,
        variants: Array.isArray(settings.variants) ? (settings.variants as O[]).map((v) => ({ ...v, price: shown(v.price), compare_price: shown(v.compare_price) })) : settings.variants,
      }
    }
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
    shop: pricing ? { ...site.shop, currency: pricing.currency, moneyFormat: moneyFormatFor(pricing.currency, code ?? langs.defaultLanguage) } : site.shop,
    products: site.products.map((p) => card(p as never)) as SiteData["products"],
    pickable: site.pickable?.map((p) => card(p as never)) as SiteData["pickable"],
    collections: map.size || pricing
      ? site.collections.map((c) => {
          /* Its name and description in this language, as on a built website (live.ts collection), and its cards. */
          const named = map.size ? (localizeRecord(c as never, `collection:${c.id}`, (["title", "description"] as const).filter((f) => typeof c[f] === "string") as never, map, opts) as typeof c) : c
          return named.products ? { ...named, products: named.products.map((p) => card(p as never)) } : named
        })
      : site.collections,
    menus: map.size ? (localizeMenus(site.menus as never, map, opts) as SiteData["menus"]) : site.menus,
    product: product ? async (handle) => { const p = await product(handle); return p ? card(p as never) : p } : undefined,
  }
}
