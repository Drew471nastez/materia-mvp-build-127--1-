/**
 * What a fulfilment connector does for Storelib, whoever the provider is
 * (./printify.ts, ./printful.ts, ./gelato.ts, ./cj.ts). The job queue and the
 * webhook route only ever talk to this shape.
 */

export interface ConnectorCredential {
  key: string
  /** commerce_integrations.config: the shop or store the key works on, and the seller's choices. */
  config: Record<string, unknown>
  /**
   * Keeps a change to config on the integration's row (CJ's access token, refreshed while an order is sent).
   * Absent in a connect, where the row is written after; a connector then keeps the change in config itself.
   */
  persist?: (patch: Record<string, unknown>) => Promise<void>
}

/**
 * A Storelib variant matched by the seller to one of the provider's own (lib/integrations/fulfilment/links-server.ts):
 * a CJ variant id, or a Gelato product UID with the print file. Never guessed: made only on the seller's choice.
 */
export interface VariantLink {
  providerVariantId: string
  fileUrl: string | null
}

export interface ProviderAddress {
  name: string
  company?: string | null
  line1: string
  line2: string | null
  city: string
  /** A state or province: its code for the US, Canada and Australia, else as typed. */
  region: string | null
  postalCode: string | null
  country: string
  phone: string | null
  email: string | null
}

export interface ProviderOrderInput {
  /** externalIdOf(checkoutId): how the order is found again on the provider's side. */
  externalId: string
  /** The order's number as the buyer knows it, "#1042". */
  label: string
  address: ProviderAddress
  lines: { sku: string; quantity: number; title: string; lineId: string; variantId?: string | null; link?: VariantLink | null }[]
  /** Send it to be made straight away (true), or leave it as a draft for the seller to approve there (false). */
  autoConfirm: boolean
}

export interface ProviderShipment {
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  delivered: boolean
}

export type ProviderOrderStage = "draft" | "pending" | "in_production" | "partially_shipped" | "shipped" | "delivered" | "cancelled" | "problem"

export interface ProviderOrderState {
  providerOrderId: string
  externalId: string | null
  stage: ProviderOrderStage
  /** What is wrong, in the provider's words, when stage is problem. */
  problem: string | null
  shipments: ProviderShipment[]
}

export interface ConnectResult {
  /** The shop or store orders go to, kept in config. */
  config: Record<string, unknown>
  account: string | null
}

export interface FulfilmentConnector {
  id: "printify" | "printful" | "gelato" | "cj_dropshipping"
  name: string
  /**
   * How an item is told to the provider: "sku", the same SKU on both sides (Printful, Printify); "link", the
   * variant the seller matched it to in Storelib, the SKU only where the provider confirms it as its own (CJ,
   * Gelato). Never a guess either way.
   */
  matching?: "sku" | "link"
  /** The kind of location connecting makes, and whether it holds the provider's stock (CJ's, synced). */
  locationKind?: "print_on_demand" | "dropshipper"
  /** Reads only: which shop or store the key works on. Refuses a key the provider refuses. */
  connect(key: string): Promise<ConnectResult>
  /** note: what the seller still has to do there (CJ: an order made but not paid), said on the order's timeline. */
  submit(cred: ConnectorCredential, order: ProviderOrderInput): Promise<{ providerOrderId: string; stage: ProviderOrderStage; note?: string | null }>
  fetchOrder(cred: ConnectorCredential, providerOrderId: string): Promise<ProviderOrderState>
  /** Ask the provider to tell Storelib when a parcel ships. False (with why) when it can't, and tracking is then checked on a timer. */
  registerWebhooks(cred: ConnectorCredential, url: string, secret: string): Promise<{ ok: boolean; note: string | null; ids?: string[] }>
  removeWebhooks(cred: ConnectorCredential, url: string): Promise<void>
}
