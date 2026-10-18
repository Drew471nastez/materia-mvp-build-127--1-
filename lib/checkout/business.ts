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
 * WHAT AN INVOICE NEEDS. The company's legal name and its address: street,
 * city and country always, the postal code wherever the country has them.
 * The tax number is optional, because not every company is registered for
 * VAT, but when one is typed it has to look like one: a VAT number printed
 * wrong on an invoice is worse than none. Where the country's format is
 * known (the EU, the UK, Switzerland, Norway, Australia) it is checked
 * against it and written the way the tax office writes it, "DE123456789";
 * anywhere else, letters and digits. The apartment and the state or county
 * are optional, as the checkout says.
 *
 * Kept small and strict. Every field is plain text with a length cap and no
 * control characters or markup; it ends up on a PDF, in an email and in the
 * payment's metadata, and none of those should ever carry more than words.
 */

import { COUNTRY_CODES, countryName } from "./countries"

/** Marks a sentence the website's checkout shows, so it is listed for translation (lib/markets/checkout-words checkoutMsg; kept here so this file needs nothing from there). */
const checkoutMsg = <T extends string>(source: T): T => source

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

/* ─── Tax numbers ─────────────────────────────────────────────────────── */

/** Any country's tax number: letters, digits and a few separators. */
const ANY_TAX_ID = /^[A-Za-z0-9][A-Za-z0-9 .\-/]{1,31}$/

interface TaxFormat {
  /** What it is called there. */
  label: string
  /** The letters it is written with, "DE" or "EL"; none for an ABN. */
  prefix: string
  /** The rest, with no spaces, dots or dashes. */
  body: RegExp
  example: string
}

const vat = (prefix: string, body: RegExp, example: string): TaxFormat => ({ label: "VAT number", prefix, body, example })

/**
 * The EU's VAT numbers as VIES lists them, and the neighbours that invoice
 * the same way. Greece writes EL, not GR.
 */
const TAX_FORMATS: Record<string, TaxFormat> = {
  AT: vat("AT", /^U\d{8}$/, "ATU12345678"),
  BE: vat("BE", /^[01]\d{9}$/, "BE0123456789"),
  BG: vat("BG", /^\d{9,10}$/, "BG123456789"),
  CY: vat("CY", /^\d{8}[A-Z]$/, "CY12345678X"),
  CZ: vat("CZ", /^\d{8,10}$/, "CZ12345678"),
  DE: vat("DE", /^\d{9}$/, "DE123456789"),
  DK: vat("DK", /^\d{8}$/, "DK12345678"),
  EE: vat("EE", /^\d{9}$/, "EE123456789"),
  GR: vat("EL", /^\d{9}$/, "EL123456789"),
  ES: vat("ES", /^[A-Z0-9]\d{7}[A-Z0-9]$/, "ESB12345678"),
  FI: vat("FI", /^\d{8}$/, "FI12345678"),
  FR: vat("FR", /^[A-Z0-9]{2}\d{9}$/, "FR12345678901"),
  HR: vat("HR", /^\d{11}$/, "HR12345678901"),
  HU: vat("HU", /^\d{8}$/, "HU12345678"),
  IE: vat("IE", /^\d[A-Z0-9+*]\d{5}[A-Z]{1,2}$/, "IE1234567T"),
  IT: vat("IT", /^\d{11}$/, "IT12345678901"),
  LT: vat("LT", /^(\d{9}|\d{12})$/, "LT123456789"),
  LU: vat("LU", /^\d{8}$/, "LU12345678"),
  LV: vat("LV", /^\d{11}$/, "LV12345678901"),
  MT: vat("MT", /^\d{8}$/, "MT12345678"),
  NL: vat("NL", /^\d{9}B\d{2}$/, "NL123456789B01"),
  PL: vat("PL", /^\d{10}$/, "PL1234567890"),
  PT: vat("PT", /^\d{9}$/, "PT123456789"),
  RO: vat("RO", /^\d{2,10}$/, "RO12345678"),
  SE: vat("SE", /^\d{12}$/, "SE123456789001"),
  SI: vat("SI", /^\d{8}$/, "SI12345678"),
  SK: vat("SK", /^\d{10}$/, "SK1234567890"),
  GB: vat("GB", /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/, "GB123456789"),
  CH: vat("CHE", /^\d{9}(MWST|TVA|IVA)?$/, "CHE123456789MWST"),
  NO: vat("NO", /^\d{9}(MVA)?$/, "NO123456789MVA"),
  AU: { label: "ABN", prefix: "", body: /^\d{11}$/, example: "51824753556" },
}

