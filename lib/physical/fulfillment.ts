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
 *   self             the seller packs and ships, then adds tracking
 *   warehouse        a warehouse or 3PL holds the stock and ships
 *   dropship         a supplier ships straight to the buyer
 *   print_on_demand  each item is printed and shipped for the seller
 *
 * WHAT HAPPENS TODAY. Self fulfilment is complete. For the other three, the
 * product points at a partner location (Settings > Shipping > Locations):
 * when that location forwards orders by email or to a webhook, every paid
 * order is sent there automatically (lib/physical/jobs-server.ts); with no
 * forwarding set, the order is marked for the seller to pass on. Direct
 * connections to Printful, Printify, Gelato, CJ, ShipStation, Shippo and
 * EasyPost are not live yet and say so; a connector implements
 * FulfillmentConnector below and nothing about products or orders changes.
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
    line: "You pack each order and send it, then add the tracking.",
    locationKinds: ["home", "warehouse", "retail", "custom"],
    afterSale: "Open the order, pack it, press Mark as shipped and add the tracking number.",
  },
  warehouse: {
    id: "warehouse",
    title: "Fulfillment warehouse / 3PL",
    line: "A warehouse holds your stock and ships for you.",
    locationKinds: ["third_party_logistics", "warehouse"],
    afterSale: "The order is sent to your warehouse by email or webhook. Add their tracking when they ship it.",
  },
  dropship: {
    id: "dropship",
    title: "Dropshipping supplier",
    line: "Your supplier ships straight to the buyer.",
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

/**
 * What a direct connection to a fulfilment service implements. A connector
 * receives a paid order's lines that it fulfils, sends them, and later
 * reports shipments; the order, its lines and its shipments are the same
 * rows whoever ships them. No connector is live yet: lib/physical/providers.ts
 * lists them as "not available yet" and nothing is sent to them.
 */
export interface FulfillmentConnector {
  provider: string
  method: Exclude<FulfillmentMethod, "self">
  /** Sends the lines; returns the service's reference for the shipment, or a reason it could not. */
  submit(order: {
    checkoutId: string
    lines: { orderId: string; sku: string | null; title: string; variantName: string | null; quantity: number }[]
    address: Record<string, unknown> | null
  }): Promise<{ ok: true; reference: string } | { ok: false; error: string }>
  /** Tracking for a reference, when the service has it. */
  tracking?(reference: string): Promise<{ carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: string } | null>
}
