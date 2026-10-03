/**
 * ===========================================================================
 *  PHYSICAL COMMERCE: THE SHAPES EVERY PART AGREES ON
 * ===========================================================================
 * Plain types, safe on the server and in the browser. The database is part
 * 78 (supabase/sql/run-now/78_physical_commerce.sql); these are what the
 * app passes around after reading it. Money is integer cents, weight is
 * grams, lengths are millimetres: units are only for display (./units.ts).
 */

export const LOCATION_KINDS = [
  "home",
  "warehouse",
  "print_on_demand",
  "dropshipper",
  "supplier",
  "third_party_logistics",
  "retail",
  "custom",
] as const
export type LocationKind = (typeof LOCATION_KINDS)[number]

/** The seven ways a shop fulfils, asked once (commerce_settings.fulfillment_model). */
export const FULFILLMENT_MODELS = ["self", "warehouse", "print_on_demand", "dropshipping", "supplier", "third_party_logistics", "hybrid"] as const
export type FulfillmentModel = (typeof FULFILLMENT_MODELS)[number]

export type InventoryPolicy = "deny" | "continue"

export interface ProductOption {
  /** 1 to 3, the variant column it fills (option1..option3). */
  position: 1 | 2 | 3
  name: string
  values: string[]
}

export interface PhysicalVariant {
  id: string
  productId: string
  /** "M / Black": the option values joined, or the product's own name for a single variant. */
  name: string
  options: [string | null, string | null, string | null]
  priceCents: number
  compareAtCents: number | null
  costCents: number | null
  sku: string | null
  barcode: string | null
  weightGrams: number | null
  imageUrl: string | null
  trackInventory: boolean
  inventoryPolicy: InventoryPolicy
  requiresShipping: boolean
  taxable: boolean
  active: boolean
  fulfillmentLocationId: string | null
  position: number
}

export interface InventoryLevel {
  variantId: string
  locationId: string
  onHand: number
  committed: number
  incoming: number
  available: number
}

export interface Location {
  id: string
  name: string
  kind: LocationKind
  country: string | null
  city: string | null
  addressLine1: string | null
  addressLine2: string | null
  region: string | null
  postalCode: string | null
  phone: string | null
  email: string | null
  active: boolean
  fulfillsOrders: boolean
  holdsInventory: boolean
  priority: number
  forwarding: "none" | "email" | "webhook" | "provider"
}

export type RateKind = "flat" | "free" | "weight" | "price" | "quantity" | "carrier"

export interface ShippingRate {
  id: string
  zoneId: string
  name: string
  kind: RateKind
  priceCents: number
  /** Grams for a weight rate, cents for a price rate, units for a quantity rate. */
  minValue: number | null
  maxValue: number | null
  freeOverCents: number | null
  minDays: number | null
  maxDays: number | null
  active: boolean
  position: number
}

export interface ShippingZone {
  id: string
  profileId: string
  name: string
  countries: string[]
  restOfWorld: boolean
  rates: ShippingRate[]
}

export interface ShippingProfile {
  id: string
  name: string
  isDefault: boolean
  zones: ShippingZone[]
}

export interface Address {
  name: string
  line1: string
  line2: string | null
  city: string
  region: string | null
  postalCode: string | null
  country: string
  phone: string | null
}

export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "cancelled" | "refunded" | "partially_refunded"
export type FulfillmentStatus = "unfulfilled" | "partially_fulfilled" | "fulfilled" | "cancelled" | "not_required"
export type ReturnStatus = "none" | "requested" | "in_progress" | "partially_returned" | "returned"
export type ShipmentStatus = "pending" | "submitted" | "shipped" | "in_transit" | "out_for_delivery" | "delivered" | "failed" | "cancelled"

/** One priced line of a physical or mixed checkout, as the server worked it out. */
export interface PricedLine {
  productId: string
  variantId: string | null
  title: string
  variantName: string | null
  sku: string | null
  imageUrl: string | null
  type: string
  quantity: number
  unitCents: number
  /** The line's code discount, already in cents. */
  discountCents: number
  requiresShipping: boolean
  taxable: boolean
  weightGrams: number
  /** Where the line's stock is held and shipped from; null when it has no stock to hold. */
  locationId: string | null
  trackInventory: boolean
  inventoryPolicy: InventoryPolicy
  shippingProfileId: string | null
}

export interface DeliveryOption {
  /** The rates chosen, one per shipping profile in the cart, joined: what the buyer picks is one option. */
  id: string
  name: string
  priceCents: number
  minDays: number | null
  maxDays: number | null
  rateIds: string[]
}
