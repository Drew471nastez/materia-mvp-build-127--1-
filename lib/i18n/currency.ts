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

import { PLATFORM_CURRENCY } from "@/lib/checkout/currency"

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

/**
 * ===========================================================================
 *  THE MARKETPLACE IS IN LEI, AND ONLY IN LEI
 * ===========================================================================
 *
 * The switcher above offered six currencies against a static rate table, on a
 * Romanian marketplace where the couriers bill in lei, the sellers are paid in
 * lei and the card is charged in one currency regardless of which flag you
 * picked. Choosing GBP changed the label on the number and nothing about the
 * transaction — a shopper who set it and then read a bank statement was
 * misled by a control that looked like it was doing something.
 *
 * ---------------------------------------------------------------------------
 * THE ONE THING THIS HAS TO GET RIGHT
 * ---------------------------------------------------------------------------
 * `price_cents` does not always mean the same thing. Before
 * supabase/sql/RUN_CURRENCY_RON.sql it holds USD cents and the display converts
 * at 4.6; after it, it holds bani and converting again would quote every
 * listing at 4.6× its price.
 *
 * So the rate is not a constant — it is 4.6 or 1 depending on what the stored
 * unit currently IS, and the same environment variable that tells Stripe what
 * to charge is what tells this what it is reading. One switch, both ends: the
 * moment the platform charges in lei, the numbers stop being converted, and
 * there is no window where the two disagree.
 */
export function formatPlatformMoney(cents: number, from?: string | null): string {
  /**
   * ONE ANSWER, FROM ONE PLACE.
   *
   * This read the environment variable directly and inverted the default the
   * charge side used — so the two halves of "what does price_cents mean" were
   * two separate expressions that had to be kept in agreement by hand. They were
   * not: display multiplied by 4.6 while the card was charged the raw number in
   * dollars, and a listing typed at 360 lei was quoted at ~1656 and billed at
   * $360.
   *
   * `PLATFORM_CURRENCY` is that answer, and it is the same constant the
   * PaymentIntent is built from. There is now no way for the number on the card
   * and the number on the bank statement to disagree about their unit, because
   * there is only one place that decides it.
   */
  const storedIsLei = PLATFORM_CURRENCY === "ron"
  /* A store that sells in its own currency (lib/store/selling-currency) has its amounts in it: lei as they are, another currency through the dollar at the same table. */
  const own = typeof from === "string" ? (from.toUpperCase() as CurrencyCode) : null
  const amount = own && own in USD_RATES
    ? ((cents || 0) / 100) * (USD_RATES.RON / USD_RATES[own])
    : ((cents || 0) / 100) * (storedIsLei ? 1 : USD_RATES.RON)
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: "RON",
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${Math.round(amount)} RON`
  }
}
