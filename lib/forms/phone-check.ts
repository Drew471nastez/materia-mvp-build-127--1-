/**
 * ===========================================================================
 *  A PHONE NUMBER CHECKED THE WAY ITS COUNTRY WRITES IT
 * ===========================================================================
 * The owner: "detect the country from the number (default from the creator
 * or visitor country), show flag and code, format as typed, validate with a
 * calm clear error". The field (components/forms/phone-number-field) does
 * the first three with lib/account/phone; this file is the rest:
 *
 *   phoneLengths    how many digits a number has after its calling code,
 *                   for the countries Storelib's creators and visitors are
 *                   in most (the ITU plans, mobile and landline together);
 *                   every other country gets E.164's own bounds
 *   phoneProblem    "short" or "long" for this country, or null. A number
 *                   still being typed is short; the field says so only once
 *                   it is left, and "long" at once, since more digits never
 *                   make it right
 *   guessCountry    the country a number with no code is in: the time zone
 *                   first (where the person is), then the browser's
 *                   language region, then the US
 *
 * No library: the repository has no phone metadata package, and lengths are
 * all a calm check needs here. Pure, so tests/onepage-editor-op.test.ts runs it.
 */
import { callingCode, digitsFromKept } from "@/lib/account/phone"

/* National significant number lengths, [shortest, longest]. "1" is the whole North American plan. */
const LENGTHS: Record<string, [number, number]> = {
  "1": [10, 10],
  GB: [9, 10], IE: [7, 9], FR: [9, 9], ES: [9, 9], PT: [9, 9], IT: [6, 11], DE: [6, 13], AT: [4, 13], CH: [9, 9],
  NL: [9, 9], BE: [8, 9], LU: [6, 11], DK: [8, 8], NO: [8, 8], SE: [7, 10], FI: [5, 12], IS: [7, 9],
  PL: [9, 9], CZ: [9, 9], SK: [9, 9], HU: [8, 9], RO: [9, 9], BG: [7, 9], GR: [10, 10], HR: [8, 9], SI: [8, 8],
  RS: [8, 10], MD: [8, 8], UA: [9, 9], LT: [8, 8], LV: [8, 8], EE: [7, 8], CY: [8, 8], MT: [8, 8],
  RU: [10, 10], KZ: [10, 10], TR: [10, 10], IL: [8, 9], AE: [8, 9], SA: [9, 9], QA: [8, 8], KW: [8, 8], EG: [9, 10],
  MA: [9, 9], ZA: [9, 9], NG: [8, 10], KE: [9, 9], GH: [9, 9],
  IN: [10, 10], PK: [9, 10], BD: [9, 10], CN: [10, 11], HK: [8, 8], TW: [8, 9], JP: [9, 10], KR: [9, 10],
  SG: [8, 8], MY: [9, 10], TH: [8, 9], VN: [9, 10], PH: [9, 10], ID: [9, 12],
  AU: [9, 9], NZ: [8, 10], BR: [10, 11], MX: [10, 10], AR: [10, 10], CO: [10, 10], CL: [9, 9], PE: [8, 9],
}

/** How many digits follow the calling code in this country, shortest and longest. */
export function phoneLengths(country: string): [number, number] {
  const cc = (country || "").toUpperCase()
  const code = callingCode(cc)
  const own = LENGTHS[code === "1" ? "1" : cc]
  if (own) return own
  /* E.164: fifteen digits in all, and no real number is under four after its code. */
  return [4, 15 - (code?.length ?? 1)]
}

export type PhoneProblem = "short" | "long" | null

/** What is wrong with a kept number ("+40712345678", or "+40 712 345 678") for this country, or null when nothing is or it is empty. */
export function phoneProblem(kept: string | null | undefined, country: string): PhoneProblem {
  const digits = digitsFromKept(String(kept ?? ""), country)
  if (!digits) return null
  const [min, max] = phoneLengths(country)
  if (digits.length > max) return "long"
  if (digits.length < min) return "short"
  /* A North American number never starts its area code with 0 or 1. */
  if (callingCode(country) === "1" && /^[01]/.test(digits)) return "short"
  return null
}

/* Where a time zone is, for the zones most people are in. One per zone; a shared zone takes its main country. */
const ZONE_COUNTRY: Record<string, string> = {
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Lisbon": "PT", "Europe/Madrid": "ES", "Europe/Paris": "FR",
  "Europe/Brussels": "BE", "Europe/Amsterdam": "NL", "Europe/Luxembourg": "LU", "Europe/Berlin": "DE", "Europe/Zurich": "CH",
  "Europe/Vienna": "AT", "Europe/Rome": "IT", "Europe/Copenhagen": "DK", "Europe/Oslo": "NO", "Europe/Stockholm": "SE",
  "Europe/Helsinki": "FI", "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Bratislava": "SK", "Europe/Budapest": "HU",
  "Europe/Bucharest": "RO", "Europe/Chisinau": "MD", "Europe/Sofia": "BG", "Europe/Athens": "GR", "Europe/Zagreb": "HR",
  "Europe/Ljubljana": "SI", "Europe/Belgrade": "RS", "Europe/Kiev": "UA", "Europe/Kyiv": "UA", "Europe/Vilnius": "LT",
  "Europe/Riga": "LV", "Europe/Tallinn": "EE", "Europe/Istanbul": "TR", "Europe/Moscow": "RU", "Asia/Nicosia": "CY", "Europe/Malta": "MT",
  "Atlantic/Reykjavik": "IS", "Asia/Jerusalem": "IL", "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Qatar": "QA", "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA", "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Accra": "GH",
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK",
  "Asia/Taipei": "TW", "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY", "Asia/Bangkok": "TH",
  "Asia/Ho_Chi_Minh": "VN", "Asia/Manila": "PH", "Asia/Jakarta": "ID", "Australia/Sydney": "AU", "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU", "Australia/Perth": "AU", "Australia/Adelaide": "AU", "Pacific/Auckland": "NZ", "America/Sao_Paulo": "BR",
  "America/Mexico_City": "MX", "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Santiago": "CL", "America/Lima": "PE",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA", "America/Halifax": "CA",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Phoenix": "US", "America/Los_Angeles": "US",
  "America/Anchorage": "US", "Pacific/Honolulu": "US", "America/Detroit": "US", "America/Puerto_Rico": "PR",
}

/** The country a number typed without its code is most likely in: the time zone, then the language's region, then the US. */
export function guessCountry(input: { timeZone?: string | null; languages?: readonly string[] | null }): string {
  const zone = input.timeZone ? ZONE_COUNTRY[input.timeZone] : undefined
  if (zone && callingCode(zone)) return zone
  for (const lang of input.languages ?? []) {
    const region = String(lang || "").split(/[-_]/)[1]
    if (region && /^[A-Za-z]{2}$/.test(region) && callingCode(region)) return region.toUpperCase()
  }
  return "US"
}
