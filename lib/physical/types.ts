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

/**
 * How one product (or one variant of it) reaches the buyer. Stored per
 * product and, when a variant differs, per variant, so one shop can mix
 * them: a hoodie printed on demand next to stickers the seller posts.
 */
export const FULFILLMENT_METHODS = ["self", "warehouse", "dropship", "print_on_demand"] as const
export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number]

/** How long a pickup order usually takes to be ready (inventory_locations.pickup_ready). */
export const PICKUP_READY = ["1h", "2h", "4h", "24h", "2_4d", "5d"] as const
export type PickupReady = (typeof PICKUP_READY)[number]

export type UnitSystem = "metric" | "imperial"

export interface ProductOption {
  /** 1 to 3, the variant column it fills (option1..option3). */
  position: 1 | 2 | 3
  name: string
  values: string[]
  /** The seller's own swatch per value: "#rrggbb" or "photo" (lib/products/option-swatches.ts). Absent: none set. */
  swatches?: Record<string, string>
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
  /** Null: the product's own method. */
  fulfillmentMethod: FulfillmentMethod | null
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
  pickupEnabled: boolean
  pickupInstructions: string | null
  pickupReady: PickupReady
  /** Opening hours buyers can collect in, as the seller writes them ("Mon to Fri 9:00 to 17:00"). Part 154. */
  pickupHours?: string | null
  /** Delivering it yourself to nearby postal codes (./local-delivery.ts). Part 154; absent before it runs. */
  localDelivery?: LocalDelivery | null
  /**
   * The print on demand service this location sends its orders to (Printful, Printify), read from its
   * commerce_integrations row: `connected` only while that row says connected. Null for any other location.
   */
  partner?: LocationPartner | null
}

export interface LocationPartner {
  provider: string
  name: string
  connected: boolean
}

/**
 * LOCAL DELIVERY, as Shopify has it: the seller drives orders from this
 * location to buyers whose postal code starts with one of `codes`, in the
 * location's own country, for `priceCents` (free from `freeOverCents`),
 * when the order reaches `minOrderCents`.
 */
export interface LocalDelivery {
  enabled: boolean
  /** Upper case, spaces removed; each matches every postal code that starts with it ("400" covers 400001). */
  codes: string[]
  priceCents: number
  minOrderCents: number | null
  freeOverCents: number | null
  /** Shown at checkout and in the order emails ("We deliver Tuesdays and Fridays, 5pm to 8pm"). */
  note: string | null
}

/**
 * flat         one price
 * free         nothing (optionally only above an order value)
 * price        by order price: tiers of order value
 * weight       by order weight: tiers of the order's total weight
 * item_weight  by item weight: each item priced by its own weight, added up
 * quantity     by number of items (kept for rates made before tiers)
 * carrier      priced live by Shippo or EasyPost (lib/integrations/shipping/checkout-rates-server.ts)
 */
export type RateKind = "flat" | "free" | "weight" | "price" | "item_weight" | "quantity" | "carrier"

/** One step of a tiered rate: from this value (cents or grams) on, this price. */
export interface RateTier {
  from: number
  priceCents: number
}

export interface ShippingRate {
  id: string
  zoneId: string
  name: string
  kind: RateKind
  priceCents: number
  /** Grams for a weight rate, cents for a price rate, units for a quantity rate. */
  minValue: number | null
  maxValue: number | null
  /** Ascending by `from`; empty for flat and free rates and for rates made before tiers. */
  tiers: RateTier[]
  freeOverCents: number | null
  minDays: number | null
  maxDays: number | null
  active: boolean
  position: number
  /** A carrier calculated rate: the label app that prices it ("shippo", "easypost") and its service, empty for the cheapest. */
  carrier?: string | null
  serviceCode?: string | null
}

export interface ShippingZone {
  id: string
  profileId: string
  name: string
  countries: string[]
  /** "US-CA", "CA-ON": a state or province, when a zone covers part of a country. */
  regions: string[]
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
  /** Asked for only when Settings › Checkout asks for it. */
  company?: string | null
}

export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "cancelled" | "refunded" | "partially_refunded"
export type FulfillmentStatus = "unfulfilled" | "processing" | "partially_fulfilled" | "fulfilled" | "delivered" | "cancelled" | "not_required"
export type DeliveryMethod = "ship" | "pickup" | "none"
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
  /** What comes off the line, in cents: its upsells and bundles (lib/offers), then its code. */
  discountCents: number
  requiresShipping: boolean
  taxable: boolean
  weightGrams: number
  /** Where the line's stock is held and shipped from; null when it has no stock to hold. */
  locationId: string | null
  trackInventory: boolean
  inventoryPolicy: InventoryPolicy
  shippingProfileId: string | null
  fulfillmentMethod: FulfillmentMethod | null
  /** The cart line's properties (an engraving, a theme's `_sl_offer_id`): kept on the order line, never a price. */
  properties?: Record<string, string>
  /** The offers in `discountCents`, each with its part (lib/offers applyOffers lineOffers), kept on the order line. */
  offers?: { offerId: string; title: string; kind: string; savedCents: number; tier?: number }[]
}

export interface DeliveryOption {
  /** The rates chosen, one per shipping profile in the cart, joined: what the buyer picks is one option. A pickup is "pickup:<location id>", a local delivery "local:<location id>". */
  id: string
  kind?: "ship" | "pickup" | "local"
  /** For a pickup: where, and what the buyer should know. */
  pickup?: PickupInfo
  /** For a local delivery: the location the seller drives it from, and their note. */
  local?: { locationId: string; note: string | null }
  name: string
  priceCents: number
  minDays: number | null
  maxDays: number | null
  rateIds: string[]
}

/** A pickup point as the buyer sees it at checkout, on the order page and in emails. */
export interface PickupInfo {
  locationId: string
  name: string
  address: string[]
  instructions: string | null
  ready: PickupReady
  /** Opening hours, when the location gave them. */
  hours?: string | null
}
