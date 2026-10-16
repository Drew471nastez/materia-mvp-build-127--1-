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
import { UI_WORDS, uiKey, type UiWord } from "./ui-words"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { textFieldsFrom } from "@/lib/website-builder/custom-schemas"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { ProductCard } from "@/lib/website-builder/shop-products"
import type { SiteLanguageChoice } from "@/components/website-builder/theme/language-switch"
import { localizationTag, marketsMissing, cachedTranslations } from "./server"
import { localizedPath, normalizeLocale } from "./locales"
import { isBuiltInWordKey, isEnglish, localizeCards, localizeOptions, localizeRecord, localizeSections, localizeTheme, translationMap, valueFor, type TranslationMap } from "./translate"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import { currencyCode, type PriceRounding } from "./money"
import { languageChoiceOf } from "./choice"
import { countryOfCurrency, resolveMarketCountries, storeHomeCountry } from "./market-countries"
import { chargeCurrencyFor } from "./checkout-charge"
import { DISPLAY_CURRENCY_KEY } from "@/lib/storelib-theme/resolve"
import { cachedRates } from "./fx-server"
import { pricesInMarket, pricingFor, storefrontDisplay, type MarketPrice, type Pricing, type StorefrontDisplay } from "./pricing"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"

/** The theme settings schema's fields, for the words a setting never set shows (translate.ts localizeTheme). */
const THEME_TEXT_FIELDS = THEME_SETTINGS_GROUPS.flatMap((g) => g.fields ?? [])

/** A market as the live website reads it: active ones only. */
export interface LiveMarket extends MarketPrice {
  /** Every country it holds, its most natural first (Brazil for BRL); never the store's own. */
  countries: string[]
  primary: boolean
  /** All other countries: `countries` is every one not the store's and not in another market. */
  rest?: boolean
  /** Null: the store's own currency. */
  currency: string
}

export interface SiteLanguages {
  /** The store saved Markets and languages: its default language is the website's. */
  saved: boolean
  defaultLanguage: string
  /** The published languages other than the default, in the store's order. */
  others: string[]
  /** The active markets that show their own currency (the home market never does). */
  markets: LiveMarket[]
  /** The store's own country (Settings › Store currency), else the home market's first: where a visitor whose country is unknown starts. */
  homeCountry?: string | null
  /** The home market's name (Settings › Markets and languages), for the builder's currency preview. */
  homeName?: string | null
}

const NONE: SiteLanguages = { saved: false, defaultLanguage: "en", others: [], markets: [] }

/** The store's own country (Settings › Store currency): where a visitor whose country is unknown starts, and the builder's preview. */
async function storeCountry(creatorId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("store_settings").select("default_country, currency").eq("creator_id", creatorId).maybeSingle().then(
    (r: { data: unknown }) => r,
    () => ({ data: null }),
  )
  const d = data as { default_country?: unknown; currency?: unknown } | null
  const c = d?.default_country
  /* No country set: the one whose currency the store sells in (RON: Romania). */
  return typeof c === "string" && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : countryOfCurrency(d?.currency)
}

async function readLanguages(creatorId: string): Promise<SiteLanguages> {
  /*
    THE STORE'S COUNTRY, NOT THE UNITED STATES. A home market lists no
    countries unless the merchant added some, so the theme's country
    selector fell through to "United States (RON)" for a store in Romania.
    The store's own country is the next answer.
  */
  const [{ data, error }, own] = await Promise.all([createAdminClient().from("store_localization").select("default_language, languages, markets").eq("creator_id", creatorId).maybeSingle(), storeCountry(creatorId)])
  if (error) {
    if (!marketsMissing(error)) throw error
    return { ...NONE, homeCountry: own }
  }
  if (!data) return { ...NONE, homeCountry: own }
  const row = data as { default_language?: unknown; languages?: unknown; markets?: unknown }
  const def = normalizeLocale(row.default_language) ?? "en"
  const others: string[] = []
  for (const l of Array.isArray(row.languages) ? row.languages : []) {
    const code = normalizeLocale((l as { code?: unknown })?.code)
    if (code && code !== def && (l as { published?: unknown }).published === true && !others.includes(code)) others.push(code)
  }
  let homeName: string | null = null
  const all: (Record<string, unknown> & { countries: string[]; primary: boolean; active: boolean; rest: boolean; currency: string | null })[] = []
  for (const m of Array.isArray(row.markets) ? (row.markets as Record<string, unknown>[]) : []) {
    if (!m || typeof m !== "object") continue
    if (m.primary === true && typeof m.name === "string") homeName = m.name
    const countries = (Array.isArray(m.countries) ? m.countries : []).filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c))
    all.push({ ...m, countries, primary: m.primary === true, active: m.active !== false, rest: m.rest === true, currency: currencyCode(m.currency) })
  }
  /*
    THE STORE'S OWN COUNTRY, FIRST. Its visitors see the store currency
    whatever a market lists, and All other countries is worked out here
    (lib/markets/market-countries.ts), so a market saved before either rule
    (the owner: "BRL for 239 countries", Romania among them) reads right.
  */
  const homeCountry = storeHomeCountry(own, all)
  const markets: LiveMarket[] = []
  for (const m of resolveMarketCountries(all, homeCountry)) {
    if (m.primary || !m.active || !m.currency || typeof m.id !== "string") continue
    markets.push({ id: m.id, name: typeof m.name === "string" ? m.name : m.id, countries: m.countries, currency: m.currency, primary: false, ...(m.rest ? { rest: true } : {}), rounding: (["none", "whole", "nine_nine"].includes(String(m.rounding)) ? m.rounding : "none") as PriceRounding, adjustBps: Number(m.adjustBps) || 0, ...(typeof m.rate === "number" && m.rate > 0 ? { rate: m.rate } : {}) })
  }
  return { saved: true, defaultLanguage: def, others, markets, homeCountry, homeName }
}

