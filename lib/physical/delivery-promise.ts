/**
 * ===========================================================================
 *  WHAT A PRODUCT PAGE SAYS ABOUT DELIVERY
 * ===========================================================================
 * The few words under the Buy button: what shipping costs to the buyer's
 * country and how long it takes, from when shipping is free, and where it
 * can be picked up or delivered locally. From the shop's own rates, with
 * the one rule the checkout prices by (./rates.ts ratePrice), for one of
 * this product, so the page and the checkout never disagree. Nothing is
 * promised that the rates don't say: no rate there, and the page says it
 * doesn't ship there yet.
 *
 * Pure: the storefront product route (app/api/physical/storefront/product)
 * reads the rows and passes them in; a website's product section can call
 * deliveryPromiseLines with the same answer.
 */

import { countryName } from "@/lib/checkout/countries"
import { PICKUP_READY_LABEL } from "./pickup"
import { deliveryEstimate, ratePrice, zoneFor } from "./rates"
import type { Location, ShippingProfile } from "./types"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"

export interface DeliveryPromise {
  /** The country quoted for: the buyer's, as their browser says, else the shop's own. */
  country: string | null
  /** Shipping there: the cheapest rate for one of this product, and its estimate. Null when nothing ships there. */
  shipping: { priceCents: number; estimate: string | null; name: string } | null
  /** The order value from which shipping there is free, when a rate says so. */
  freeOverCents: number | null
  /** Places the buyer can collect it. */
  pickups: { name: string; ready: string; hours: string | null }[]
  /** The shop delivers it itself near one of its locations in this country. */
  localDelivery: boolean
}

export function deliveryPromise(input: {
  profiles: ShippingProfile[]
  /** The product's own shipping profile; null or one that is gone: the general one. */
  profileId: string | null
  country: string | null
  priceCents: number
  weightGrams: number
  locations: Location[]
  /** Who ships it: pickup and local delivery are only for what the shop hands over itself. */
  shipsItself: boolean
}): DeliveryPromise {
  const country = input.country ? input.country.toUpperCase() : null
  const profile = input.profiles.find((p) => p.id === input.profileId) ?? input.profiles.find((p) => p.isDefault) ?? input.profiles[0] ?? null
  let shipping: DeliveryPromise["shipping"] = null
  let freeOverCents: number | null = null
  if (profile && country) {
    const zone = zoneFor(profile, country)
    const totals = { units: 1, cents: input.priceCents, grams: Math.max(0, input.weightGrams), items: [{ grams: Math.max(0, input.weightGrams), quantity: 1 }] }
    const priced = (zone?.rates ?? [])
      .map((rate) => ({ rate, price: ratePrice(rate, totals) }))
      .filter((r): r is { rate: (typeof r)["rate"]; price: number } => r.price !== null)
      .sort((a, b) => a.price - b.price || a.rate.position - b.rate.position)
    const best = priced[0]
    if (best) shipping = { priceCents: best.price, estimate: deliveryEstimate(best.rate) || null, name: best.rate.name }
    for (const r of zone?.rates ?? []) {
      if (!r.active) continue
      const at = r.kind === "free" ? (r.minValue ?? 0) : r.freeOverCents && r.freeOverCents > 0 ? r.freeOverCents : r.kind === "price" ? ([...r.tiers].sort((a, b) => a.from - b.from).find((t) => t.priceCents === 0)?.from ?? null) : null
      if (at !== null && at > 0 && (freeOverCents === null || at < freeOverCents)) freeOverCents = at
    }
    if (shipping?.priceCents === 0) freeOverCents = null
  }
  const own = input.locations.filter((l) => l.active && l.fulfillsOrders)
  const pickups = input.shipsItself ? own.filter((l) => l.pickupEnabled && (!country || (l.country ?? "").toUpperCase() === country)).map((l) => ({ name: l.name, ready: PICKUP_READY_LABEL[l.pickupReady], hours: l.pickupHours ?? null })) : []
  const localDelivery = input.shipsItself && !!country && own.some((l) => l.localDelivery?.enabled && (l.country ?? "").toUpperCase() === country)
  return { country, shipping, freeOverCents, pickups, localDelivery }
}

/** The promise in lines a product page prints, plain and short, its amounts in the store's own currency. */
export function deliveryPromiseLines(p: DeliveryPromise, currency: string = SHOP_CURRENCY): string[] {
  const money = (cents: number) => shopMoneyIn(cents, currency)
  const place = p.country ? countryName(p.country) || p.country : null
  const lines: string[] = []
  if (p.shipping) {
    const cost = p.shipping.priceCents === 0 ? "Free delivery" : `Delivery ${money(p.shipping.priceCents)}`
    lines.push(`${cost}${place ? ` to ${place}` : ""}${p.shipping.estimate ? `, ${p.shipping.estimate}` : ""}`)
  } else if (place && !p.localDelivery && p.pickups.length === 0) lines.push(`Doesn't ship to ${place} yet`)
  if (p.freeOverCents) lines.push(`Free delivery on orders over ${money(p.freeOverCents)}`)
  if (p.localDelivery) lines.push("Local delivery available near the shop")
  if (p.pickups.length === 1) lines.push(`Free pickup at ${p.pickups[0].name}. ${p.pickups[0].ready}`)
  else if (p.pickups.length > 1) lines.push(`Free pickup at ${p.pickups.length} places`)
  return lines
}
