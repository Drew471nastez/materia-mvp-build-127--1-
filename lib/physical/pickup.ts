/**
 * ===========================================================================
 *  LOCAL PICKUP: COLLECTING AN ORDER INSTEAD OF HAVING IT SHIPPED
 * ===========================================================================
 * A location with pickup on (Settings > Shipping > Locations and pickup) is
 * offered at checkout next to the shipping rates, for nothing, when it can
 * hand over everything in the cart that would otherwise be shipped:
 *
 *   - every such item is one the seller ships themselves (a print on demand
 *     or dropshipped item never passes through the seller's hands), and
 *   - every item whose stock is tracked, and that may not be oversold, has
 *     enough available at that location.
 *
 * Pure: the server passes the stock it read, and quotes it again when the
 * buyer pays.
 */

import { addressLines } from "./address"
import type { DeliveryOption, FulfillmentMethod, InventoryPolicy, Location, PickupInfo, PickupReady } from "./types"

export const PICKUP_READY_LABEL: Record<PickupReady, string> = {
  "1h": "Usually ready in 1 hour",
  "2h": "Usually ready in 2 hours",
  "4h": "Usually ready in 4 hours",
  "24h": "Usually ready in 24 hours",
  "2_4d": "Usually ready in 2 to 4 days",
  "5d": "Usually ready in 5 or more days",
}

/** The short form, for a picker. */
export const PICKUP_READY_SHORT: Record<PickupReady, string> = {
  "1h": "1 hour",
  "2h": "2 hours",
  "4h": "4 hours",
  "24h": "24 hours",
  "2_4d": "2 to 4 days",
  "5d": "5 or more days",
}

export interface PickupLine {
  variantId: string | null
  quantity: number
  requiresShipping: boolean
  trackInventory: boolean
  inventoryPolicy: InventoryPolicy
  fulfillmentMethod: FulfillmentMethod | null
}

export function pickupInfo(l: Location): PickupInfo {
  return {
    locationId: l.id,
    name: l.name,
    address: addressLines({ line1: l.addressLine1 ?? "", line2: l.addressLine2, city: l.city ?? "", region: l.region, postalCode: l.postalCode, country: l.country ?? "" }),
    instructions: l.pickupInstructions,
    ready: l.pickupReady,
  }
}

/** Can this location hand over every item that would be shipped? */
export function canPickUp(location: Location, lines: PickupLine[], available: (variantId: string, locationId: string) => number): boolean {
  if (!location.pickupEnabled || !location.active || !location.fulfillsOrders) return false
  const handed = lines.filter((l) => l.requiresShipping && l.quantity > 0)
  if (handed.length === 0) return false
  return handed.every((l) => {
    if ((l.fulfillmentMethod ?? "self") !== "self") return false
    if (!l.trackInventory || l.inventoryPolicy === "continue") return true
    return !!l.variantId && available(l.variantId, location.id) >= l.quantity
  })
}

export function pickupOptions(locations: Location[], lines: PickupLine[], available: (variantId: string, locationId: string) => number): DeliveryOption[] {
  return locations
    .filter((l) => canPickUp(l, lines, available))
    .map((l) => ({
      id: `pickup:${l.id}`,
      kind: "pickup" as const,
      name: `Pick up at ${l.name}`,
      priceCents: 0,
      minDays: null,
      maxDays: null,
      rateIds: [],
      pickup: pickupInfo(l),
    }))
}

export function isPickupOptionId(id: unknown): id is string {
  return typeof id === "string" && /^pickup:[0-9a-f-]{36}$/i.test(id)
}