/** The market a country's visitors see prices in, when it shows its own currency (lib/markets/model marketForCountry, active markets only). */
export function marketOfCountry(langs: SiteLanguages, country: string | null | undefined): LiveMarket | null {
  const code = typeof country === "string" ? country.toUpperCase() : ""
  /* The store's own country is never in one (readLanguages already leaves it out; asked again for a list built elsewhere). */
  if (!code || code === langs.homeCountry) return null
  return langs.markets.find((m) => m.countries.includes(code)) ?? null
}

/** A market's prices, converted from `base` at today's rates; null when it shows the store's own. */
export async function marketPricing(creatorId: string, marketId: string | null | undefined, base: string): Promise<Pricing | null> {
  if (!marketId) return null
  const langs = await siteLanguages(creatorId)
  const market = langs.markets.find((m) => m.id === marketId)
  if (!market) return null
  return pricingFor(market, base, await cachedRates().catch(() => null))
}

/**
 * The website's languages, held until the store saves Markets and languages
 * again. The key names the shape read: a copy held by a deploy that still
 * put the store's own country in a market (or had no homeCountry) is never
 * served by this one. The data cache outlives a deploy, and a stale copy
 * is served once more while it is read again.
 */
const LANGUAGES_SHAPE = "v2-home-country"
export function siteLanguages(creatorId: string): Promise<SiteLanguages> {
  return unstable_cache(() => readLanguages(creatorId), ["site-languages", LANGUAGES_SHAPE, creatorId], { tags: [localizationTag(creatorId)], revalidate: 300 })().catch(() => NONE)
}

const PRODUCT_FIELDS = ["title", "description", "seo_title", "seo_description"] as const

export interface Localizer {
  /** Prices in the visitor's market's currency, or null for the store's own. */
  pricing: Pricing | null
  locale: string
  defaultLanguage: string
  sections(list: SectionInstance[], sources: Record<string, string> | undefined): SectionInstance[]
  product<T extends { id?: unknown } & Record<string, unknown>>(p: T): T
  /** A collection's name and description (`collection:<id>:title|description`). They were translated in Settings and never shown. */
  collection<T extends { id?: unknown }>(c: T): T
  cards<T extends ProductCard>(list: T[]): T[]
  /** A product's options and variants' names (the product page's data): translate.ts localizeOptions. */
  options<T>(data: T): T
  /** The theme's settings: its menus, and its and its pages' search engine text. */
  theme<T extends Record<string, unknown>>(settings: T): T
  /** The shop's own words in this language (lib/markets/ui-words.ts), the approved ones only; empty in the website's own language. */
  words: Record<string, string>
  /** The conversion, as plain data for the page (StorefrontContext display): the cart shows its amounts as the cards do. */
  display?: StorefrontDisplay
}

/**
 * The overlay for one language of one store, or null when there is nothing
 * to lay over: no language asked for on a website written in English, one
 * that is not published, or no approved translation in it yet.
 */
