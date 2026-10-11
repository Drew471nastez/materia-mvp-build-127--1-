/**
 * Delivery and pickup on a product page, in words: the shape the server
 * reads (./storefront-facts.ts productDelivery) and the lines a product page
 * says. Pure, so the storefront's own blocks draw them in the browser.
 */
import { countryName } from "@/lib/checkout/countries"

/** A pickup point as the product page names it. */
export interface PickupPoint {
  name: string
  /** The town, for "Pickup available at Main Street, Lisbon". */
  city: string | null
  /** "Usually ready in 24 hours". */
  ready: string
}

export interface ProductDelivery {
  /** The cheapest delivery to the shop's home country for one of it, or null when none is set up there. */
  ship: { country: string; priceCents: number; estimate: string; freeFromCents: number | null } | null
  /** Pickup points, by variant id: those that hold that option (or never run out of it). Empty: no pickup. */
  pickup: Record<string, PickupPoint[]>
  /** The shop delivers it itself near one of its locations at home (Settings › Locations, local delivery). */
  local?: boolean
}

/** "Pickup available at Main Street, Lisbon": the first point, and how many more. */
export function pickupLine(points: PickupPoint[] | undefined): string | null {
  if (!points || points.length === 0) return null
  const first = points[0]
  const at = first.city ? `${first.name}, ${first.city}` : first.name
  return points.length === 1 ? `Pickup available at ${at}` : `Pickup available at ${at} and ${points.length - 1} more ${points.length === 2 ? "place" : "places"}`
}

/** "Delivery $4.99 to Portugal, 3 to 5 business days", or "Free delivery to Portugal, 2 business days": the buy box's words (./delivery-promise.ts deliveryPromiseLines). */
export function deliveryLine(ship: ProductDelivery["ship"], money: (cents: number) => string): string | null {
  if (!ship) return null
  const price = ship.priceCents === 0 ? "Free delivery" : `Delivery ${money(ship.priceCents)}`
  const place = ship.country ? countryName(ship.country) || ship.country : null
  return `${price}${place ? ` to ${place}` : ""}${ship.estimate ? `, ${ship.estimate}` : ""}`
}
