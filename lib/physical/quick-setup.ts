/**
 * ===========================================================================
 *  QUICK SETUP: A FIRST WAY TO SHIP, FROM WHAT THE STORE ALREADY KNOWS
 * ===========================================================================
 * A new store that sells things that ship has a General profile with no
 * zones and no rates (app/api/physical/onboarding). Rather than send a
 * beginner through zones, rate kinds and units, Settings › Shipping and
 * delivery proposes one starting setup built from the store's country:
 *
 *   home      a zone for the store's own country, one flat rate
 *   abroad    the rest of the EU for a store in the EU, else every other
 *             country (rest of world), one flat rate; can be left off
 *   units     imperial in the US, Liberia and Myanmar, metric elsewhere,
 *             never asked
 *   estimate  a delivery time to start from, shown and editable
 *
 * Prices are NOT proposed. They start empty and the merchant types each
 * one (0 is free shipping): a number Storelib made up could be saved
 * without being read, and every buyer would then pay it. Nothing is
 * written until "Use this setup" is pressed (app/api/physical/shipping/
 * quick-setup), which is why the onboarding rule "rates are never
 * invented" still holds.
 *
 * Pure, so the settings page, the route and the tests agree.
 */
import { REGIONS } from "@/lib/markets/regions"
import { countryName } from "@/lib/checkout/countries"
import { tt } from "@/lib/i18n/text"
import type { ShippingProfile, ShippingRate, ShippingZone, UnitSystem } from "./types"

/** The 27 member states, from the one list Markets already uses (lib/markets/regions.ts). */
export const EU_COUNTRIES: readonly string[] = REGIONS.find((r) => r.id === "eu")?.countries ?? []

/** Where weights are typed in pounds and sizes in inches. */
const IMPERIAL = new Set(["US", "LR", "MM"])

const code = (country: string | null | undefined) => (country ?? "").trim().toUpperCase()

export function unitSystemFor(country: string | null | undefined): UnitSystem {
  return IMPERIAL.has(code(country)) ? "imperial" : "metric"
}

export function isEuCountry(country: string | null | undefined): boolean {
  return EU_COUNTRIES.includes(code(country))
}

/** Business days to start from, by where the parcel goes. Shown in the fields, never saved unseen. */
export const ESTIMATE_START = {
  home: { minDays: 2, maxDays: 4 },
  eu: { minDays: 3, maxDays: 7 },
  world: { minDays: 7, maxDays: 21 },
} as const

export interface SetupZone {
  /** As the zone is named in the profile (only the merchant sees it). */
  name: string
  countries: string[]
  restOfWorld: boolean
}

/** The zones Quick setup makes for a store in this country. The same on the page and in the route. */
export function quickSetupZones(country: string): { home: SetupZone; abroad: SetupZone & { kind: "eu" | "world" } } {
  const cc = code(country)
  const eu = isEuCountry(cc)
  return {
    home: { name: countryName(cc), countries: [cc], restOfWorld: false },
    abroad: eu ? { kind: "eu", name: "Rest of the EU", countries: EU_COUNTRIES.filter((c) => c !== cc), restOfWorld: false } : { kind: "world", name: "Rest of world", countries: [], restOfWorld: true },
  }
}

export interface QuickSetupProposal {
  country: string
  currency: string
  units: UnitSystem
  home: SetupZone & { label: string; minDays: number; maxDays: number }
  abroad: SetupZone & { kind: "eu" | "world"; label: string; minDays: number; maxDays: number }
}

/** What the Quick setup card shows for this store; null without a country to start from. */
export function quickSetupProposal(input: { country: string | null | undefined; currency: string }): QuickSetupProposal | null {
  const cc = code(input.country)
  if (!/^[A-Z]{2}$/.test(cc)) return null
  const zones = quickSetupZones(cc)
  const abroadDays = zones.abroad.kind === "eu" ? ESTIMATE_START.eu : ESTIMATE_START.world
  return {
    country: cc,
    currency: input.currency.toUpperCase(),
    units: unitSystemFor(cc),
    home: { ...zones.home, label: tt("Shipping inside {country}", { country: countryName(cc) }), ...ESTIMATE_START.home },
    abroad: { ...zones.abroad, label: zones.abroad.kind === "eu" ? tt("Shipping to the rest of the EU") : tt("Shipping to the rest of the world"), ...abroadDays },
  }
}

/** A rate a buyer can be offered with nothing connected, in a zone that covers somewhere. As lib/physical/readiness.ts counts it. */
export function usableRatesOf(zone: ShippingZone): ShippingRate[] {
  if (!zone.restOfWorld && zone.countries.length === 0 && (zone.regions ?? []).length === 0) return []
  return zone.rates.filter((r) => r.active && r.kind !== "carrier")
}