/** Other countries: what the number is called and what one looks like, but any shape is taken. */
const TAX_NAMES: Record<string, { label: string; example: string }> = {
  US: { label: "EIN", example: "12-3456789" },
  CA: { label: "Business number", example: "123456789RT0001" },
  NZ: { label: "GST number", example: "123-456-789" },
  IN: { label: "GSTIN", example: "22AAAAA0000A1Z5" },
  SG: { label: "GST number", example: "M12345678X" },
  JP: { label: "Registration number", example: "T1234567890123" },
}

/** Every prefix a VAT number can carry, for one typed with another country's. */
const BY_PREFIX: Record<string, TaxFormat> = {
  ...Object.fromEntries(
    Object.values(TAX_FORMATS)
      .filter((f) => f.prefix)
      .map((f) => [f.prefix, f]),
  ),
  /* Northern Ireland's traders, under the EU's rules for goods. */
  XI: vat("XI", /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/, "XI123456789"),
}

/** What the tax number is called in this country, and an example of one, for the field. */
export function taxIdFor(country: string): { label: string; example: string } {
  if (!country) return { label: "Tax ID", example: "GB123456789" }
  const known = TAX_FORMATS[country] ?? TAX_NAMES[country]
  return known ? { label: known.label, example: known.example } : { label: "Tax ID", example: "123456789" }
}

/**
 * The tax number written the way the tax office writes it, or null when it
 * cannot be one. Only letters and digits are compared: "DE 123 456 789",
 * "de123456789" and "123456789" are the same German number.
 */
export function normaliseTaxId(value: string, country: string): string | null {
  const compact = value.toUpperCase().replace(/[\s.\-/]/g, "")
  const format = TAX_FORMATS[country]
  if (!format) return ANY_TAX_ID.test(value) ? value.toUpperCase() : null
  if (!format.prefix) return format.body.test(compact) ? compact : null
  /* Its own country's letters, or none. */
  const own = compact.startsWith(format.prefix) ? compact.slice(format.prefix.length) : compact
  if (format.body.test(own)) return format.prefix + own
  /* A company registered for VAT in another member state writes that one. */
  for (const len of [3, 2]) {
    const other = BY_PREFIX[compact.slice(0, len)]
    if (other && other !== format && other.body.test(compact.slice(len))) return compact
  }
  return null
}

/* ─── Postal codes ────────────────────────────────────────────────────── */

/** Countries where an address has no postal code. Everywhere else it is asked for. */
const NO_POSTAL_CODE = new Set(
  (
    "AE AG AN AO AW BF BI BJ BO BS BW BZ CD CF CG CI CK CM DJ DM ER FJ GA GD GH GM GQ GY HK HM IE JM KI KM KN KP LC ML MO " +
    "MR MW NR NU QA RW SB SC SL SR SS ST SY TD TF TG TK TL TO TT TV UG VU YE ZW"
  ).split(" "),
)

export function needsPostalCode(country: string): boolean {
  return !!country && !NO_POSTAL_CODE.has(country)
}

/** Formats checked where a wrong one is a typo, not a local custom. */
const POSTAL_FORMATS: Record<string, RegExp> = {
  US: /^\d{5}(-\d{4})?$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i,
  CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i,
  DE: /^\d{5}$/,
  FR: /^\d{5}$/,
  ES: /^\d{5}$/,
  IT: /^\d{5}$/,
  AU: /^\d{4}$/,
  NL: /^\d{4} ?[A-Z]{2}$/i,
}

/* ─── The address form, in each country's words ───────────────────────── */

export interface AddressWords {
  postal: string
  region: string
  /** Examples for the placeholders, from one address in that country. */
  example: { company: string; line1: string; line2: string; city: string; postal: string; region: string }
}

const UK_WORDS: AddressWords = {
  postal: "Postcode",
  region: "County",
  example: { company: "Acme Ltd", line1: "221B Baker Street", line2: "Apt 4", city: "London", postal: "NW1 6XE", region: "Greater London" },
}

const WORDS: Record<string, AddressWords> = {
  GB: UK_WORDS,
  IE: { ...UK_WORDS, postal: "Eircode", example: { company: "Acme Ltd", line1: "12 Merrion Square", line2: "Suite 4", city: "Dublin", postal: "D02 XY45", region: "Co. Dublin" } },
  US: {
    postal: "ZIP code",
    region: "State",
    example: { company: "Acme Inc.", line1: "350 Fifth Avenue", line2: "Suite 4100", city: "New York", postal: "10118", region: "NY" },
  },
  CA: {
    postal: "Postal code",
    region: "Province",
    example: { company: "Acme Inc.", line1: "290 Bremner Blvd", line2: "Suite 400", city: "Toronto", postal: "M5V 3L9", region: "ON" },
  },
  AU: {
    postal: "Postcode",
    region: "State",
    example: { company: "Acme Pty Ltd", line1: "1 Macquarie Street", line2: "Level 4", city: "Sydney", postal: "2000", region: "NSW" },
  },
  DE: {
    postal: "Postal code",
    region: "State",
    example: { company: "Acme GmbH", line1: "Friedrichstraße 43", line2: "4. OG", city: "Berlin", postal: "10117", region: "Berlin" },
  },
  FR: {
    postal: "Postal code",
    region: "Region",
    example: { company: "Acme SAS", line1: "12 rue de Rivoli", line2: "Bâtiment B", city: "Paris", postal: "75004", region: "Île-de-France" },
  },
}

