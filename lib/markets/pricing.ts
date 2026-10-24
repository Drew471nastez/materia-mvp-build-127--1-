/**
 * ===========================================================================
 *  A PRICE SHOWN IN A MARKET'S OWN CURRENCY
 * ===========================================================================
 * A visitor from a country in a market with its own currency (Settings ›
 * Markets and languages) sees the website's prices converted from the
 * store's, at the day's European Central Bank rate, with the market's
 * adjustment and rounding (lib/markets/money convertMinor). Only shown:
 * checkout charges what the store's prices are in, and says so. Rates more
 * than four days old convert nothing, and the store's own prices show.
 *
 * Pure: the rates and the market are handed in.
 */
import { chargeNote, convertMinor, currencyWord, formatMinor, minorUnits, type FxRates, type PriceRounding } from "./money"
import { chargeableCurrency } from "./checkout-charge"

export interface MarketPrice {
  id: string
  name: string
  currency: string
  rounding: PriceRounding
  adjustBps: number
  /** The store's own rate (1 of the store's currency in the market's), used instead of the day's (lib/markets/model.ts Market rate). */
  rate?: number | null
}

export interface Pricing {
  market: MarketPrice
  /** What the store's prices are in. */
  base: string
  /** What prices are shown in. */
  currency: string
  /** The day the rates are from. */
  asOf: string
  /** The two rates used, for a page that converts again in the browser (the product block): pricingFor(market, base, fx) there gives the same numbers. */
  fx: FxRates
  /** An amount in the store's minor units, in the market's; null when it cannot be converted. */
  convert(minor: number): number | null
  /** The same, written the way a visitor in `locale` reads money ("25,00 €"). */
  format(minor: number, locale?: string): string | null
}

/** A market's conversion as the browser takes it (StorefrontContext display): pricingFor(market, base, fx) there gives the server's numbers. */
export interface StorefrontDisplay {
  market: MarketPrice
  base: string
  fx: FxRates
  locale: string
  /** "Prices in PLN are for reference. You'll pay in RON…": only for a market whose currency the checkout cannot charge (lib/markets/checkout-charge). */
  note: string | null
}

/**
 * A price read off a page that shows a market's currency ("44,50 €" in a
 * section's own add-to-cart button, as hundredths: priceCentsFrom), back in
 * the store's currency, which is what a cart line keeps and converts again
 * to show. Without this the cart converted an already converted price. The
 * market's adjustment is taken off; its rounding cannot be, so the line
 * shows within a cent of the card. Null when the page shows the store's own.
 */
export function storeCentsFromShown(shownCents: number, display: StorefrontDisplay | null | undefined): number | null {
  if (!display || !Number.isFinite(shownCents) || !pricingFor(display.market, display.base, display.fx)) return null
  const shownMinor = Math.round((shownCents / 100) * 10 ** minorUnits(display.market.currency!))
  const back = convertMinor(shownMinor, display.market.currency!, display.base, display.fx)
  if (back === null) return null
  const adjusted = back / (1 + (display.market.adjustBps ?? 0) / 10_000)
  /* "Cents" as a cart line counts them: hundredths of the store currency's major unit. */
  return Math.round((adjusted / 10 ** minorUnits(display.base)) * 100)
}

/** A market's own rate as a day's rates: 1 of `base` is `rate` of `currency`, everything per euro as the ECB writes it. */
export function ownRates(base: string, currency: string, rate: number, now = Date.now()): FxRates {
  const asOf = new Date(now).toISOString().slice(0, 10)
  if (base === "EUR") return { asOf, rates: { [currency]: rate } }
  if (currency === "EUR") return { asOf, rates: { [base]: 1 / rate } }
  return { asOf, rates: { [base]: 1, [currency]: rate } }
}

/**
 * Product cards with their prices in the market's currency: the card's price
 * and the one before a sale, each option's, and the currency it says. The
 * live site (live.ts cards) and the builder's market preview draw with this
 * one function, so the two never disagree.
 */
export function convertCardPrices<T extends { settings: { price: string; compare_price: string; currency?: string; variants?: { price: string; compare_price: string }[] } }>(list: T[], pricing: Pricing | null | undefined, locale = "en"): T[] {
  if (!pricing) return list
  const price = (t: string) => (t ? convertPriceText(t, pricing, locale) : t)
  return list.map((c) => ({
    ...c,
    settings: {
      ...c.settings,
      price: price(c.settings.price),
      compare_price: price(c.settings.compare_price),
      currency: pricing.currency,
      variants: (c.settings.variants ?? []).map((v) => ({ ...v, price: price(v.price), compare_price: price(v.compare_price) })),
    },
  }))
}

