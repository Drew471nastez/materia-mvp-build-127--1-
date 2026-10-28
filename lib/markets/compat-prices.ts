/**
 * ===========================================================================
 *  AN IMPORTED SHOPIFY THEME'S PRICES AND COUNTRIES, IN A MARKET
 * ===========================================================================
 * What lib/markets/compat.ts does to an imported theme's site for a visitor
 * in a market, without the server: the countries its country selector
 * lists (every one, with the currency each sees prices in, the visitor's
 * own picked), a product's prices in the market's currency in the decimal
 * the theme's money filter reads, and the shop's currency and money format.
 * The live site (localizeCompatSite) and the builder's canvas
 * (components/website-builder/compat/compat-canvas.tsx) both use these, so
 * the canvas previews a market exactly as the website draws it.
 *
 * Pure. Display only: checkout charges the store's prices.
 */
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { priceCents } from "@/lib/storelib-theme/compat/objects"
import type { CompatCommerce } from "@/lib/storelib-theme/compat/site-commerce-markup"
import { minorUnits } from "./money"
import { naturalCountry } from "./market-countries"
import { convertedCents, moneyFormatFor, type Pricing } from "./pricing"
import { marketCharge } from "./checkout-charge"
import { cardOptions, withOffersShown } from "@/lib/storelib-theme/compat/offers-app-block"

type O = Record<string, unknown>

export interface ThemeCountry {
  code: string
  name: string
  currency: string
}

/** A market as the country list reads it: what it shows prices in, and where. */
export interface CountryMarket {
  id: string
  currency: string
  countries: string[]
}

/** Every country, named in English, with the currency its visitors see prices in: a market's own, else the store's. Built once per set of markets. */
const countriesHeld = new Map<string, ThemeCountry[]>()
export function countryList(markets: CountryMarket[], base: string): ThemeCountry[] {
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
 * THE THEME'S OWN COUNTRY SELECTOR ("Show currency" on its header,
 * announcement bar or footer) lists every country, as Shopify's does, with
 * the currency each sees prices in, and the visitor's own picked: the one
 * they chose, else where they are, else the store's own country.
 * Converted prices need the day's rates: without them every country is
 * listed in the store's currency, which is what it would see.
 */
export function themeCountries(input: {
  /** The store's active markets that show their own currency; empty for a store that never saved Markets and languages. */
  markets: CountryMarket[]
  base: string
  /** The market the page's prices are shown in, or null for the store's own. */
  marketId: string | null
  /** The country the visitor chose, or is in. */
  visitorCountry: string | null
  homeCountry: string | null | undefined
  /** Whether the day's exchange rates are fresh. */
  fresh: boolean
}): { countries: ThemeCountry[]; country?: ThemeCountry } {
  const countries = countryList(input.markets, input.base)
  const inMarket = input.marketId ? input.markets.find((m) => m.id === input.marketId) : undefined
  const wanted = input.visitorCountry?.toUpperCase() ?? null
  /*
    THE VISITOR'S OWN COUNTRY, NEVER THE MARKET'S FIRST IN THE ALPHABET.
    "Åland Islands (BRL)" was shown to a visitor in Romania (the owner):
    the page did not know where they were and took the market's first
    country. Now: where they are (or chose) when it sees the prices shown;
    else the store's own country; and only for a page in a market's
    currency that holds neither, the market's most natural country (Brazil
    for BRL).
  */
  const home = input.homeCountry?.toUpperCase() ?? null
  const seesShown = (code: string) => (inMarket ? inMarket.countries.includes(code) : !input.markets.some((m) => m.countries.includes(code)))
  const pick = (code: string | null) => (code && seesShown(code) ? countries.find((c) => c.code === code) : undefined)
  const natural = inMarket ? naturalCountry(inMarket.currency, inMarket.countries) : null
  const country = pick(wanted) ?? pick(home) ?? (natural ? countries.find((c) => c.code === natural) : undefined) ?? (home ? countries.find((c) => c.code === home) : undefined) ?? countries.find((c) => c.code === "US")
  const shown = inMarket || (input.markets.length > 0 && input.fresh) ? countries : countries.map((c) => ({ ...c, currency: input.base }))
  const shownCountry = country ? shown.find((c) => c.code === country.code) : undefined
  return { countries: shown, ...(shownCountry ? { country: shownCountry } : {}) }
}

/** A price in the store's currency as the market's, in the major-unit decimal the theme's money filter reads (priceCents). */
function shownPrice(v: unknown, pricing: Pricing): unknown {
  if (v === undefined || v === null || v === "") return v
  const out = convertedCents(priceCents(v), pricing)
  return out === null ? v : (out / 100).toFixed(2)
}

/** A product card's settings with its prices, and each variant's, in the market's currency. */
export function compatPrices(settings: O, pricing: Pricing, lang = "en", id?: string): O {
  /* The Bundles and upsells block's figures (lib/storelib-theme/compat/offers-app-block.ts), worked out again in the market: each option's price as its card, each discount the checkout's share. */
  const offers = id && settings.storelib_offers && typeof settings.storelib_offers === "object" ? withOffersShown({ id, settings }, cardOptions({ id, settings }, pricing.base, minorUnits), { charge: marketCharge(pricing), currency: pricing.currency, locale: lang, whole: pricing.market.rounding === "whole" }).storelib_offers_shown : undefined
  return {
    ...settings,
    ...(offers ? { storelib_offers_shown: offers } : {}),
    price: shownPrice(settings.price, pricing),
    compare_price: shownPrice(settings.compare_price, pricing),
    currency: pricing.currency,
    variants: Array.isArray(settings.variants) ? (settings.variants as O[]).map((v) => ({ ...v, price: shownPrice(v.price, pricing), compare_price: shownPrice(v.compare_price, pricing) })) : settings.variants,
  }
}

/** The shop as the theme reads it in a market: its currency, and money written that currency's way in the page's language. */
export function compatShop<S extends { currency?: string; moneyFormat?: string }>(shop: S, pricing: Pricing | null, lang: string): S {
  return pricing ? { ...shop, currency: pricing.currency, moneyFormat: moneyFormatFor(pricing.currency, lang) } : shop
}

/**
 * Website settings › Commerce in a market: the free shipping banner's
 * threshold in the currency the theme's cart counts in (its prices are the
 * market's, so its total is), converted as a price is, and the amount left
 * written that currency's way. Whether shipping is free is still decided at
 * checkout, in the store's currency.
 */
export function commerceInMarket(c: CompatCommerce | undefined, pricing: Pricing | null, lang: string): CompatCommerce | undefined {
  if (!c || !pricing || c.freeShippingFromCents === null) return c
  const from = c.freeShippingFromCents === 0 ? 0 : convertedCents(Math.round((c.freeShippingFromCents / 100) * 10 ** minorUnits(pricing.base)), pricing)
  if (from === null) return c
  return { ...c, freeShippingFromCents: from, money: { currency: pricing.currency, locale: lang, whole: pricing.market.rounding === "whole" } }
}
