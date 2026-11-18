/**
 * A provider's price as a string ("7.58", "1200") into minor units, the
 * way Storelib keeps money. Pure, so tests read it as it is.
 *
 * How many decimals a currency has is asked of the one place the checkout
 * asks (lib/markets/money minorUnits), never of a list kept here: a list of
 * its own once read a Taiwan dollar and a CFP franc differently from the
 * checkout, so a carrier's price in one of them reached the order a hundred
 * times off, and a dinar's (three decimals) ten times.
 */
import { minorUnits } from "@/lib/markets/money"

const scaleOf = (currency: string) => 10 ** minorUnits(currency)

export function toMinor(amount: unknown, currency: unknown): number | null {
  const n = typeof amount === "number" ? amount : Number(String(amount ?? "").trim())
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null
  return Math.round(n * scaleOf(cleanCurrency(currency)))
}

/** And back: minor units written the way a provider reads them, "50.25", or "1200" for a currency with no minor unit. */
export function fromMinor(cents: number, currency: unknown): string {
  const digits = minorUnits(cleanCurrency(currency))
  return (Math.round(cents) / 10 ** digits).toFixed(digits)
}

export function cleanCurrency(currency: unknown): string {
  const cc = String(currency ?? "").trim().toUpperCase()
  return /^[A-Z]{3}$/.test(cc) ? cc : "USD"
}

/** "$7.58", "€4.20": for the order page and the timeline. */
export function formatMinor(cents: number, currency: string): string {
  const cc = cleanCurrency(currency)
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cc }).format(cents / scaleOf(cc))
  } catch {
    return `${(cents / 100).toFixed(2)} ${cc}`
  }
}
