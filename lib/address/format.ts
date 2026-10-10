/**
 * ===========================================================================
 *  AN ADDRESS, THE WAY EACH COUNTRY WRITES IT
 * ===========================================================================
 * Every address form (a location in Settings, the physical checkout) asks
 * the same five things, but not in the same words or with the same rules:
 * the US has a State and a ZIP code, the UK a Postcode and no state worth
 * asking for, Ireland an optional Eircode, Hong Kong no postal code at all.
 *
 *   region   what the country calls its first division, and whether the
 *            post needs it (hidden where nobody writes one)
 *   postal   what the code is called, whether the post needs one, and its
 *            shape where it has one simple shape (a soft check: a code that
 *            does not match is asked about, the server keeps its own rules)
 *
 * A country not listed gets "Region" (optional) and "Postal code" (needed
 * unless the post works without one, lib/physical/address.ts).
 */
import { postalCodeRequired } from "@/lib/physical/address"

export interface AddressFormat {
  region: { label: string; required: boolean } | null
  postal: { label: string; required: boolean; pattern?: RegExp; example?: string }
}

type Spec = { region?: [string, boolean] | null; postal?: [string, RegExp?, string?]; postalOptional?: boolean }

const FORMATS: Record<string, Spec> = {
  US: { region: ["State", true], postal: ["ZIP code", /^\d{5}(-\d{4})?$/, "94107"] },
  CA: { region: ["Province", true], postal: ["Postal code", /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i, "M5V 2T6"] },
  AU: { region: ["State or territory", true], postal: ["Postcode", /^\d{4}$/, "2000"] },
  NZ: { region: ["Region", false], postal: ["Postcode", /^\d{4}$/, "1010"] },
  GB: { region: null, postal: ["Postcode", /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, "SW1A 1AA"] },
  IE: { region: ["County", false], postal: ["Eircode", /^[A-Z]\d{2} ?[A-Z\d]{4}$/i, "D02 X285"], postalOptional: true },
  DE: { region: null, postal: ["Postal code", /^\d{5}$/, "10115"] },
  AT: { region: null, postal: ["Postal code", /^\d{4}$/, "1010"] },
  CH: { region: null, postal: ["Postal code", /^\d{4}$/, "8001"] },
  FR: { region: null, postal: ["Postal code", /^\d{5}$/, "75001"] },
  BE: { region: null, postal: ["Postal code", /^\d{4}$/, "1000"] },
  NL: { region: null, postal: ["Postcode", /^\d{4} ?[A-Z]{2}$/i, "1012 AB"] },
  LU: { region: null, postal: ["Postal code", /^\d{4}$/, "1009"] },
  IT: { region: ["Province", false], postal: ["Postal code", /^\d{5}$/, "00184"] },
  ES: { region: ["Province", false], postal: ["Postal code", /^\d{5}$/, "28013"] },
  PT: { region: null, postal: ["Postal code", /^\d{4}-\d{3}$/, "1100-148"] },
  RO: { region: ["County", false], postal: ["Postal code", /^\d{6}$/, "030031"] },
  PL: { region: null, postal: ["Postal code", /^\d{2}-\d{3}$/, "00-001"] },
  CZ: { region: null, postal: ["Postal code", /^\d{3} ?\d{2}$/, "110 00"] },
  SK: { region: null, postal: ["Postal code", /^\d{3} ?\d{2}$/, "811 01"] },
  HU: { region: null, postal: ["Postal code", /^\d{4}$/, "1051"] },
  BG: { region: null, postal: ["Postal code", /^\d{4}$/, "1000"] },
  GR: { region: null, postal: ["Postal code", /^\d{3} ?\d{2}$/, "105 57"] },
  SE: { region: null, postal: ["Postal code", /^\d{3} ?\d{2}$/, "111 22"] },
  DK: { region: null, postal: ["Postal code", /^\d{4}$/, "1050"] },
  NO: { region: null, postal: ["Postal code", /^\d{4}$/, "0150"] },
  FI: { region: null, postal: ["Postal code", /^\d{5}$/, "00100"] },
  MX: { region: ["State", true], postal: ["Postal code", /^\d{5}$/, "06600"] },
  BR: { region: ["State", true], postal: ["CEP", /^\d{5}-?\d{3}$/, "01310-100"] },
  AR: { region: ["Province", true], postal: ["Postal code"] },
  IN: { region: ["State", true], postal: ["PIN code", /^\d{6}$/, "110001"] },
  JP: { region: ["Prefecture", true], postal: ["Postal code", /^\d{3}-?\d{4}$/, "100-0001"] },
  CN: { region: ["Province", true], postal: ["Postal code", /^\d{6}$/, "100000"] },
  KR: { region: ["Province", false], postal: ["Postal code", /^\d{5}$/, "03187"] },
  SG: { region: null, postal: ["Postal code", /^\d{6}$/, "018956"] },
  ZA: { region: ["Province", false], postal: ["Postal code", /^\d{4}$/, "8001"] },
  AE: { region: ["Emirate", true] },
  HK: { region: ["Area", false] },
}

export function addressFormat(country: string | null | undefined): AddressFormat {
  const code = (country ?? "").toUpperCase()
  const spec = FORMATS[code]
  const needsPostal = code ? postalCodeRequired(code) : true
  const region = spec ? (spec.region === null ? null : spec.region ? { label: spec.region[0], required: spec.region[1] } : { label: "Region", required: false }) : { label: "Region", required: false }
  const [label, pattern, example] = spec?.postal ?? ["Postal code"]
  return { region, postal: { label, required: needsPostal && !spec?.postalOptional, pattern, example } }
}

/** A typed code against the country's usual shape: true when it fits or the country has no single shape. */
export function postalLooksRight(country: string | null | undefined, code: string): boolean {
  const p = addressFormat(country).postal.pattern
  return !p || !code.trim() || p.test(code.trim())
}
