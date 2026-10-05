/**
 * ===========================================================================
 *  WHERE SOMEBODY IS FROM, AS A COMMUNITY SHOWS IT
 * ===========================================================================
 * Round 12, ask 15 (part 98: profiles.location_city, at most 80 characters,
 * and profiles.location_country, a two letter code). A member row and the
 * person card say it in quiet text, "Lisbon, Portugal": the city as they
 * wrote it, the country by its full English name from its code (never a
 * flag, never an emoji). Either alone is shown alone; neither, nothing.
 *
 * Worked out on the server (the names come from Intl.DisplayNames, which a
 * browser may spell differently from the server) and sent as a line.
 */
import { COUNTRY_CODES, countryName } from "@/lib/checkout/countries"

/** A code a profile may hold and a filter may ask for: two capitals that name a country. */
export function isCountryCode(v: unknown): v is string {
  return typeof v === "string" && /^[A-Z]{2}$/.test(v) && COUNTRY_CODES.has(v)
}

/** "City, Country", "City", "Country", or null. */
export function placeLine(city: string | null | undefined, country: string | null | undefined): string | null {
  const town = (city || "").replace(/\s+/g, " ").trim().slice(0, 80)
  const code = (country || "").trim().toUpperCase()
  const land = isCountryCode(code) ? countryName(code) : ""
  const line = [town, land].filter(Boolean).join(", ")
  return line || null
}
