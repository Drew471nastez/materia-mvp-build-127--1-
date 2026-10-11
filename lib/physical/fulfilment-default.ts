/**
 * ===========================================================================
 *  WHO SHIPS A PRODUCT: THE STORE'S ANSWER, UNLESS THE PRODUCT HAS ITS OWN
 * ===========================================================================
 * The store answers once, in Settings › Shipping › Locations ("How you fulfil
 * orders", commerce_settings.fulfillment_model, and its default location).
 * Every product follows that answer. Only a product that is fulfilled some
 * other way (one hoodie printed on demand in a shop that posts everything
 * else itself) sets its own, under Advanced in the product editor.
 *
 * Nothing new is stored. A product keeps `fulfillment_method` and
 * `fulfillment_location_id` as it always has, because checkout and the order
 * jobs read those (lib/physical/checkout-pricing-server.ts, jobs-server.ts).
 * "Follows the store" is a product whose pair is what the store's answer
 * gives today: the editor writes the store's pair when the product has no
 * answer of its own, and a change to the store's answer is carried to every
 * product that was following the old one (followNewDefault, run by
 * PUT /api/physical/settings).
 *
 * Pure: the editor, the settings route and tests read it the same way.
 */

import { METHODS } from "./fulfillment"
import type { FulfillmentMethod, FulfillmentModel, Location } from "./types"

/** The store's answer, as the method a product is fulfilled by. A mix ships itself unless a product says otherwise. */
export const MODEL_METHOD: Record<FulfillmentModel, FulfillmentMethod> = {
  self: "self",
  hybrid: "self",
  warehouse: "warehouse",
  third_party_logistics: "warehouse",
  print_on_demand: "print_on_demand",
  dropshipping: "dropship",
  supplier: "dropship",
}

export interface StoreFulfilment {
  method: FulfillmentMethod
  /** Null for "any of my locations" (the seller ships), or no partner set up yet. */
  locationId: string | null
}

type Loc = Pick<Location, "id" | "kind" | "active">

/**
 * What a product that follows the store is fulfilled by. The seller's own
 * shipping picks from any of their places (null), as before. A partner is
 * the store's default location when it is that kind of partner, else the
 * first active one of that kind, else none yet (the order is then marked for
 * the seller to pass on, as it always was).
 */
export function storeFulfilment(model: FulfillmentModel | null | undefined, defaultLocationId: string | null | undefined, locations: Loc[]): StoreFulfilment {
  const method = MODEL_METHOD[model ?? "self"] ?? "self"
  if (method === "self") return { method, locationId: null }
  const kinds = METHODS[method].locationKinds
  const fits = (l: Loc) => l.active && kinds.includes(l.kind)
  const preferred = locations.find((l) => l.id === defaultLocationId && fits(l))
  return { method, locationId: (preferred ?? locations.find(fits))?.id ?? null }
}

/**
 * Does a product with this pair follow the store's answer? The same method,
 * and the store's location or none: a partner product saved before its
 * partner was set up has none, and takes the store's partner once there is one.
 */
export function followsStore(product: { method: FulfillmentMethod | null | undefined; locationId: string | null | undefined }, store: StoreFulfilment): boolean {
  const at = product.locationId ?? null
  return (product.method ?? "self") === store.method && (at === null || at === store.locationId)
}

/** "You ship it", "Printed and shipped by Gelato": the store's answer in a few words, for the editor's Shipping card. */
export function fulfilmentSummary(f: StoreFulfilment, locations: Pick<Location, "id" | "name">[]): string {
  const name = f.locationId ? locations.find((l) => l.id === f.locationId)?.name ?? null : null
  switch (f.method) {
    case "warehouse":
      return name ? `Shipped by ${name}` : "Shipped by your fulfillment center"
    case "dropship":
      return name ? `Shipped by ${name}` : "Shipped by your supplier"
    case "print_on_demand":
      return name ? `Printed and shipped by ${name}` : "Printed and shipped by your print partner"
    default:
      return "You pack and ship it"
  }
}
