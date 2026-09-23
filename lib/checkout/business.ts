/**
 * ===========================================================================
 *  BUYING FOR A BUSINESS
 * ===========================================================================
 * A buyer who pays for their company needs a document their accountant can
 * file: the company's legal name, its tax number and its address on an
 * invoice. The checkout asks for them when "Buying for a business" is
 * ticked, and this is the one definition of what is accepted, shared by the
 * page (to say what is wrong before paying) and the server (which is the
 * one that decides).
 *
 * Kept small and strict. Every field is plain text with a length cap and no
 * control characters or markup; it ends up on a PDF, in an email and in the
 * payment's metadata, and none of those should ever carry more than words.
 */

import { COUNTRY_CODES } from "./countries"

export interface BusinessDetails {
  /** The company's legal name, as it should appear on the invoice. */
  company: string
  /** VAT, EIN, ABN or any other tax number. Optional: not every company has one. */
  taxId: string
  country: string
  line1: string
  line2: string
  city: string
  postalCode: string
  region: string
}

export const EMPTY_BUSINESS: BusinessDetails = {
  company: "",
  taxId: "",
  country: "",
  line1: "",
  line2: "",
  city: "",
  postalCode: "",
  region: "",
}

const LIMITS: Record<keyof BusinessDetails, number> = {
  company: 120,
  taxId: 32,
  country: 2,
  line1: 120,
  line2: 120,
  city: 80,
  postalCode: 20,
  region: 80,
}

/** Words only: no control characters, no angle brackets, single spaces. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

/** A tax number is letters, digits and a few separators, whatever the country. */
const TAX_ID = /^[A-Za-z0-9][A-Za-z0-9 .\-/]{1,31}$/

export type BusinessCheck =
  | { ok: true; value: BusinessDetails }
  | { ok: false; field: keyof BusinessDetails; error: string }

export function checkBusiness(raw: unknown): BusinessCheck {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const value = Object.fromEntries(
    (Object.keys(LIMITS) as (keyof BusinessDetails)[]).map((k) => [k, cleanText(r[k], LIMITS[k])]),
  ) as unknown as BusinessDetails
  value.country = value.country.toUpperCase()

  if (value.company.length < 2) return { ok: false, field: "company", error: "Enter the company's legal name." }
  if (value.taxId && !TAX_ID.test(value.taxId)) {
    return { ok: false, field: "taxId", error: "A tax number is letters and digits, like DE123456789." }
  }
  if (!COUNTRY_CODES.has(value.country)) return { ok: false, field: "country", error: "Choose the company's country." }
  if (value.line1.length < 3) return { ok: false, field: "line1", error: "Enter the street address." }
  if (value.city.length < 2) return { ok: false, field: "city", error: "Enter the city." }
  if (value.postalCode && !/^[A-Za-z0-9 \-]{2,20}$/.test(value.postalCode)) {
    return { ok: false, field: "postalCode", error: "Check the postal code." }
  }
  return { ok: true, value }
}

/**
 * Into and out of a PaymentIntent's metadata, one key a field. Stripe keeps
 * 500 characters a value, which every limit above stays inside (one JSON
 * value for the whole address could pass it once quotes were escaped), and
 * the payment is the record that outlives any table: an invoice can always
 * be drawn from it.
 */
const META_KEYS: Record<keyof BusinessDetails, string> = {
  company: "business_company",
  taxId: "business_tax_id",
  country: "business_country",
  line1: "business_line1",
  line2: "business_line2",
  city: "business_city",
  postalCode: "business_postal_code",
  region: "business_region",
}

export function businessToMetadata(b: BusinessDetails): Record<string, string> {
  return Object.fromEntries((Object.keys(META_KEYS) as (keyof BusinessDetails)[]).map((k) => [META_KEYS[k], b[k] ?? ""]))
}

export function businessFromMetadata(meta: Record<string, string | undefined> | null | undefined): BusinessDetails | null {
  if (!meta?.business_company) return null
  const value = Object.fromEntries(
    (Object.keys(META_KEYS) as (keyof BusinessDetails)[]).map((k) => [k, cleanText(meta[META_KEYS[k]], LIMITS[k])]),
  ) as unknown as BusinessDetails
  value.country = value.country.toUpperCase()
  return value.company ? value : null
}

/** The address as the lines of an envelope. */
export function addressLines(b: BusinessDetails, countryName: (code: string) => string): string[] {
  return [
    b.line1,
    b.line2,
    [b.postalCode, b.city].filter(Boolean).join(" "),
    b.region,
    b.country ? countryName(b.country) : "",
  ].filter((l) => l && l.trim())
}
