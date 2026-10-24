/**
 * An order's money as the seller reads it: in the currency the buyer was
 * charged (the order's own, or its checkout's for an order that ships),
 * written the dashboard language's way, with that currency's own decimals
 * (¥2,500, 25,00 lei, $25.00). Every figure on Orders, its timeline and
 * search goes through here; it used to be dollars whatever was charged.
 *
 * An amount stored with no currency is the platform's charge currency, the
 * one every checkout charges in (lib/payments/fees/currency-rules).
 */
import { currencyCode, currencyWord, formatMinor, minorUnits } from "@/lib/markets/money"
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { appLocale } from "@/lib/i18n/format"

/** The currency of a stored amount, upper case ISO: what was recorded, else the platform's. */
export function orderCurrency(raw: unknown): string {
  return currencyCode(raw) ?? platformChargeCurrencyUpper()
}

/**
 * "25,00 lei": minor units of `currency` in the dashboard's language, by
 * the app's one money writer (lib/markets/money formatMinor), so a lei order
 * reads "25.00 lei" here as it does on the product, the checkout and the
 * receipt. Intl alone wrote "RON 25.00" in English.
 */
export function formatOrderMoney(minor: number, currency?: string | null): string {
  return formatMinor(Number.isFinite(minor) ? minor : 0, orderCurrency(currency), appLocale())
}

/**
 * Amounts in more than one currency, never added together: one line per
 * currency, the largest first ("120.00 lei + $35.00"). For a total over
 * orders charged in different currencies where no conversion is made.
 */
export function splitByCurrency(rows: readonly { cents: number; currency?: string | null }[]): { currency: string; cents: number }[] {
  const sums = new Map<string, number>()
  for (const r of rows) {
    const code = orderCurrency(r.currency)
    sums.set(code, (sums.get(code) ?? 0) + (Number.isFinite(r.cents) ? r.cents : 0))
  }
  return [...sums.entries()].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => b.cents - a.cents || a.currency.localeCompare(b.currency))
}

/** splitByCurrency, written: "120.00 lei + $35.00". */
export function formatSplitMoney(rows: readonly { cents: number; currency?: string | null }[]): string {
  const parts = splitByCurrency(rows)
  if (!parts.length) return formatOrderMoney(0, null)
  return parts.map((p) => formatOrderMoney(p.cents, p.currency)).join(" + ")
}

/**
 * The one currency to write a sum of many orders in (the metrics over the
 * list): theirs when they agree, the one most of them were charged in when
 * they don't, the platform's when there are none.
 */
export function ordersCurrency(orders: { currency?: string | null }[]): string {
  const counts = new Map<string, number>()
  for (const o of orders) {
    const c = orderCurrency(o.currency)
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  let best = orderCurrency(null)
  let most = 0
  for (const [c, n] of counts) if (n > most) [best, most] = [c, n]
  return best
}

/** How many minor units make one of `currency`: 100 for euros, 1 for yen. For an amount typed in whole units. */
export function minorPerUnit(currency?: string | null): number {
  return 10 ** minorUnits(orderCurrency(currency))
}

/** "$", "€", "lei": what goes before or after a typed amount in `currency`. */
export function currencySymbol(currency?: string | null): string {
  const code = orderCurrency(currency)
  try {
    const narrow = new Intl.NumberFormat(appLocale(), { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code
    /* "lei", never a German "L" (lib/markets/money currencyWord). */
    return /^\p{L}+$/u.test(narrow) ? (currencyWord(code) ?? code) : narrow
  } catch {
    return code
  }
}
