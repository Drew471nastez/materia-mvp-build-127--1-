/**
 * How a creator's bank account is collected, by the country they selected.
 * Formats we know are sent to Stripe and not stored here.
 * Anything else stays in Stripe's own verification step.
 */

export type BankFormat = "iban" | "us" | "ca" | "au" | "stripe"

export interface PayoutCountry {
  country: string
  currency: string
  format: BankFormat
  /** Expected IBAN length without spaces, when format is iban. */
  ibanLength?: number
}

const IBAN: Array<[string, string, number]> = [
  ["RO", "ron", 24],
  ["DE", "eur", 22],
  ["FR", "eur", 27],
  ["ES", "eur", 24],
  ["IT", "eur", 27],
  ["NL", "eur", 18],
  ["BE", "eur", 16],
  ["AT", "eur", 20],
  ["PT", "eur", 25],
  ["IE", "eur", 22],
  ["FI", "eur", 18],
  ["GR", "eur", 27],
  ["LU", "eur", 20],
  ["LT", "eur", 20],
  ["LV", "eur", 21],
  ["EE", "eur", 20],
  ["SK", "eur", 24],
  ["SI", "eur", 19],
  ["CY", "eur", 28],
  ["MT", "eur", 31],
  ["HR", "eur", 21],
  ["BG", "bgn", 22],
  ["HU", "huf", 28],
  ["CZ", "czk", 24],
  ["PL", "pln", 28],
  ["DK", "dkk", 18],
  ["SE", "sek", 24],
  ["NO", "nok", 15],
  ["CH", "chf", 21],
  ["LI", "chf", 21],
  ["GB", "gbp", 22],
]

const BY_COUNTRY = new Map<string, PayoutCountry>()
for (const [country, currency, ibanLength] of IBAN) {
  BY_COUNTRY.set(country, { country, currency, format: "iban", ibanLength })
}
BY_COUNTRY.set("US", { country: "US", currency: "usd", format: "us" })
BY_COUNTRY.set("CA", { country: "CA", currency: "cad", format: "ca" })
BY_COUNTRY.set("AU", { country: "AU", currency: "aud", format: "au" })

export function payoutCountry(code: string): PayoutCountry {
  const key = code.trim().toUpperCase()
  return BY_COUNTRY.get(key) ?? { country: key, currency: "usd", format: "stripe" }
}
