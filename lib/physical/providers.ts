/**
 * ===========================================================================
 *  WHO CAN FULFIL A SHOP'S ORDERS, AND WHAT IS LIVE TODAY
 * ===========================================================================
 * One list, read by the Integrations settings and by the job queue. Each
 * provider says plainly what it does now:
 *
 *   live          works today end to end: the merchant shipping it, an
 *                 email to a supplier with every order, a signed webhook to
 *                 the merchant's own system, a CSV export.
 *   connect       works once the seller connects it with their key:
 *                 Printful and Printify take each paid order for their
 *                 location and send tracking back
 *                 (lib/integrations/fulfilment/forward-server.ts); Shippo
 *                 and EasyPost sell labels on the order page, ShipStation
 *                 takes the orders the seller ships and sends tracking back
 *                 (lib/integrations/shipping).
 *   needs_setup   not built yet: shown as Coming soon with Tell me when
 *                 it's ready, never with a Connect button. A key saved
 *                 before can still be removed.
 *
 * Nothing here pretends to be connected.
 */

export type ProviderId =
  | "manual"
  | "supplier_email"
  | "custom_webhook"
  | "csv"
  | "printful"
  | "printify"
  | "gelato"
  | "cj_dropshipping"
  | "shipstation"
  | "shippo"
  | "easypost"

export type ProviderCategory = "fulfillment" | "print_on_demand" | "dropshipping" | "supplier" | "shipping"

export interface ProviderInfo {
  id: ProviderId
  name: string
  category: ProviderCategory
  availability: "live" | "connect" | "needs_setup"
  description: string
  /** What connecting asks for. */
  fields: ("api_key" | "api_secret" | "url" | "email" | "webhook_secret")[]
  docsUrl?: string
  /**
   * The provider's own logo, as a file in /public (e.g. "/integrations/shippo.svg"). Left out, the card draws the
   * provider's initial. Add the official file the provider publishes in its brand kit and name it here.
   */
  logo?: string
  /** True when saving the key asks the provider whether it is real (lib/physical/provider-verify.ts). */
  verifies?: boolean
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "manual", name: "Ship it yourself", category: "fulfillment", availability: "live", description: "Pack and ship orders yourself, then add tracking on the order.", fields: [] },
  { id: "supplier_email", name: "Supplier by email", category: "supplier", availability: "live", description: "Each paid order is emailed to the location's supplier with the items and the address. Add tracking when they reply.", fields: ["email"] },
  { id: "custom_webhook", name: "Your own system (webhook)", category: "fulfillment", availability: "live", description: "Each paid order is sent to your https address as JSON, signed with your secret (X-Storelib-Signature).", fields: ["url", "webhook_secret"] },
  { id: "csv", name: "CSV export", category: "fulfillment", availability: "live", description: "Download unfulfilled orders as a CSV for a warehouse or a spreadsheet.", fields: [] },
  { id: "printful", name: "Printful", category: "print_on_demand", availability: "connect", description: "Each paid order for your Printful location is sent to your Printful store by SKU, and its tracking comes back to your buyer.", fields: ["api_key"], docsUrl: "https://developers.printful.com/docs/", verifies: true },
  { id: "printify", name: "Printify", category: "print_on_demand", availability: "connect", description: "Each paid order for your Printify location is sent to your Printify shop by SKU, and its tracking comes back to your buyer.", fields: ["api_key"], docsUrl: "https://developers.printify.com/", verifies: true },
  { id: "gelato", name: "Gelato", category: "print_on_demand", availability: "needs_setup", description: "Print on demand, printed close to your buyer. Not connected to Storelib yet.", fields: ["api_key"], docsUrl: "https://dashboard.gelato.com/docs/", verifies: true },
  { id: "cj_dropshipping", name: "CJ Dropshipping", category: "dropshipping", availability: "needs_setup", description: "Dropshipping from CJ's catalogue. Not connected to Storelib yet.", fields: ["api_key"], docsUrl: "https://developers.cjdropshipping.com/" },
  /* Shipping apps (lib/integrations/shipping): labels from the order page with Shippo and EasyPost, whole orders out to ShipStation and its tracking back. */
  { id: "shipstation", name: "ShipStation", category: "shipping", availability: "connect", description: "Each paid order you ship goes to ShipStation. Print the label there and the tracking comes back to your buyer.", fields: ["api_key", "api_secret"], docsUrl: "https://www.shipstation.com/docs/api/", verifies: true },
  { id: "shippo", name: "Shippo", category: "shipping", availability: "connect", description: "Buy and print labels from the order page at Shippo's rates. The tracking number goes on the shipment.", fields: ["api_key"], docsUrl: "https://docs.goshippo.com/", verifies: true },
  { id: "easypost", name: "EasyPost", category: "shipping", availability: "connect", description: "Buy and print labels from the order page at EasyPost's rates. The tracking number goes on the shipment.", fields: ["api_key"], docsUrl: "https://docs.easypost.com/", verifies: true },
]

export function providerInfo(id: string): ProviderInfo | null {
  return PROVIDERS.find((p) => p.id === id) ?? null
}

export const CATEGORY_LABEL: Record<ProviderCategory, string> = {
  fulfillment: "Fulfillment",
  print_on_demand: "Print on demand",
  dropshipping: "Dropshipping",
  supplier: "Suppliers",
  shipping: "Shipping labels and rates",
}
