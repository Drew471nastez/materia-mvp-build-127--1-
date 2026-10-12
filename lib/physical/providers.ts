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
 *                 Printful, Printify, Gelato and CJ Dropshipping take each
 *                 paid order for their location and send tracking back
 *                 (lib/integrations/fulfilment/forward-server.ts).
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
  fields: ("api_key" | "url" | "email" | "webhook_secret")[]
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
  { id: "gelato", name: "Gelato", category: "print_on_demand", availability: "connect", description: "Each paid order for your Gelato location is sent to Gelato with the product and print file you matched, printed near your buyer, and its tracking comes back.", fields: ["api_key"], docsUrl: "https://dashboard.gelato.com/docs/", verifies: true },
  { id: "cj_dropshipping", name: "CJ Dropshipping", category: "dropshipping", availability: "connect", description: "Each paid order for your CJ location is sent to CJ with the CJ variants you matched, its tracking comes back, and CJ's stock can keep yours in step.", fields: ["api_key"], docsUrl: "https://developers.cjdropshipping.com/", verifies: true },
  { id: "shipstation", name: "ShipStation", category: "shipping", availability: "needs_setup", description: "Labels and live carrier rates. Not connected to Storelib yet.", fields: ["api_key"], docsUrl: "https://www.shipstation.com/docs/api/" },
  { id: "shippo", name: "Shippo", category: "shipping", availability: "needs_setup", description: "Labels and live carrier rates. Not connected to Storelib yet.", fields: ["api_key"], docsUrl: "https://docs.goshippo.com/", verifies: true },
  { id: "easypost", name: "EasyPost", category: "shipping", availability: "needs_setup", description: "Labels and live carrier rates. Not connected to Storelib yet.", fields: ["api_key"], docsUrl: "https://docs.easypost.com/", verifies: true },
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
