/**
 * ===========================================================================
 *  HOW A PRODUCT IS FULFILLED, AND WHO DOES IT
 * ===========================================================================
 * Asked once per product, in plain words ("How will this product be
 * fulfilled?"), and per variant only when one differs. Stored on the
 * product (products.fulfillment_method), the variant
 * (product_variants.fulfillment_method, empty means "as the product") and,
 * when it sells, on the order line (orders.fulfillment_method), so an order
 * that mixes methods can be split into shipments by who sends each part.
 *
 *   self             the seller packs and ships, from home, a shop or their
 *                    own warehouse, then adds tracking
 *   warehouse        a fulfillment center (3PL) holds the stock and ships
 *   dropship         a dropshipping supplier or a manufacturer ships
 *                    straight to the buyer
 *   print_on_demand  each item is printed and shipped for the seller
 *
 * Together with the store's answer in Settings (fulfillment_model: self,
 * warehouse, print on demand, dropshipping, supplier, 3PL or a mix), that
 * covers every way a store sends things: a mix is a product, or a variant,
 * at a time.
 *
 * WHAT HAPPENS TODAY. Self fulfilment is complete. For the other three, the
 * product points at a partner location (Settings > Shipping > Locations):
 * when that location forwards orders by email or to a webhook, every paid
 * order is sent there automatically (lib/physical/jobs-server.ts); with no
 * forwarding set, the order is marked for the seller to pass on. Printful,
 * Printify, Gelato and CJ connect directly and are sent orders and report
 * tracking back (lib/integrations/fulfilment); ShipStation receives orders,
 * and Shippo and EasyPost buy labels (lib/integrations/shipping). Those two
 * folders hold the contracts a new service implements.
 */

import type { FulfillmentMethod, LocationKind } from "./types"

export interface MethodInfo {
  id: FulfillmentMethod
  /** The answer as the seller reads it. */
  title: string
  line: string
  /** The kinds of location that do this kind of fulfilment. */
  locationKinds: LocationKind[]
  /** What the seller does after a sale. */
  afterSale: string
}

export const METHODS: Record<FulfillmentMethod, MethodInfo> = {
  self: {
    id: "self",
    title: "I'll ship it myself",
    line: "From home, a shop or your own warehouse. You pack it and add the tracking.",
    locationKinds: ["home", "warehouse", "retail", "custom"],
    afterSale: "Open the order, pack it, press Fulfill items and add the tracking number.",
  },
  warehouse: {
    id: "warehouse",
    title: "A fulfillment center (3PL)",
    line: "They store your stock, pack and ship it for you.",
    locationKinds: ["third_party_logistics", "warehouse"],
    afterSale: "The order is sent to your warehouse by email or webhook. Add their tracking when they ship it.",
  },
  dropship: {
    id: "dropship",
    title: "A supplier or manufacturer",
    line: "Dropshipping, or made to order: they ship straight to the buyer.",
    locationKinds: ["dropshipper", "supplier"],
    afterSale: "The order is emailed to your supplier with the address. Add their tracking when they ship it.",
  },
  print_on_demand: {
    id: "print_on_demand",
    title: "Print on demand",
    line: "Each item is printed and shipped after it sells.",
    locationKinds: ["print_on_demand"],
    afterSale: "The order is sent to your print partner. Add their tracking when they ship it.",
  },
}

export const METHOD_ORDER: FulfillmentMethod[] = ["self", "warehouse", "dropship", "print_on_demand"]

export function readMethod(value: unknown): FulfillmentMethod | null {
  return typeof value === "string" && (METHOD_ORDER as string[]).includes(value) ? (value as FulfillmentMethod) : null
}

/** A variant's own method, else its product's, else the seller ships it. */
export function methodOf(variant: FulfillmentMethod | null | undefined, product: FulfillmentMethod | null | undefined): FulfillmentMethod {
  return variant ?? product ?? "self"
}

/** Who sends a shipment, in the words the order page uses. */
export function shippedByLabel(method: FulfillmentMethod | null | undefined, locationName?: string | null): string {
  switch (method ?? "self") {
    case "warehouse":
      return locationName ? `Shipped by ${locationName}` : "Shipped by your warehouse"
    case "dropship":
      return locationName ? `Shipped by ${locationName}` : "Shipped by your supplier"
    case "print_on_demand":
      return locationName ? `Printed and shipped by ${locationName}` : "Printed and shipped by your print partner"
    default:
      return "Shipped by you"
  }
}

export type Forwarding = "none" | "email" | "webhook" | "provider"

/**
 * WHAT THE SELLER DOES NEXT WITH A NEW ORDER, in a sentence or two, by who
 * ships each part (the store's answer to "How you fulfil orders", carried
 * to each product and line) and how that place gets its orders (the
 * location's "Who ships the orders?"). For the seller's new order email and
 * the order page; lib/physical/orders-server.ts sellerNextStepFor reads an
 * order into it.
 */
export function sellerNextStep(o: { pickup?: boolean; local?: boolean; pickupAt?: string | null; groups: { method: FulfillmentMethod; locationName: string | null; forwarding: Forwarding | null }[] }): string {
  if (o.pickup) return `The buyer collects it${o.pickupAt ? ` at ${o.pickupAt}` : ""}. Pack it, then press Mark ready for pickup in Orders and they're emailed.`
  if (o.local) return "You deliver this order yourself. Press Fulfill items when it leaves, then Mark as delivered when it's handed over."
  const out: string[] = []
  const seen = new Set<string>()
  for (const g of o.groups) {
    const key = `${g.method}:${g.locationName ?? ""}:${g.forwarding ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    const who = g.locationName ?? (g.method === "print_on_demand" ? "your print partner" : g.method === "warehouse" ? "your fulfillment center" : "your supplier")
    if (g.method === "self" || g.forwarding === null) {
      if (g.method === "self") out.push(`Pack it${g.locationName ? ` at ${g.locationName}` : ""} and ship it, then press Fulfill items in Orders and add the tracking number.`)
      else out.push(`Send this order to ${who} yourself, then add their tracking in Orders.`)
    } else if (g.forwarding === "email") out.push(`${who[0].toUpperCase()}${who.slice(1)} was emailed this order with the address. Add their tracking in Orders when they ship it, or they add it from the email.`)
    else if (g.forwarding === "webhook") out.push(`This order was sent to your own system for ${who}. Tracking it reports comes back to the order.`)
    else if (g.forwarding === "provider") out.push(`${who[0].toUpperCase()}${who.slice(1)} isn't connected to Storelib yet: send them this order yourself, then add their tracking in Orders.`)
    else out.push(`Pack it${g.locationName ? ` at ${g.locationName}` : ""} and ship it, then press Fulfill items in Orders and add the tracking number.`)
  }
  return out.join(" ") || "Open the order in Orders to fulfil it."
}
