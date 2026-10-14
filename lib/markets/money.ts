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

/**
 * How many of `to` one `from` is worth today, to six decimals (1 EUR =
 * 4.977312 RON), from the day's rates; null when either is missing or the
 * rates are not fresh. Changing a store's currency converts every price by
 * exactly this number, the one the merchant was shown.
 */
export function exchangeRate(fx: FxRates | null | undefined, from: string, to: string, now = Date.now()): number | null {
  if (from === to) return 1
  if (!fx || !fxFresh(fx, now)) return null
  const a = ratePerEuro(fx, from)
  const b = ratePerEuro(fx, to)
  if (a === null || b === null) return null
  return Math.round((b / a) * 1_000_000) / 1_000_000
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

/*
  ONE WAY TO WRITE A CURRENCY'S MARK, EVERYWHERE MONEY IS WRITTEN. Intl
  writes a currency without a sign of its own as its code ("RON 48.00"),
  and its narrow form depends on the language: lei in English and Romanian,
  but a bare "L" in German, which reads as another currency's sign. So a
  currency whose sign is its code is written with its own short word after
  the amount, the way its prices are written where it is spent: "48.00 lei",
  "48,00 zł", "48,00 kr". A word of one letter (L, R) is never used: the code
  stays. A currency with a sign keeps Intl's, which tells $ from CA$.
*/
const wordsOf = new Map<string, string | null>()
/** "lei" for RON, "zł" for PLN, "kr" for SEK; null when the code itself is the clearest mark (or the currency has a sign of its own). */
export function currencyWord(currency: string): string | null {
  const code = currency.toUpperCase()
  if (wordsOf.has(code)) return wordsOf.get(code) ?? null
  let word: string | null = null
  try {
    const narrow = new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(1).find((p) => p.type === "currency")?.value ?? ""
    word = narrow && narrow !== code && !narrow.includes("$") && !/^[A-Za-z]$/.test(narrow) ? narrow : null
  } catch {
    word = null
  }
  wordsOf.set(code, word)
  return word
}

const numberFormats = new Map<string, Intl.NumberFormat>()
/**
 * An amount in major units ("48.5") written in `locale`'s way, with the
 * currency's mark as above: "$48.50", "€48.50", "48,50 €", "48.50 lei",
 * "48,50 lei". Every formatter of money goes through this one.
 */
export function formatCurrency(major: number, currency: string, locale = "en", opts: { minimumFractionDigits?: number; maximumFractionDigits?: number; useGrouping?: boolean } = {}): string {
  const code = currency.toUpperCase()
  const value = Number.isFinite(major) ? major : 0
  try {
    const key = `${locale}|${code}|${opts.minimumFractionDigits ?? ""}|${opts.maximumFractionDigits ?? ""}|${opts.useGrouping ?? ""}`
    let f = numberFormats.get(key)
    if (!f) {
      f = new Intl.NumberFormat(locale, { style: "currency", currency: code, ...opts })
      if (numberFormats.size > 400) numberFormats.clear()
      numberFormats.set(key, f)
    }
    const parts = f.formatToParts(value)
    const mark = parts.find((p) => p.type === "currency")
    const word = mark && mark.value === code ? currencyWord(code) : null
    if (!word) return parts.map((p) => p.value).join("")
    /* The code and the space beside it out, the word after the amount. */
    const amount = parts
      .filter((p) => p.type !== "currency")
      .map((p) => p.value)
      .join("")
      .trim()
    return `${amount}\u00a0${word}`
  } catch {
    const dec = opts.maximumFractionDigits ?? 2
    return `${value.toFixed(dec)} ${code}`
  }
}

/** The mark an amount field shows beside it, as formatCurrency writes it: "$", "€", "lei", "CA$". */
export function currencyMarkOf(currency: string, locale = "en"): { mark: string; after: boolean } {
  const code = currency.toUpperCase()
  const word = currencyWord(code)
  if (word) return { mark: word, after: true }
  try {
    const parts = new Intl.NumberFormat(locale, { style: "currency", currency: code }).formatToParts(1)
    const at = parts.findIndex((p) => p.type === "currency")
    return { mark: parts[at]?.value ?? code, after: at > parts.findIndex((p) => p.type === "integer") }
  } catch {
    return { mark: code, after: true }
  }
}

/** "€25.00", "25,00 €", "¥2,500", "25,00 lei": the amount in the visitor's language's way of writing it. */
export function formatMinor(amount: number, currency: string, locale = "en", opts: { wholeAsWhole?: boolean } = {}): string {
  const full = minorUnits(currency)
  /* `wholeAsWhole`: a whole amount is written without its decimals ("439 lei", never "439,00 lei"); for a market rounded up to whole numbers. */
  const dec = opts.wholeAsWhole && amount % 10 ** full === 0 ? 0 : full
  return formatCurrency(amount / 10 ** full, currency, locale, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/**
 * What a visitor is told when a price is shown in one currency and charged
 * in another, before they pay. Null when they are the same.
 */
export function chargeNote(display: string, charge: string): string | null {
  if (display === charge) return null
  return `Prices in ${display} are for reference. You'll pay in ${charge}; your bank converts it.`
}
