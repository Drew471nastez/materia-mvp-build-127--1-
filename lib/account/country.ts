/**
 * ===========================================================================
 *  THE PROFILE'S COUNTRY (Settings, General, Address)
 * ===========================================================================
 * What components/app/settings/country-picker lists and shows, kept apart
 * from React so it can be tested.
 *
 * The list is every country in lib/checkout/countries, by the platform's own
 * English name. What a profile holds is unchanged: the country's English
 * name, which is what the address line in the emails prints
 * (lib/email-campaigns/brand). A profile may hold a code ("SE") or a name
 * from the older hand typed list ("Czech Republic"), and a browser's names
 * can be older or newer than the server's ("Turkey", "Türkiye"), so a held
 * value is read back to its country through all of those.
 */
import type { Choice } from "@/lib/ui/choice-match"
import { COUNTRIES, countryCode, countryName } from "@/lib/checkout/countries"

const MORE_NAMES: Record<string, string> = {
  "czech republic": "CZ",
  czechia: "CZ",
  turkey: "TR",
  türkiye: "TR",
  turkiye: "TR",
  "hong kong": "HK",
  "hong kong sar china": "HK",
  "macao sar china": "MO",
  macau: "MO",
  "south korea": "KR",
  "north korea": "KP",
  "ivory coast": "CI",
  "côte d’ivoire": "CI",
  "cote d'ivoire": "CI",
  "cape verde": "CV",
  swaziland: "SZ",
  eswatini: "SZ",
  burma: "MM",
  myanmar: "MM",
  "east timor": "TL",
  "vatican city": "VA",
}

/** The ISO code of what a profile's country holds, or null when it is neither a code nor a name. */
export function countryOf(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  return countryCode(value) ?? MORE_NAMES[value.trim().toLowerCase().replace(/\s+/g, " ")] ?? null
}

/**
 * The words the field shows for what a profile holds: the name as it is held
 * (so the server and the browser draw the same words), a held code as its
 * country's name, and nothing for nothing.
 */
export function countryLabel(value: string | null | undefined): string {
  const held = typeof value === "string" ? value.trim() : ""
  if (!held) return ""
  const code = countryOf(held)
  return held.length === 2 && code ? countryName(code) : held
}

/** Words a country is also found by in the search, besides its name and code. */
const SEARCH_ALSO: Record<string, string> = {
  US: "usa america united states of america",
  GB: "uk britain great britain england scotland wales northern ireland",
  AE: "uae emirates",
  NL: "holland",
  KR: "korea",
  KP: "korea",
  CZ: "czech republic",
  TR: "turkey turkiye",
  CI: "ivory coast",
  RU: "russia",
  VN: "viet nam",
  LA: "laos",
  MM: "burma",
  SZ: "swaziland",
  CV: "cape verde",
  VA: "vatican",
}

let cached: Choice[] | null = null
/** Every country, by name, as the list's choices. Built once, on the first open. */
export function countryChoices(): Choice[] {
  if (cached) return cached
  cached = COUNTRIES.map((c) => ({ value: c.code, label: c.name, keywords: `${c.code} ${SEARCH_ALSO[c.code] ?? ""}`.trim() }))
  return cached
}

/** What is saved for a country picked from the list: its English name, as before. */
export function countryToSave(code: string): string {
  return countryName(code)
}