/** A country with no words of its own. Before one is chosen, the London example, in its own words. */
const OTHER_WORDS: AddressWords = {
  postal: "Postal code",
  region: "State or province",
  example: { company: "Acme Ltd", line1: "12 Harbour Road", line2: "Suite 4", city: "Springfield", postal: "12345", region: "Central Province" },
}

export function addressWordsFor(country: string): AddressWords {
  return WORDS[country] ?? (country ? OTHER_WORDS : UK_WORDS)
}

/* ─── The check ───────────────────────────────────────────────────────── */

/** "ZIP code" and "Eircode" keep their capitals mid sentence; "Postcode" does not. */
export const inSentence = (word: string) => (/^(ZIP|Eircode)/.test(word) ? word : word.toLowerCase())

/** "the United Kingdom", "Germany". */
const placeName = (code: string) => (code === "GB" || code === "NL" ? `the ${countryName(code)}` : countryName(code))

export type BusinessCheck =
  | { ok: true; value: BusinessDetails }
  /* `say`: the same message as a sentence with blanks, for a checkout in another language (lib/markets/checkout-words). */
  | { ok: false; field: keyof BusinessDetails; error: string; say?: { template: string; vars: Record<string, string> } }

/** In the order the form asks, so the first problem named is the first one on the page. */
export function checkBusiness(raw: unknown): BusinessCheck {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const value = Object.fromEntries(
    (Object.keys(LIMITS) as (keyof BusinessDetails)[]).map((k) => [k, cleanText(r[k], LIMITS[k])]),
  ) as unknown as BusinessDetails
  value.country = value.country.toUpperCase()

  if (value.company.length < 2) return { ok: false, field: "company", error: checkoutMsg("Enter the company's legal name.") }
  if (!COUNTRY_CODES.has(value.country)) return { ok: false, field: "country", error: checkoutMsg("Choose the company's country or region.") }
  if (value.taxId) {
    const tax = normaliseTaxId(value.taxId, value.country)
    if (!tax) {
      const { label, example } = taxIdFor(value.country)
      return TAX_FORMATS[value.country]
        ? { ok: false, field: "taxId", error: `Check the ${label}. In ${placeName(value.country)} it looks like ${example}.`, say: { template: checkoutMsg("Check the {label}. In {country} it looks like {example}."), vars: { label, country: value.country, example } } }
        : { ok: false, field: "taxId", error: checkoutMsg("A tax number is letters and digits, like DE123456789.") }
    }
    value.taxId = tax
  }
  if (value.line1.length < 3) return { ok: false, field: "line1", error: checkoutMsg("Enter the street address.") }
  if (value.city.length < 2) return { ok: false, field: "city", error: checkoutMsg("Enter the city.") }
  const words = addressWordsFor(value.country)
  if (!value.postalCode && needsPostalCode(value.country)) {
    return { ok: false, field: "postalCode", error: `Enter the ${inSentence(words.postal)}.` }
  }
  if (value.postalCode) {
    const format = POSTAL_FORMATS[value.country]
    if (!/^[A-Za-z0-9 \-]{2,20}$/.test(value.postalCode) || (format && !format.test(value.postalCode))) {
      return { ok: false, field: "postalCode", error: `Check the ${inSentence(words.postal)}.` }
    }
    value.postalCode = value.postalCode.toUpperCase()
  }
  return { ok: true, value }
}

/* ─── Where it is kept ────────────────────────────────────────────────── */

