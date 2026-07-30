/**
 * Currency conversion + formatting for the marketplace currency switcher.
 *
 * Product prices are stored in USD cents (`price_cents`). When a shopper picks a
 * currency we convert from USD and format with the right locale/symbol.
 *
 * NOTE: rates are static approximations so the switcher works offline and
 * deterministically. Replace `USD_RATES` with a live FX feed (e.g. a cached
 * server route) when real checkout in multiple currencies is needed.
 */

export type CurrencyCode = "USD" | "EUR" | "GBP" | "RON" | "CAD" | "AUD"

/** 1 USD → X <currency>. Base currency is USD. */
export const USD_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  RON: 4.6,
  CAD: 1.36,
  AUD: 1.5,
}

/** Intl locale used to format each currency (separators + symbol placement). */
const LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  USD: "en-US",
  EUR: "ro-RO", // euro shown Romanian-style for a RO-first audience
  GBP: "en-GB",
  RON: "ro-RO",
  CAD: "en-CA",
  AUD: "en-AU",
}

/** Convert an amount in USD cents into major units of the target currency. */
export function convertFromUsdCents(usdCents: number, currency: CurrencyCode): number {
  const rate = USD_RATES[currency] ?? 1
  return ((usdCents || 0) / 100) * rate
}

/**
 * Format a USD-cents amount as a localized currency string.
 * Example: formatMoney(4900, "RON") → "225,40 RON" (approx).
 */
export function formatMoney(usdCents: number, currency: CurrencyCode): string {
  const amount = convertFromUsdCents(usdCents, currency)
  try {
    return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] ?? "en-US", {
      style: "currency",
      currency,
      // RON conventionally shows whole lei; keep 2dp elsewhere for cents.
      maximumFractionDigits: currency === "RON" ? 0 : 2,
    }).format(amount)
  } catch {
    // Fallback if Intl lacks the currency: number + code.
    return `${amount.toFixed(2)} ${currency}`
  }
}