export async function siteLocalizer(creatorId: string, locale: string | null | undefined, market: string | null = null, given?: string): Promise<Localizer | null> {
  /* The store's own currency (Settings › Country & Currency): what its prices are in, what a market converts from and what checkout charges. */
  const base = given ?? (await cachedStoreCurrency(creatorId))
  /* No language asked for: the website's own, which still has its shop words when it is not written in English (below). */
  const langs = await siteLanguages(creatorId)
  const code = locale ? (langs.others.find((l) => l.toLowerCase() === locale.toLowerCase()) ?? null) : null
  const pricing = market ? await marketPricing(creatorId, market, base) : null
  /*
    IN THE WEBSITE'S DEFAULT LANGUAGE: every translation into it is laid
    over. A website written in English whose default is Spanish shows
    Spanish at its own address (lib/markets/detect-language.ts
    defaultLanguageScope); one written in its default has only the shop's
    built-in words translated, so only those are there to lay over.
  */
  const rows = code ? await cachedTranslations(creatorId, code).catch(() => []) : await cachedTranslations(creatorId, langs.defaultLanguage).catch(() => [])
  if (!code && !pricing && rows.length === 0) return null
  const map: TranslationMap = translationMap(rows.filter((r) => r.status === "approved"))
  const opts = { approvedOnly: true, fresh: true }
  const moneyLocale = code ?? langs.defaultLanguage
  const words: Record<string, string> = {}
  for (const w of Object.keys(UI_WORDS)) {
    const v = valueFor(map, uiKey(w as UiWord), opts)
    if (v) words[w] = v
  }
  return {
    pricing,
    /* The checkout charges the market's currency when it can (lib/markets/checkout-charge), so no note is said then. */
    display: pricing ? storefrontDisplay(pricing, moneyLocale, chargeCurrencyFor(pricing, base)) : undefined,
    locale: code ?? langs.defaultLanguage,
    defaultLanguage: langs.defaultLanguage,
    words,
    sections(list, sources) {
      if (map.size === 0) return list
      /* A section's own blocks and the theme's (a heading in a Blocks section), as they are listed (server.ts siteTexts). */
      const { fieldsOf, blockFieldsOf } = textFieldsFrom(sources)
      return localizeSections(list, map, fieldsOf, blockFieldsOf, opts)
    },
    product(p) {
      if (map.size === 0 || typeof p.id !== "string") return p
      return localizeRecord(p, `product:${p.id}`, PRODUCT_FIELDS.filter((f) => typeof p[f] === "string") as never, map, opts)
    },
    collection(c) {
      if (map.size === 0 || typeof c.id !== "string") return c
      const record = c as unknown as Record<string, unknown>
      return localizeRecord(record, `collection:${c.id}`, (["title", "description"] as const).filter((f) => typeof record[f] === "string"), map, opts) as unknown as typeof c
    },
    theme(settings) {
      /* With the schema, so a setting never set (the cookie banner's sentence) is laid over too, as it is listed (server.ts siteTexts). */
      const out = localizeTheme(settings, map, opts, THEME_TEXT_FIELDS)
      /* The currency the page's prices are in, for a section that reads theme.currency.code (lib/storelib-theme/resolve.ts DISPLAY_CURRENCY_KEY). Never saved. */
      return pricing ? { ...out, [DISPLAY_CURRENCY_KEY]: pricing.currency } : out
    },
    options(data) {
      return localizeOptions(data, map, opts)
    },
    cards(list) {
      if (map.size === 0 && !pricing) return list
      return list.map((c) => {
        /* The title, and the description a card shows, laid over exactly as the editor's preview lays them (translate.ts localizeCards). */
        const worded = localizeCards([c], map, opts)[0]
        /* In the market's currency, as the builder's canvas draws a market (pricing.ts pricesInMarket). */
        return pricing ? { ...worded, settings: pricesInMarket(worded.settings, pricing, moneyLocale) } : worded
      })
    },
  }
}

/**
 * What the page's language switch offers, or undefined for a website in one
 * language: `locale` is the language this page is drawn in (null, the
 * website's own).
 */
export async function languageChoice(creatorId: string, locale: string | null | undefined, market: string | null = null): Promise<SiteLanguageChoice | undefined> {
  const langs = await siteLanguages(creatorId)
  /* Nothing saved: the page's language stays what Website settings said (ThemePage reads site_language). One language saved: that one, with no switch. */
  if (!langs.saved) return undefined
  /* Converted from, and charged in, the store's own currency (lib/store/selling-currency). */
  const charge = await cachedStoreCurrency(creatorId)
  const pricing = await marketPricing(creatorId, market, charge)
  const rates = langs.markets.length ? await cachedRates().catch(() => null) : null
  /* A market whose currency cannot be converted today is not offered: picked, it would show the store's prices and snap back to home. The builder's canvas asks the same function (lib/markets/choice.ts). */
  const offered = langs.markets.filter((m) => m.countries.length && pricingFor(m, charge, rates))
  return languageChoiceOf({ defaultLanguage: langs.defaultLanguage, others: langs.others, locale, markets: offered, fresh: offered.length > 0, pricing, base: charge, charge: chargeCurrencyFor(pricing, charge) })
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
