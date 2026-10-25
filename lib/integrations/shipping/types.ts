/**
 * What a label service does for Storelib, whoever it is (./shippo.ts,
 * ./easypost.ts). The order page's Buy a label (./labels-server.ts) and the
 * checkout's carrier calculated rates (./checkout-rates-server.ts) only ever
 * talk to this shape. ShipStation is not one: it takes whole orders and
 * prints its labels itself (./shipstation.ts).
 */

export type LabelProviderId = "shippo" | "easypost"

export interface LabelAddress {
  name: string
  company?: string | null
  line1: string
  line2?: string | null
  city: string
  /** A state or province code where the country has them (US-CA is "CA"), else as typed. */
  region: string | null
  postalCode: string | null
  /** ISO 3166-1 alpha-2, upper case. */
  country: string
  phone?: string | null
  email?: string | null
}

/** The parcel as the carrier prices it: centimetres and grams, the package's own weight included. */
export interface Parcel {
  lengthCm: number
  widthCm: number
  heightCm: number
  grams: number
}

export interface LabelRate {
  /** The provider's id for this rate: Shippo's rate object_id, EasyPost's rate id. */
  id: string
  /** The provider's shipment the rate belongs to, which a purchase is checked against. */
  shipmentId: string
  /** "USPS", "UPS", as the provider writes it. */
  carrier: string
  /** "Priority Mail", "Ground". */
  service: string
  /** The provider's service code ("usps_priority", "Priority"), for a carrier calculated rate at checkout. */
  serviceCode: string | null
  /** What the label costs the seller, in the currency's minor units. */
  cents: number
  currency: string
  days: number | null
}

export interface AddressCheck {
  /** False when the provider says the address can't be delivered to as written. */
  ok: boolean
  /** The provider's words, at most a few. */
  messages: string[]
}

export interface LabelPurchase {
  /** Shippo's transaction object_id, EasyPost's shipment id. What voiding a label names. */
  labelId: string
  shipmentId: string
  carrier: string
  service: string
  trackingNumber: string | null
  trackingUrl: string | null
  /** A PDF, at the provider's https address. */
  labelUrl: string
  cents: number
  currency: string
}

export type VoidOutcome = "voided" | "pending" | "rejected"

export interface LabelApi {
  id: LabelProviderId
  name: string
  /** True for the provider's test keys: labels are free and never shipped. */
  isTestKey(key: string): boolean
  checkAddress(key: string, address: LabelAddress): Promise<AddressCheck>
  /** A shipment at the provider for this parcel, and the rates it offers. `reference` is written on it so a purchase can be checked against the order. */
  rates(key: string, input: { from: LabelAddress; to: LabelAddress; parcel: Parcel; reference: string }): Promise<{ shipmentId: string; rates: LabelRate[]; messages: string[] }>
  /** One rate, read back from the provider: what a purchase is priced at, never what the browser said. */
  readRate(key: string, shipmentId: string, rateId: string): Promise<(LabelRate & { reference: string | null }) | null>
  buy(key: string, rate: LabelRate): Promise<LabelPurchase>
  voidLabel(key: string, purchase: { labelId: string; shipmentId: string }): Promise<VoidOutcome>
}

/** What the buyer chose and paid for at checkout, as the label dialog reads it (labels-server buyerPaidRate). */
export interface BuyerPaid {
  name: string
  cents: number
  price: string
  /** The app a Carrier calculated rate was priced by at checkout; null for the seller's own rates (flat, by weight). */
  provider: LabelProviderId | null
  serviceCode: string | null
}

/**
 * Of the rates a label app quoted, the one standing for what the buyer paid for: the service the zone rate named,
 * else, for a carrier calculated rate with none named, the cheapest (as checkout priced it). Null when the order's
 * rate was the seller's own (flat, by weight), or quoted by the other app: the seller picks.
 */
export function rateForPaid(paid: Pick<BuyerPaid, "provider" | "serviceCode"> | null | undefined, provider: string, rates: Pick<LabelRate, "id" | "cents" | "service" | "serviceCode">[]): string | null {
  if (!paid?.provider || paid.provider !== provider || rates.length === 0) return null
  const want = (paid.serviceCode ?? "").toLowerCase()
  const list = want ? rates.filter((r) => (r.serviceCode ?? "").toLowerCase() === want || r.service.toLowerCase() === want) : rates
  return [...list].sort((a, b) => a.cents - b.cents)[0]?.id ?? null
}
