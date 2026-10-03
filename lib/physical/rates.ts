/**
 * ===========================================================================
 *  SHIPPING RATES: WHAT DELIVERY COSTS FOR THIS CART, TO THIS COUNTRY
 * ===========================================================================
 * Pure, and the only place a delivery price is worked out: the checkout page
 * shows what quoteDelivery returns, and the server quotes again when the
 * buyer pays and charges only an option it can find again. A price the
 * browser sends is never read.
 *
 * Each shippable line belongs to a shipping profile (its own, or the shop's
 * default). In each profile the zone for the buyer's country is used (a zone
 * naming the country beats "Rest of world"), and in it every active rate the
 * cart qualifies for:
 *   flat      always, at its price
 *   free      always, at nothing
 *   weight    when the profile's lines weigh between min and max grams
 *   price     when they cost between min and max cents
 *   quantity  when there are between min and max units
 * Any rate with free_over_cents costs nothing once the lines reach it.
 * Carrier rates are priced by a connected carrier, so they are only offered
 * when a quote for them is passed in; with none they are left out, never
 * guessed.
 *
 * Several profiles in one cart: the buyer still picks one option. A rate
 * name every profile offers ("Express") becomes one option at the sum of
 * those rates; when no name is shared, the cheapest of each profile is
 * offered together as "Standard shipping".
 */

import type { DeliveryOption, ShippingProfile, ShippingRate, ShippingZone } from "./types"

export interface QuoteLine {
  shippingProfileId: string | null
  quantity: number
  /** After the line's code discount: free over $50 means the buyer pays $50. */
  lineCents: number
  weightGrams: number
  requiresShipping: boolean
}

export type Quote =
  | { ok: true; required: false; options: [] }
  | { ok: true; required: true; options: DeliveryOption[] }
  | { ok: false; error: string; unshippableProfileIds: string[] }

export function zoneFor(profile: ShippingProfile, country: string): ShippingZone | null {
  const code = country.toUpperCase()
  return profile.zones.find((z) => !z.restOfWorld && z.countries.some((c) => c.toUpperCase() === code)) ?? profile.zones.find((z) => z.restOfWorld) ?? null
}

function within(value: number, min: number | null, max: number | null): boolean {
  if (min !== null && value < min) return false
  if (max !== null && value > max) return false
  return true
}

interface ProfileTotals {
  units: number
  cents: number
  grams: number
}

/** The price of one rate for one profile's share of the cart, or null when the cart does not qualify. */
export function ratePrice(rate: ShippingRate, t: ProfileTotals, carrierQuotes?: ReadonlyMap<string, number>): number | null {
  if (!rate.active) return null
  let price: number | null
  switch (rate.kind) {
    case "flat":
      price = rate.priceCents
      break
    case "free":
      price = 0
      break
    case "weight":
      price = within(t.grams, rate.minValue, rate.maxValue) ? rate.priceCents : null
      break
    case "price":
      price = within(t.cents, rate.minValue, rate.maxValue) ? rate.priceCents : null
      break
    case "quantity":
      price = within(t.units, rate.minValue, rate.maxValue) ? rate.priceCents : null
      break
    case "carrier": {
      const quoted = carrierQuotes?.get(rate.id)
      price = typeof quoted === "number" && Number.isFinite(quoted) && quoted >= 0 ? Math.round(quoted) : null
      break
    }
    default:
      price = null
  }
  if (price === null) return null
  if (rate.freeOverCents !== null && rate.freeOverCents > 0 && t.cents >= rate.freeOverCents) return 0
  return Math.max(0, Math.round(price))
}

function days(min: (number | null)[], max: (number | null)[]): { minDays: number | null; maxDays: number | null } {
  const mins = min.filter((d): d is number => d !== null)
  const maxs = max.filter((d): d is number => d !== null)
  return {
    minDays: mins.length === min.length && mins.length ? Math.max(...mins) : null,
    maxDays: maxs.length === max.length && maxs.length ? Math.max(...maxs) : null,
  }
}

const nameKey = (name: string) => name.trim().toLowerCase()

