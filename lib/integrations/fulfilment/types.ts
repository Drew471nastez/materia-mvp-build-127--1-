/**
 * What a fulfilment connector does for Storelib, whoever the provider is
 * (./printify.ts, ./printful.ts). The job queue and the webhook route only
 * ever talk to this shape.
 */

export interface ConnectorCredential {
  key: string
  /** commerce_integrations.config: the shop or store the key works on, and the seller's choices. */
  config: Record<string, unknown>
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
  lines: { sku: string; quantity: number; title: string; lineId: string }[]
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
  id: "printify" | "printful"
  name: string
  /** Reads only: which shop or store the key works on. Refuses a key the provider refuses. */
  connect(key: string): Promise<ConnectResult>
  submit(cred: ConnectorCredential, order: ProviderOrderInput): Promise<{ providerOrderId: string; stage: ProviderOrderStage }>
  fetchOrder(cred: ConnectorCredential, providerOrderId: string): Promise<ProviderOrderState>
  /** Ask the provider to tell Storelib when a parcel ships. False (with why) when it can't, and tracking is then checked on a timer. */
  registerWebhooks(cred: ConnectorCredential, url: string, secret: string): Promise<{ ok: boolean; note: string | null; ids?: string[] }>
  removeWebhooks(cred: ConnectorCredential, url: string): Promise<void>
}
