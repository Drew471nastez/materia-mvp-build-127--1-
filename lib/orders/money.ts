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
import { currencyCode, minorUnits } from "@/lib/markets/money"
import { platformChargeCurrencyUpper } from "@/lib/payments/fees/currency-rules"
import { appLocale } from "@/lib/i18n/format"

/** The currency of a stored amount, upper case ISO: what was recorded, else the platform's. */
export function orderCurrency(raw: unknown): string {
  return currencyCode(raw) ?? platformChargeCurrencyUpper()
}

const formatters = new Map<string, Intl.NumberFormat>()

/** "25,00 lei": minor units of `currency` in the dashboard's language. */
export function formatOrderMoney(minor: number, currency?: string | null): string {
  const code = orderCurrency(currency)
  const decimals = minorUnits(code)
  const locale = appLocale()
  const key = `${locale}|${code}`
  let f = formatters.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { style: "currency", currency: code, minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    } catch {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    }
    formatters.set(key, f)
  }
  return f.format((minor || 0) / 10 ** decimals)
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
    return new Intl.NumberFormat(appLocale(), { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code
  } catch {
    return code
  }
}
