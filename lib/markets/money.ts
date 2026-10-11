/**
 * ===========================================================================
 *  MONEY ACROSS CURRENCIES, WITHOUT GUESSING
 * ===========================================================================
 * Four amounts are kept apart and never mistaken for each other:
 *
 *   base         the store's own currency, what every price is typed in
 *                (creators.payout_currency, lib/store/currency.ts)
 *   display      what a visitor in a market is shown, converted from base
 *   charge       what the card is actually charged in (the checkout decides,
 *                server side, and it is the only one that matters for money)
 *   settlement   what the seller is paid out in (the payment provider's)
 *
 * When display and charge differ, the page says so before the buyer pays
 * (`chargeNote`). Amounts are integers in each currency's own minor unit
 * (cents, yen, fils), read from Intl, so ¥ has none and the dinar three.
 * A rate is a number per euro with the day it is for (the ECB's daily
 * reference rates, lib/markets/fx-server.ts); a rate older than
 * FX_FRESH_DAYS is not used at all rather than used stale.
 *
 * Pure: the storefront, the checkout and the tests read it the same way.
 */

/** How many decimals a currency's amounts have: 2 for most, 0 for JPY or HUF, 3 for KWD. */
export function minorUnits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** A real ISO 4217 code in capitals, or null. */
export function currencyCode(raw: unknown): string | null {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : ""
  if (!/^[A-Z]{3}$/.test(code)) return null
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code })
    return code
  } catch {
    return null
  }
}

/** A day's rates, each a number of that currency per one euro. EUR itself is 1. */
export interface FxRates {
  /** The day the rates are for (YYYY-MM-DD). */
  asOf: string
  rates: Record<string, number>
}

/** A rate this many days old (or older) is not used: the ECB publishes on working days, so four covers a long weekend. */
export const FX_FRESH_DAYS = 4

export function fxFresh(fx: FxRates | null | undefined, now = Date.now()): boolean {
  if (!fx || !/^\d{4}-\d{2}-\d{2}$/.test(fx.asOf)) return false
  const at = Date.parse(`${fx.asOf}T00:00:00Z`)
  return Number.isFinite(at) && now - at <= FX_FRESH_DAYS * 86_400_000 && now - at >= -86_400_000
}

function ratePerEuro(fx: FxRates, currency: string): number | null {
  if (currency === "EUR") return 1
  const r = fx.rates[currency]
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null
}

/** How a converted price is rounded, after it is converted: as it is, up to the next whole unit, or to .99 below it. */
export type PriceRounding = "none" | "whole" | "nine_nine"

/**
 * An amount in `from`'s minor units, in `to`'s. Null when either rate is
 * missing or the day's rates are not fresh: nothing is shown converted
 * rather than shown wrong. `adjustBps` is a markup the store sets for a
 * market (100 = 1%), applied before rounding.
 */
export function convertMinor(
  amount: number,
  from: string,
  to: string,
  fx: FxRates | null | undefined,
  opts: { rounding?: PriceRounding; adjustBps?: number; now?: number } = {},
): number | null {
  if (!Number.isFinite(amount)) return null
  if (from === to) return Math.round(amount)
  if (!fx || !fxFresh(fx, opts.now)) return null
  const a = ratePerEuro(fx, from)
  const b = ratePerEuro(fx, to)
  if (a === null || b === null) return null
  const fromDec = minorUnits(from)
  const toDec = minorUnits(to)
  const major = (amount / 10 ** fromDec) * (b / a) * (1 + (opts.adjustBps ?? 0) / 10_000)
  let out = Math.round(major * 10 ** toDec)
  const unit = 10 ** toDec
  if (opts.rounding === "whole" && toDec > 0 && out % unit !== 0) out = Math.ceil(out / unit) * unit
  else if (opts.rounding === "nine_nine" && toDec > 0) {
    const whole = Math.ceil(out / unit)
    out = Math.max(unit - 1, whole * unit - 1)
  }
  return Math.max(0, out)
}

/** "€25.00", "25,00 €", "¥2,500", "25,00 lei": the amount in the visitor's language's way of writing it. */
export function formatMinor(amount: number, currency: string, locale = "en"): string {
  const dec = minorUnits(currency)
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(amount / 10 ** dec)
  } catch {
    return `${(amount / 10 ** dec).toFixed(dec)} ${currency}`
  }
}

/**
 * What a visitor is told when a price is shown in one currency and charged
 * in another, before they pay. Null when they are the same.
 */
export function chargeNote(display: string, charge: string): string | null {
  if (display === charge) return null
  return `Prices in ${display} are an estimate. You'll pay in ${charge} at checkout; your bank converts it.`
}