/**
 * Into and out of a PaymentIntent's metadata. Stripe keeps 50 keys and 500
 * characters a value, and the payment is the record that outlives any table:
 * an invoice can always be drawn from it.
 *
 * Written in THREE keys (who, street, place), each a JSON list whose worst
 * case, every character a quote escaped to two, stays under 500 with the
 * limits above. One key a field used eight of the 50, and a business buying
 * with a code and a held copy then passed Stripe's limit. A field set that
 * would not fit (it cannot with the limits above) is written the old way,
 * one key a field, never cut. Both ways are read back, so a payment made
 * before the change still makes its invoice.
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

const PACKED = { who: "business", street: "business_street", place: "business_place" } as const
const PACKED_PARTS: Record<keyof typeof PACKED, (keyof BusinessDetails)[]> = {
  who: ["company", "taxId", "country"],
  street: ["line1", "line2"],
  place: ["city", "postalCode", "region"],
}
const VALUE_LIMIT = 500

export function businessToMetadata(b: BusinessDetails): Record<string, string> {
  const packed: Record<string, string> = {}
  for (const part of Object.keys(PACKED) as (keyof typeof PACKED)[]) {
    packed[PACKED[part]] = JSON.stringify(PACKED_PARTS[part].map((k) => b[k] ?? ""))
  }
  if (Object.values(packed).every((v) => v.length <= VALUE_LIMIT)) return packed
  return Object.fromEntries((Object.keys(META_KEYS) as (keyof BusinessDetails)[]).map((k) => [META_KEYS[k], b[k] ?? ""]))
}

function unpackBusiness(meta: Record<string, string | undefined>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  for (const part of Object.keys(PACKED) as (keyof typeof PACKED)[]) {
    const raw = meta[PACKED[part]]
    if (typeof raw !== "string") {
      if (part === "who") return null
      continue
    }
    let list: unknown
    try {
      list = JSON.parse(raw)
    } catch {
      return null
    }
    if (!Array.isArray(list)) return null
    const values: unknown[] = list
    PACKED_PARTS[part].forEach((k, i) => (out[k] = typeof values[i] === "string" ? values[i] : ""))
  }
  return out
}

export function businessFromMetadata(meta: Record<string, string | undefined> | null | undefined): BusinessDetails | null {
  if (!meta) return null
  const packed = unpackBusiness(meta)
  if (packed) return businessFromFields(packed)
  if (!meta.business_company) return null
  return businessFromFields(Object.fromEntries((Object.keys(META_KEYS) as (keyof BusinessDetails)[]).map((k) => [k, meta[META_KEYS[k]]])))
}

/**
 * From what was stored (the order's `business_details`, or any object with
 * these fields), cleaned again on the way out. Null without a company.
 */
export function businessFromFields(raw: unknown): BusinessDetails | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const value = Object.fromEntries(
    (Object.keys(LIMITS) as (keyof BusinessDetails)[]).map((k) => [k, cleanText(r[k], LIMITS[k])]),
  ) as unknown as BusinessDetails
  value.country = COUNTRY_CODES.has(value.country.toUpperCase()) ? value.country.toUpperCase() : ""
  return value.company ? value : null
}

/**
 * A company from Stripe's hosted Checkout, where a basket is paid: its own
 * "I'm purchasing as a business" box gives a business name and tax numbers,
 * and the billing address. Only when the buyer said they were one.
 */
export function businessFromStripe(details: {
  business_name?: string | null
  name?: string | null
  tax_ids?: { value?: string | null }[] | null
  address?: { line1?: string | null; line2?: string | null; city?: string | null; postal_code?: string | null; state?: string | null; country?: string | null } | null
} | null | undefined): BusinessDetails | null {
  if (!details) return null
  const taxId = details.tax_ids?.find((t) => t?.value)?.value ?? ""
  const company = details.business_name || (taxId ? details.name : "") || ""
  if (!company) return null
  const a = details.address ?? {}
  return businessFromFields({
    company,
    taxId,
    country: a.country ?? "",
    line1: a.line1 ?? "",
    line2: a.line2 ?? "",
    city: a.city ?? "",
    postalCode: a.postal_code ?? "",
    region: a.state ?? "",
  })
}

/**
 * The address as the lines of an envelope, in the order the country's post
 * reads them: "New York, NY 10118" in the US, "London" over "NW1 6XE" in the
 * UK, "10117 Berlin" in most of Europe.
 */
export function addressLines(b: BusinessDetails, name: (code: string) => string): string[] {
  const place =
    b.country === "US" || b.country === "CA" || b.country === "AU"
      ? [[b.city, [b.region, b.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ")]
      : b.country === "GB" || b.country === "IE"
        ? [b.city, b.region, b.postalCode]
        : [[b.postalCode, b.city].filter(Boolean).join(" "), b.region]
  return [b.line1, b.line2, ...place, b.country ? name(b.country) : ""].filter((l) => l && l.trim())
}

/** A tax number as a log may carry it: the country letters and the last three. */
export function maskTaxId(taxId: string | null | undefined): string {
  const t = (taxId ?? "").replace(/\s/g, "")
  if (t.length <= 4) return t ? "***" : ""
  return `${t.slice(0, 2)}***${t.slice(-3)}`
}
