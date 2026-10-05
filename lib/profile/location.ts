/**
 * ===========================================================================
 *  WHERE A PERSON IS FROM
 * ===========================================================================
 * Two optional columns on `profiles` (run-now part 98): `location_city`, free
 * text of at most 80 characters, and `location_country`, a two letter ISO
 * code. The person picks the country by its name in Settings and the code is
 * what is kept, so the name is always the platform's own (lib/checkout/
 * countries, Intl.DisplayNames) and never a spelling somebody typed.
 *
 * Shown quietly under the name on a profile and a creator page, as one line:
 * "Lisbon, Portugal", or only the country, or only the city. No flag, no pin.
 *
 * BEFORE PART 98 RUNS the columns are not there: a read answers "no such
 * column" (42703, or PGRST204 from PostgREST), which is `supported: false`,
 * and Settings then does not offer the fields at all. Nothing else changes.
 *
 * Pure apart from readProfileLocation, so the tests read it without a server.
 */
import { COUNTRY_CODES, countryName } from "@/lib/checkout/countries"

export const CITY_MAX = 80

export interface ProfileLocation {
  city: string | null
  /** Two letter ISO code, upper case. */
  country: string | null
}

export const NO_LOCATION: ProfileLocation = { city: null, country: null }

/** A city as typed: spaces collapsed, control characters gone, at most 80 characters, null when empty. */
export function cleanCity(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text ? Array.from(text).slice(0, CITY_MAX).join("").trim() : null
}

/** A country code the database accepts (^[A-Z]{2}$ and a real country), else null. */
export function cleanCountry(value: unknown): string | null {
  if (typeof value !== "string") return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) && COUNTRY_CODES.has(code) ? code : null
}

/** The one quiet line: "Lisbon, Portugal", "Portugal", "Lisbon", or null when there is nothing. */
export function locationLine(location: Partial<ProfileLocation> | null | undefined): string | null {
  const city = cleanCity(location?.city)
  const country = cleanCountry(location?.country)
  const name = country ? countryName(country) : null
  if (city && name) return city.toLowerCase() === name.toLowerCase() ? name : `${city}, ${name}`
  return city || name || null
}

/** Whether an error is the columns not being there yet (part 98 not run). */
export function missingLocationColumns(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42703" || error.code === "PGRST204" || /location_(city|country)/.test(error.message || "")
}

type Reader = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Their location, read with whatever client the caller has (the service role
 * on a public page: the columns are public anyway). `supported` is false
 * before part 98; any other failure reads as no location, never an error.
 */
export async function readProfileLocation(db: Reader, userId: string): Promise<ProfileLocation & { supported: boolean }> {
  try {
    const { data, error } = await db.from("profiles").select("location_city, location_country").eq("id", userId).maybeSingle()
    if (error) return { ...NO_LOCATION, supported: !missingLocationColumns(error) }
    const row = (data ?? {}) as { location_city?: string | null; location_country?: string | null }
    return { city: cleanCity(row.location_city), country: cleanCountry(row.location_country), supported: true }
  } catch {
    return { ...NO_LOCATION, supported: false }
  }
}
