/**
 * A provider's price as a string ("7.58", "1200") into minor units, the
 * way Storelib keeps money. Pure, so tests read it as it is.
 */

/* Currencies with no minor unit: "1200" yen is 1200, not 120000. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX", "XAF", "XOF", "PYG"])

export function toMinor(amount: unknown, currency: unknown): number | null {
  const n = typeof amount === "number" ? amount : Number(String(amount ?? "").trim())
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null
  const cc = String(currency ?? "USD").toUpperCase()
  return Math.round(ZERO_DECIMAL.has(cc) ? n : n * 100)
}

/** And back: minor units written the way a provider reads them, "50.25", or "1200" for a currency with no minor unit. */
export function fromMinor(cents: number, currency: unknown): string {
  const cc = cleanCurrency(currency)
  return ZERO_DECIMAL.has(cc) ? String(Math.round(cents)) : (Math.round(cents) / 100).toFixed(2)
}

export function cleanCurrency(currency: unknown): string {
  const cc = String(currency ?? "").trim().toUpperCase()
  return /^[A-Z]{3}$/.test(cc) ? cc : "USD"
}

/** "$7.58", "€4.20": for the order page and the timeline. */
export function formatMinor(cents: number, currency: string): string {
  const cc = cleanCurrency(currency)
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cc }).format(ZERO_DECIMAL.has(cc) ? cents : cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${cc}`
  }
}