export function hasUsableRate(profiles: ShippingProfile[]): boolean {
  return profiles.some((p) => p.zones.some((z) => usableRatesOf(z).length > 0))
}

/**
 * Whether the short summary says everything about this store's shipping:
 * one profile, a few zones, each with a flat or free rate it can use. A
 * store set up any further way opens with the full settings, as before.
 */
export function isSimpleSetup(profiles: ShippingProfile[]): boolean {
  if (profiles.length !== 1) return false
  const zones = profiles[0].zones
  if (zones.length === 0 || zones.length > 3) return false
  return zones.every((z) => {
    const usable = usableRatesOf(z)
    return usable.length > 0 && z.rates.every((r) => r.kind === "flat" || r.kind === "free")
  })
}

export interface SummaryRow {
  zoneId: string
  place: string
  price: string
  days: string
  free: string | null
}

function daysText(minDays: number | null, maxDays: number | null): string {
  if (minDays !== null && maxDays !== null) return minDays === maxDays ? tt("{n, plural, one {# business day} other {# business days}}", { n: minDays }) : tt("{min} to {max} business days", { min: minDays, max: maxDays })
  if (maxDays !== null) return tt("Up to {n, plural, one {# business day} other {# business days}}", { n: maxDays })
  if (minDays !== null) return tt("From {n, plural, one {# business day} other {# business days}}", { n: minDays })
  return ""
}

/** "Romania", "the rest of the EU", "everywhere else": a zone as a sentence names it. */
export function zonePlace(zone: Pick<ShippingZone, "name" | "countries" | "regions" | "restOfWorld">, home: string | null | undefined): string {
  if (zone.restOfWorld) return tt("everywhere else")
  const cc = code(home)
  const regions = zone.regions ?? []
  if (regions.length === 0 && cc && isEuCountry(cc)) {
    const rest = EU_COUNTRIES.filter((c) => c !== cc)
    if (zone.countries.length === rest.length && rest.every((c) => zone.countries.includes(c))) return tt("the rest of the EU")
  }
  if (regions.length === 0 && zone.countries.length === EU_COUNTRIES.length && EU_COUNTRIES.every((c) => zone.countries.includes(c))) return tt("the EU")
  if (regions.length === 0 && zone.countries.length === 1) return countryName(zone.countries[0])
  return zone.name
}

/**
 * The general profile's shipping in a few lines: where, for how much, how
 * long. `money` writes an amount in the store's currency.
 */
export function shippingSummary(profiles: ShippingProfile[], opts: { home: string | null | undefined; money: (cents: number) => string }): { sentence: string; rows: SummaryRow[] } {
  const profile = profiles.find((p) => p.isDefault) ?? profiles[0]
  const rows: SummaryRow[] = []
  for (const z of profile?.zones ?? []) {
    const usable = usableRatesOf(z)
    if (usable.length === 0) continue
    const prices = usable.map((r) => (r.kind === "free" && !r.minValue ? 0 : r.tiers.length ? Math.min(...r.tiers.map((t) => t.priceCents)) : r.priceCents))
    const low = Math.min(...prices)
    const many = new Set(prices).size > 1
    const freeAt = usable.map((r) => (r.kind === "free" ? r.minValue : r.freeOverCents)).filter((n): n is number => typeof n === "number" && n > 0)
    const mins = usable.map((r) => r.minDays).filter((n): n is number => n !== null)
    const maxs = usable.map((r) => r.maxDays).filter((n): n is number => n !== null)
    rows.push({
      zoneId: z.id,
      place: zonePlace(z, opts.home),
      price: low === 0 && !many ? tt("free") : many ? tt("from {amount}", { amount: opts.money(low) }) : opts.money(low),
      days: daysText(mins.length ? Math.min(...mins) : null, maxs.length ? Math.max(...maxs) : null),
      free: freeAt.length ? tt("Free over {amount}", { amount: opts.money(Math.min(...freeAt)) }) : null,
    })
  }
  if (rows.length === 0) return { sentence: tt("No rates in your general profile yet."), rows }
  const parts = rows.map((r) => tt("to {place} for {price}", { place: r.place, price: r.price }))
  const places = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} ${tt("and")} ${parts[parts.length - 1]}`
  const mins = (profile?.zones ?? []).flatMap(usableRatesOf).map((r) => r.minDays).filter((n): n is number => n !== null)
  const maxs = (profile?.zones ?? []).flatMap(usableRatesOf).map((r) => r.maxDays).filter((n): n is number => n !== null)
  const days = daysText(mins.length ? Math.min(...mins) : null, maxs.length ? Math.max(...maxs) : null)
  return { sentence: days ? tt("You ship {places}, {days}.", { places, days }) : tt("You ship {places}.", { places }), rows }
}