export function quoteDelivery(
  profiles: ShippingProfile[],
  lines: QuoteLine[],
  country: string,
  carrierQuotes?: ReadonlyMap<string, number>,
): Quote {
  const shippable = lines.filter((l) => l.requiresShipping && l.quantity > 0)
  if (shippable.length === 0) return { ok: true, required: false, options: [] }
  const fallback = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null
  if (!fallback) return { ok: false, error: "This shop has not set up delivery yet.", unshippableProfileIds: [] }

  const groups = new Map<string, { profile: ShippingProfile; totals: ProfileTotals }>()
  for (const line of shippable) {
    const profile = profiles.find((p) => p.id === line.shippingProfileId) ?? fallback
    const group = groups.get(profile.id) ?? { profile, totals: { units: 0, cents: 0, grams: 0 } }
    group.totals.units += line.quantity
    group.totals.cents += Math.max(0, line.lineCents)
    group.totals.grams += Math.max(0, line.weightGrams) * line.quantity
    groups.set(profile.id, group)
  }

  const perProfile: { profileId: string; rates: { rate: ShippingRate; price: number }[] }[] = []
  const unshippable: string[] = []
  for (const { profile, totals } of groups.values()) {
    const zone = zoneFor(profile, country)
    const rates = (zone?.rates ?? [])
      .map((rate) => ({ rate, price: ratePrice(rate, totals, carrierQuotes) }))
      .filter((r): r is { rate: ShippingRate; price: number } => r.price !== null)
      .sort((a, b) => a.price - b.price || a.rate.position - b.rate.position)
    if (rates.length === 0) unshippable.push(profile.id)
    perProfile.push({ profileId: profile.id, rates })
  }
  if (unshippable.length) {
    return { ok: false, error: "Some items in your cart can't be delivered to this country.", unshippableProfileIds: unshippable }
  }

  if (perProfile.length === 1) {
    const options = perProfile[0].rates.map(({ rate, price }) => ({
      id: rate.id,
      name: rate.name,
      priceCents: price,
      minDays: rate.minDays,
      maxDays: rate.maxDays,
      rateIds: [rate.id],
    }))
    return { ok: true, required: true, options: dedupeByName(options) }
  }

  /* Names every profile offers, each profile's cheapest rate of that name. */
  const options: DeliveryOption[] = []
  const firstNames = [...new Set(perProfile[0].rates.map((r) => nameKey(r.rate.name)))]
  for (const key of firstNames) {
    const picks = perProfile.map((p) => p.rates.find((r) => nameKey(r.rate.name) === key) ?? null)
    if (picks.some((p) => p === null)) continue
    const chosen = picks as { rate: ShippingRate; price: number }[]
    options.push({
      id: chosen.map((c) => c.rate.id).join("+"),
      name: chosen[0].rate.name,
      priceCents: chosen.reduce((n, c) => n + c.price, 0),
      ...days(chosen.map((c) => c.rate.minDays), chosen.map((c) => c.rate.maxDays)),
      rateIds: chosen.map((c) => c.rate.id),
    })
  }
  if (options.length === 0) {
    const cheapest = perProfile.map((p) => p.rates[0])
    options.push({
      id: cheapest.map((c) => c.rate.id).join("+"),
      name: "Standard shipping",
      priceCents: cheapest.reduce((n, c) => n + c.price, 0),
      ...days(cheapest.map((c) => c.rate.minDays), cheapest.map((c) => c.rate.maxDays)),
      rateIds: cheapest.map((c) => c.rate.id),
    })
  }
  return { ok: true, required: true, options: options.sort((a, b) => a.priceCents - b.priceCents) }
}

/** Two rates with the same name in one zone: the buyer sees the cheaper one. */
function dedupeByName(options: DeliveryOption[]): DeliveryOption[] {
  const seen = new Set<string>()
  return options.filter((o) => {
    const key = nameKey(o.name)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The option the buyer chose, found again in a fresh quote; null when it is no longer offered. */
export function pickOption(quote: Quote, optionId: unknown): DeliveryOption | null {
  if (!quote.ok || !quote.required || typeof optionId !== "string") return null
  return quote.options.find((o) => o.id === optionId) ?? null
}

export function deliveryEstimate(o: Pick<DeliveryOption, "minDays" | "maxDays">): string {
  if (o.minDays !== null && o.maxDays !== null) {
    if (o.minDays === o.maxDays) return `${o.minDays} business ${o.minDays === 1 ? "day" : "days"}`
    return `${o.minDays} to ${o.maxDays} business days`
  }
  if (o.maxDays !== null) return `Up to ${o.maxDays} business days`
  if (o.minDays !== null) return `From ${o.minDays} business days`
  return ""
}
