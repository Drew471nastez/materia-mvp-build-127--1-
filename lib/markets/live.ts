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
import { SHOP_CURRENCY } from "@/lib/website-builder/shop-products"
import { chargeNote, currencyCode, fxFresh, type PriceRounding } from "./money"
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { cachedRates } from "./fx-server"
import { convertPriceText, pricingFor, type MarketPrice, type Pricing } from "./pricing"

/** A market as the live website reads it: active ones only. */
export interface LiveMarket extends MarketPrice {
  countries: string[]
  primary: boolean
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
}

const NONE: SiteLanguages = { saved: false, defaultLanguage: "en", others: [], markets: [] }

async function readLanguages(creatorId: string): Promise<SiteLanguages> {
  const { data, error } = await createAdminClient().from("store_localization").select("default_language, languages, markets").eq("creator_id", creatorId).maybeSingle()
  if (error) {
    if (!marketsMissing(error)) throw error
    return NONE
  }
  if (!data) return NONE
  const row = data as { default_language?: unknown; languages?: unknown; markets?: unknown }
  const def = normalizeLocale(row.default_language) ?? "en"
  const others: string[] = []
  for (const l of Array.isArray(row.languages) ? row.languages : []) {
    const code = normalizeLocale((l as { code?: unknown })?.code)
    if (code && code !== def && (l as { published?: unknown }).published === true && !others.includes(code)) others.push(code)
  }
  const markets: LiveMarket[] = []
  for (const m of Array.isArray(row.markets) ? (row.markets as Record<string, unknown>[]) : []) {
    const currency = currencyCode(m?.currency)
    if (!m || m.primary === true || m.active === false || !currency || typeof m.id !== "string") continue
    const countries = (Array.isArray(m.countries) ? m.countries : []).filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c))
    markets.push({ id: m.id, name: typeof m.name === "string" ? m.name : m.id, countries, currency, primary: false, rounding: (["none", "whole", "nine_nine"].includes(String(m.rounding)) ? m.rounding : "none") as PriceRounding, adjustBps: Number(m.adjustBps) || 0 })
  }
  return { saved: true, defaultLanguage: def, others, markets }
}

/** The market a country's visitors see prices in, when it shows its own currency (lib/markets/model marketForCountry, active markets only). */
export function marketOfCountry(langs: SiteLanguages, country: string | null | undefined): LiveMarket | null {
  const code = typeof country === "string" ? country.toUpperCase() : ""
  return code ? (langs.markets.find((m) => m.countries.includes(code)) ?? null) : null
}

/** A market's prices, converted from `base` at today's rates; null when it shows the store's own. */
export async function marketPricing(creatorId: string, marketId: string | null | undefined, base: string): Promise<Pricing | null> {
  if (!marketId) return null
  const langs = await siteLanguages(creatorId)
  const market = langs.markets.find((m) => m.id === marketId)
  if (!market) return null
  return pricingFor(market, base, await cachedRates().catch(() => null))
}

/** The website's languages, held until the store saves Markets and languages again. */
export function siteLanguages(creatorId: string): Promise<SiteLanguages> {
  return unstable_cache(() => readLanguages(creatorId), ["site-languages", creatorId], { tags: [localizationTag(creatorId)], revalidate: 300 })().catch(() => NONE)
}

const PRODUCT_FIELDS = ["title", "description", "seo_title", "seo_description"] as const

export interface Localizer {
  /** Prices in the visitor's market's currency, or null for the store's own. */
  pricing: Pricing | null
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
export async function siteLocalizer(creatorId: string, locale: string | null | undefined, market: string | null = null, base: string = SHOP_CURRENCY): Promise<Localizer | null> {
  if (!locale && !market) return null
  const langs = await siteLanguages(creatorId)
  const code = locale ? (langs.others.find((l) => l.toLowerCase() === locale.toLowerCase()) ?? null) : null
  const pricing = market ? await marketPricing(creatorId, market, base) : null
  if (!code && !pricing) return null
  const rows = code ? await cachedTranslations(creatorId, code).catch(() => []) : []
  const map: TranslationMap = translationMap(rows.filter((r) => r.status === "approved"))
  const opts = { approvedOnly: true }
  const moneyLocale = code ?? langs.defaultLanguage
  const price = (t: string) => (pricing && t ? convertPriceText(t, pricing, moneyLocale) : t)
  return {
    pricing,
    locale: code ?? langs.defaultLanguage,
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
      if (map.size === 0 && !pricing) return list
      return list.map((c) => {
        const title = localizeRecord({ title: c.settings.title }, `product:${c.id}`, ["title"], map, opts).title
        if (!pricing) return title === c.settings.title ? c : { ...c, settings: { ...c.settings, title } }
        /* Shown in the market's currency; checkout charges the store's and says so. */
        return {
          ...c,
          settings: {
            ...c.settings,
            title,
            price: price(c.settings.price),
            compare_price: price(c.settings.compare_price),
            currency: pricing.currency,
            variants: (c.settings.variants ?? []).map((v) => ({ ...v, price: price(v.price), compare_price: price(v.compare_price) })),
          },
        }
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
  const all = [langs.defaultLanguage, ...langs.others]
  const code = (locale && all.find((l) => l.toLowerCase() === locale.toLowerCase())) || langs.defaultLanguage
  /* The currencies a visitor can see prices in: the store's own, and each market's that has fresh rates. */
  const pricing = await marketPricing(creatorId, market, SHOP_CURRENCY)
  const fresh = langs.markets.length ? fxFresh(await cachedRates().catch(() => null)) : false
  const charge = platformChargeCurrencyUpper()
  const currencies = fresh && langs.markets.length
    ? [{ id: "home", label: SHOP_CURRENCY, country: "home" }, ...langs.markets.filter((m) => m.countries.length).map((m) => ({ id: m.id, label: `${m.name} (${m.currency})`, country: m.countries[0] }))]
    : []
  return {
    code,
    defaultLanguage: langs.defaultLanguage,
    languages: all.map((c) => ({ code: c, name: languageName(c) })),
    ...(currencies.length > 1
      ? {
          currency: {
            options: currencies,
            current: pricing ? pricing.market.id : "home",
            /* Said plainly before anyone pays: the prices are an estimate, the card is charged in the store's currency. */
            note: pricing ? chargeNote(pricing.currency, charge) : null,
          },
        }
      : {}),
  }
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
