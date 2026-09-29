/**
 * ===========================================================================
 *  CENTS IN STORELIB, DECIMALS AT AIRWALLEX
 * ===========================================================================
 * Storelib keeps every amount as an integer in the currency's smallest unit
 * (`amount_cents`, and the same for yen, where the smallest unit is one yen).
 * Airwallex takes and returns amounts in the currency's MAJOR unit: 12.34
 * dollars is `12.34`, 1,200 yen is `1200`, 1.234 dinars is `1.234`.
 *
 * So every amount crosses here, and here only, with the precision Airwallex
 * publishes for the currency (docs/payments/reference/supported-currencies):
 * most currencies have 2 decimals, these have 0 and these have 3. No float
 * arithmetic on money: the conversion works on the digits.
 */

/** Currencies Airwallex settles with no minor unit. */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "SLE", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
])

/** Currencies Airwallex settles with three decimals. */
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "LYD", "OMR", "TND"])

/** How many decimals a currency's major unit has at Airwallex. */
export function decimalsOf(currency: string): number {
  const c = currency.trim().toUpperCase()
  if (ZERO_DECIMAL.has(c)) return 0
  if (THREE_DECIMAL.has(c)) return 3
  return 2
}

/**
 * An integer amount in the smallest unit, as the decimal string Airwallex
 * reads: 1234 USD is "12.34", 1234 JPY is "1234", 1234 KWD is "1.234".
 * Refuses anything that is not a whole number of smallest units.
 */
export function toMajor(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new Error("An amount must be a whole number of the smallest unit.")
  const d = decimalsOf(currency)
  const negative = minor < 0
  const digits = String(Math.abs(minor))
  if (d === 0) return (negative ? "-" : "") + digits
  const padded = digits.padStart(d + 1, "0")
  const whole = padded.slice(0, padded.length - d)
  const frac = padded.slice(padded.length - d)
  return `${negative ? "-" : ""}${whole}.${frac}`
}

/** The same, as a JSON number for the fields Airwallex types as `number`. */
export function toMajorNumber(minor: number, currency: string): number {
  return Number(toMajor(minor, currency))
}

/**
 * An amount Airwallex returned (a number or a decimal string) back to an
 * integer in the smallest unit. Reads the digits, so 0.29 is 29 and never
 * 28.999999. More decimals than the currency has are rounded half up, which
 * only happens if Airwallex ever sends a finer figure than it settles in.
 */
export function toMinor(major: number | string | null | undefined, currency: string): number {
  if (major === null || major === undefined || major === "") return 0
  const raw = typeof major === "number" ? numberToPlain(major) : String(major).trim()
  if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error("Not an amount.")
  const negative = raw.startsWith("-")
  const [wholePart, fracPart = ""] = (negative ? raw.slice(1) : raw).split(".")
  const d = decimalsOf(currency)
  const kept = (fracPart + "0".repeat(d)).slice(0, d)
  const next = fracPart.charCodeAt(d) - 48
  let minor = Number(wholePart) * 10 ** d + (d > 0 ? Number(kept) : 0)
  if (next >= 5) minor += 1
  return negative ? -minor : minor
}

/** A JS number written out without exponent notation. */
function numberToPlain(n: number): string {
  if (!Number.isFinite(n)) throw new Error("Not an amount.")
  const s = String(n)
  if (!/e/i.test(s)) return s
  return n.toFixed(20).replace(/\.?0+$/, "")
}