/** The conversion for a market, or null when it shows the store's own prices (no currency of its own, the same currency, or no fresh rates). */
export function pricingFor(market: MarketPrice | null | undefined, base: string, fx: FxRates | null | undefined, now = Date.now()): Pricing | null {
  if (!market || !market.currency || market.currency === base) return null
  /*
    SHOWN ONLY, PAID IN THE STORE'S CURRENCY (lib/markets/checkout-charge):
    the card pays the store's own price and the bank converts it, so the
    market's prices are a reference and say what that comes to. An
    adjustment there only moved the reference away from the charge (a -30%
    market read 30% under what was paid). Rounding stays: it moves a price
    by less than a unit.
  */
  const m: MarketPrice = market.adjustBps && !chargeableCurrency(market.currency) ? { ...market, adjustBps: 0 } : market
  /* The store's own rate, written as the rates are (per euro), and today's: it never goes stale. */
  if (typeof m.rate === "number" && m.rate > 0) fx = ownRates(base, m.currency, m.rate, now)
  const probe = convertMinor(100, base, m.currency, fx, { now })
  if (probe === null) return null
  const convert = (minor: number) => convertMinor(minor, base, m.currency, fx, { now, rounding: m.rounding, adjustBps: m.adjustBps })
  return {
    market: m,
    base,
    currency: m.currency,
    asOf: fx!.asOf,
    fx: { asOf: fx!.asOf, rates: Object.fromEntries([base, m.currency].filter((c) => c !== "EUR").map((c) => [c, fx!.rates[c]])) },
    convert,
    format(minor, locale = "en") {
      const out = convert(minor)
      /* A market rounded up to whole numbers shows them whole: "439 lei", not "439,00 lei" (the owner). */
      return out === null ? null : formatMinor(out, m.currency, locale, { wholeAsWhole: m.rounding === "whole" })
    },
  }
}

/** "$48.00" (or "$9.00/month") in the store's currency, as the same price in the market's ("44,50 €/month"). Text with no amount comes back as it was. */
export function convertPriceText(text: string, pricing: Pricing, locale = "en"): string {
  if (!text) return text
  const m = text.match(/^([^0-9]*?)([0-9][0-9.,\s]*)(.*)$/)
  if (!m) return text
  const digits = m[2].replace(/\s/g, "")
  const n = Number(digits.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."))
  if (!Number.isFinite(n)) return text
  const minor = Math.round(n * 10 ** minorUnits(pricing.base))
  const shown = pricing.format(minor, locale)
  if (shown === null) return text
  const suffix = m[3].trim().startsWith("/") ? m[3].trim() : ""
  return `${shown}${suffix}`
}

/** A product card's prices, as a page is handed them: the written amounts ("$48.00", "$9.00/month") and each variant's. */
export interface CardPrices {
  price?: string
  compare_price?: string
  currency?: string
  variants?: { price?: string; compare_price?: string }[]
}

/**
 * A card's prices in the market's currency, written the way a reader of
 * `locale` reads money: what the live site hands a page of a builder theme
 * (lib/markets/live.ts Localizer.cards), and what the builder's canvas draws
 * for the market it previews. Display only: checkout charges the store's.
 */
export function pricesInMarket<S extends CardPrices>(settings: S, pricing: Pricing, locale: string): S {
  const price = (t: string | undefined) => (t ? convertPriceText(t, pricing, locale) : t)
  return {
    ...settings,
    price: price(settings.price),
    compare_price: price(settings.compare_price),
    currency: pricing.currency,
    variants: (settings.variants ?? []).map((v) => ({ ...v, price: price(v.price), compare_price: price(v.compare_price) })),
  } as S
}

/** The conversion as plain data for the page (StorefrontContext display): the cart, the drawer and the product page convert their amounts with it, in the browser, as the cards were. */
export function storefrontDisplay(pricing: Pricing, locale: string, chargeCurrency: string): StorefrontDisplay {
  return { market: pricing.market, base: pricing.base, fx: pricing.fx, locale, note: chargeNote(pricing.currency, chargeCurrency) }
}

/** A converted amount in "cents" (hundredths of the major unit), as an imported theme's money filter counts, for any currency. */
export function convertedCents(minorBase: number, pricing: Pricing): number | null {
  const out = pricing.convert(minorBase)
  if (out === null) return null
  return Math.round((out / 10 ** minorUnits(pricing.currency)) * 100)
}

/** A Shopify money format for a currency: "€{{amount}}", "{{amount}} lei", "¥{{amount_no_decimals}}". */
export function moneyFormatFor(currency: string, locale = "en"): string {
  /* With the language's own decimal comma ("5,02 R$" in Romanian, never "5.02 R$"): Shopify's comma separator format, which every theme reads. */
  let comma = false
  try {
    comma = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value === ","
  } catch {
    comma = false
  }
  const amount = minorUnits(currency) === 0 ? (comma ? "{{amount_no_decimals_with_comma_separator}}" : "{{amount_no_decimals}}") : comma ? "{{amount_with_comma_separator}}" : "{{amount}}"
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(1)
    const i = parts.findIndex((p) => p.type === "currency")
    const n = parts.findIndex((p) => p.type === "integer")
    const narrow = parts[i]?.value ?? currency
    /* A sign written in letters ("L" for lei in German, or the code) is the currency's own word after the amount, as every price is written (money.ts currencyWord). */
    if (/^\p{L}+$/u.test(narrow)) return `${amount} ${currencyWord(currency) ?? currency.toUpperCase()}`
    return i < n ? `${narrow}${amount}` : `${amount} ${narrow}`
  } catch {
    return `${amount} ${currency}`
  }
}
