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
import { convertMinor, formatMinor, minorUnits, type FxRates, type PriceRounding } from "./money"

export interface MarketPrice {
  id: string
  name: string
  currency: string
  rounding: PriceRounding
  adjustBps: number
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
  /** "Prices in EUR are an estimate. You'll pay in USD at checkout…" */
  note: string | null
}

/** The conversion for a market, or null when it shows the store's own prices (no currency of its own, the same currency, or no fresh rates). */
export function pricingFor(market: MarketPrice | null | undefined, base: string, fx: FxRates | null | undefined, now = Date.now()): Pricing | null {
  if (!market || !market.currency || market.currency === base) return null
  const probe = convertMinor(100, base, market.currency, fx, { now })
  if (probe === null) return null
  const convert = (minor: number) => convertMinor(minor, base, market.currency, fx, { now, rounding: market.rounding, adjustBps: market.adjustBps })
  return {
    market,
    base,
    currency: market.currency,
    asOf: fx!.asOf,
    fx: { asOf: fx!.asOf, rates: Object.fromEntries([base, market.currency].filter((c) => c !== "EUR").map((c) => [c, fx!.rates[c]])) },
    convert,
    format(minor, locale = "en") {
      const out = convert(minor)
      return out === null ? null : formatMinor(out, market.currency, locale)
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

/** A converted amount in "cents" (hundredths of the major unit), as an imported theme's money filter counts, for any currency. */
export function convertedCents(minorBase: number, pricing: Pricing): number | null {
  const out = pricing.convert(minorBase)
  if (out === null) return null
  return Math.round((out / 10 ** minorUnits(pricing.currency)) * 100)
}

/** A Shopify money format for a currency: "€{{amount}}", "{{amount}} lei", "¥{{amount_no_decimals}}". */
export function moneyFormatFor(currency: string, locale = "en"): string {
  const amount = minorUnits(currency) === 0 ? "{{amount_no_decimals}}" : "{{amount}}"
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(1)
    const i = parts.findIndex((p) => p.type === "currency")
    const n = parts.findIndex((p) => p.type === "integer")
    const symbol = parts[i]?.value ?? currency
    return i < n ? `${symbol}${amount}` : `${amount} ${symbol}`
  } catch {
    return `${amount} ${currency}`
  }
}
