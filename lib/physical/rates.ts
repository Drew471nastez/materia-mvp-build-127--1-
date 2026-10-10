/**
 * ===========================================================================
 *  SHIPPING RATES: WHAT DELIVERY COSTS FOR THIS CART, TO THIS ADDRESS
 * ===========================================================================
 * Pure, and the only place a delivery price is worked out: the checkout page
 * shows what quoteDelivery returns, and the server quotes again when the
 * buyer pays and charges only an option it can find again. A price the
 * browser sends is never read.
 *
 * Each shippable line belongs to a shipping profile (its own, or the shop's
 * General profile). In each profile the zone for the buyer's address is
 * used (a zone naming the state beats one naming the country, which beats
 * "Rest of world"), and in it every active rate the cart qualifies for:
 *
 *   flat         always, at its price
 *   free         always, or only from an order value (min_value, cents)
 *   price        by order price: the tier the order's value falls in
 *   weight       by order weight: the tier the order's total weight falls in
 *   item_weight  by item weight: every item priced by the tier its own
 *                weight falls in, added up
 *   quantity     when there are between min and max units (older rates)
 *
 * A tier is "from this value on, this price"; below the first tier, or above
 * max_value when one is set, the rate is not offered. Rates made before
 * tiers (min and max only) keep working: within the range, at their price.
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

import { regionKey } from "./regions"
import type { DeliveryOption, RateTier, ShippingProfile, ShippingRate, ShippingZone } from "./types"

export interface QuoteLine {
  shippingProfileId: string | null
  quantity: number
  /** After the line's code discount: free over $50 means the buyer pays $50. */
  lineCents: number
  /** One unit's weight. */
  weightGrams: number
  requiresShipping: boolean
}

export interface Destination {
  country: string
  region?: string | null
}

export type Quote =
  | { ok: true; required: false; options: [] }
  | { ok: true; required: true; options: DeliveryOption[] }
  | { ok: false; error: string; unshippableProfileIds: string[] }

export function zoneFor(profile: ShippingProfile, destination: string | Destination): ShippingZone | null {
  const d = typeof destination === "string" ? { country: destination, region: null } : destination
  const code = d.country.toUpperCase()
  const state = regionKey(code, d.region ?? null)
  return (
    (state ? profile.zones.find((z) => !z.restOfWorld && (z.regions ?? []).includes(state)) : null) ??
    profile.zones.find((z) => !z.restOfWorld && z.countries.some((c) => c.toUpperCase() === code)) ??
    profile.zones.find((z) => z.restOfWorld) ??
    null
  )
}

/** The price of the tier a value falls in: the last tier whose `from` it reached. Null below the first tier. */
export function tierPrice(tiers: RateTier[], value: number): number | null {
  let price: number | null = null
  for (const t of [...tiers].sort((a, b) => a.from - b.from)) {
    if (value >= t.from) price = t.priceCents
    else break
  }
  return price
}

/** Tiers as stored: from 0 up, ascending, one per starting value, at most 20. */
export function readTiers(value: unknown): RateTier[] {
  if (!Array.isArray(value)) return []
  const byFrom = new Map<number, number>()
  for (const raw of value.slice(0, 20)) {
    const r = raw as Record<string, unknown>
    const from = Math.round(Number(r?.from))
    const price = Math.round(Number(r?.priceCents))
    if (!Number.isFinite(from) || from < 0 || from > 1_000_000_000) continue
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) continue
    byFrom.set(from, price)
  }
  return [...byFrom.entries()].sort((a, b) => a[0] - b[0]).map(([from, priceCents]) => ({ from, priceCents }))
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
  /** Each line's unit weight and how many: item weight rates price every item on its own. */
  items?: { grams: number; quantity: number }[]
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
      price = rate.minValue !== null && t.cents < rate.minValue ? null : 0
      break
    case "weight":
      price = tiered(rate, t.grams)
      break
    case "price":
      price = tiered(rate, t.cents)
      break
    case "item_weight": {
      const tiers = rate.tiers ?? []
      if (tiers.length === 0) {
        price = null
        break
      }
      let sum = 0
      for (const item of t.items ?? []) {
        if (rate.maxValue !== null && item.grams > rate.maxValue) {
          sum = -1
          break
        }
        const each = tierPrice(tiers, item.grams)
        if (each === null) {
          sum = -1
          break
        }
        sum += each * item.quantity
      }
      price = sum < 0 ? null : sum
      break
    }
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

/** Order price or order weight: the tier the value falls in, or the old min/max range. */
function tiered(rate: ShippingRate, value: number): number | null {
  const tiers = rate.tiers ?? []
  if (tiers.length === 0) return within(value, rate.minValue, rate.maxValue) ? rate.priceCents : null
  if (rate.maxValue !== null && value > rate.maxValue) return null
  return tierPrice(tiers, value)
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
  destination: string | Destination,
  carrierQuotes?: ReadonlyMap<string, number>,
  /** The empty weight of the box it ships in (Settings › Shipping › Packages, the default one), added once per parcel. */
  opts: { packageGrams?: number } = {},
): Quote {
  const shippable = lines.filter((l) => l.requiresShipping && l.quantity > 0)
  if (shippable.length === 0) return { ok: true, required: false, options: [] }
  const fallback = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null
  if (!fallback) return { ok: false, error: "This shop has not set up delivery yet.", unshippableProfileIds: [] }

  const groups = new Map<string, { profile: ShippingProfile; totals: ProfileTotals }>()
  for (const line of shippable) {
    const profile = profiles.find((p) => p.id === line.shippingProfileId) ?? fallback
    const group = groups.get(profile.id) ?? { profile, totals: { units: 0, cents: 0, grams: 0, items: [] as { grams: number; quantity: number }[] } }
    group.totals.units += line.quantity
    group.totals.cents += Math.max(0, line.lineCents)
    group.totals.grams += Math.max(0, line.weightGrams) * line.quantity
    group.totals.items!.push({ grams: Math.max(0, line.weightGrams), quantity: line.quantity })
    groups.set(profile.id, group)
  }
  /* Each profile ships as its own parcel, so each carries the box's weight once. Item weight rates price the items alone. */
  const box = Math.max(0, Math.round(opts.packageGrams ?? 0))
  if (box > 0) for (const g of groups.values()) g.totals.grams += box

  const perProfile: { profileId: string; rates: { rate: ShippingRate; price: number }[] }[] = []
  const unshippable: string[] = []
  for (const { profile, totals } of groups.values()) {
    const zone = zoneFor(profile, destination)
    const rates = (zone?.rates ?? [])
      .map((rate) => ({ rate, price: ratePrice(rate, totals, carrierQuotes) }))
      .filter((r): r is { rate: ShippingRate; price: number } => r.price !== null)
      .sort((a, b) => a.price - b.price || a.rate.position - b.rate.position)
    if (rates.length === 0) unshippable.push(profile.id)
    perProfile.push({ profileId: profile.id, rates })
  }
  if (unshippable.length) {
    return { ok: false, error: "Shipping isn't available to this address for some items in your cart.", unshippableProfileIds: unshippable }
  }

  if (perProfile.length === 1) {
    const options = perProfile[0].rates.map(({ rate, price }) => ({
      id: rate.id,
      name: rate.name,
      priceCents: price,
      minDays: rate.minDays,
      maxDays: rate.maxDays,
      rateIds: [rate.id],
      kind: "ship" as const,
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
      kind: "ship",
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
      kind: "ship",
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
