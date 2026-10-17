/**
 * Money on the offers page, in the store's own currency (Settings › Country
 * and currency): offers' fixed amounts and minimums are stored in its minor
 * units, as its prices are, and charged in it.
 */
import { appLocale } from "@/lib/i18n/format"

/** Digits after the point in a currency (0 for yen), as Intl knows them. */
export function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** An amount in the store's currency, from minor units. */
export function moneyIn(currency: string) {
  const digits = minorDigits(currency)
  return (minor: number) => {
    try {
      return new Intl.NumberFormat(appLocale(), { style: "currency", currency, minimumFractionDigits: minor % 10 ** digits === 0 ? 0 : digits, maximumFractionDigits: digits }).format(minor / 10 ** digits)
    } catch {
      return `${(minor / 10 ** digits).toFixed(digits)} ${currency}`
    }
  }
}

/** The currency's sign, for the front of an amount field. */
export function currencySign(currency: string): string {
  try {
    return new Intl.NumberFormat(appLocale(), { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency
  } catch {
    return currency
  }
}
