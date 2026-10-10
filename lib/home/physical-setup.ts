/**
 * ===========================================================================
 *  SETTING UP TO SELL PHYSICAL PRODUCTS: THE STEPS, IN ORDER
 * ===========================================================================
 * Home's "Selling physical products" card, while physical commerce is on in
 * /admin, until every step is done. Each is read off the store, never ticked
 * by hand, and each says where it is done:
 *
 *   fulfilment   how orders are sent is answered (Settings › Shipping)
 *   location     a place stock is kept or orders ship from
 *   delivery     a way to get it to the buyer: a shipping rate in a zone,
 *                or local pickup at a location
 *   product      a physical product with stock to sell (or one that keeps
 *                selling when it runs out)
 *   package      the box or mailer it ships in, for weights and labels
 *
 * Pure: the reads are lib/home/physical-setup-server.ts.
 */

export interface PhysicalSetupFacts {
  fulfilmentChosen: boolean
  locations: number
  rates: number
  pickupLocations: number
  physicalProducts: number
  stockedProducts: number
  packages: number
}

export interface PhysicalStep {
  id: "fulfilment" | "location" | "delivery" | "product" | "package"
  label: string
  line: string
  done: boolean
  href: string
}

export function physicalSteps(f: PhysicalSetupFacts): PhysicalStep[] {
  return [
    { id: "fulfilment", label: "Choose how you fulfil orders", line: "Yourself, a warehouse, print on demand, a supplier or a mix.", done: f.fulfilmentChosen, href: "/app/settings?tab=shipping" },
    { id: "location", label: "Add where your stock is", line: "Your home, a shop or a warehouse: where orders ship from.", done: f.locations > 0, href: "/app/settings?tab=locations" },
    { id: "delivery", label: "Set how buyers get it", line: f.rates === 0 && f.pickupLocations === 0 ? "A shipping rate for where you sell, or local pickup." : "Shipping rates or local pickup are set.", done: f.rates > 0 || f.pickupLocations > 0, href: "/app/settings?tab=shipping" },
    { id: "product", label: "Add a physical product with stock", line: f.physicalProducts > 0 && f.stockedProducts === 0 ? "Your product has no stock yet. Add some so buyers can order it." : "Its photos, price, variants and how many you have.", done: f.stockedProducts > 0, href: f.physicalProducts > 0 ? "/app/inventory" : "/app/products/new?type=physical" },
    { id: "package", label: "Add the box you ship in", line: "Its size and weight make shipping by weight and labels right.", done: f.packages > 0, href: "/app/settings?tab=shipping" },
  ]
}

export function physicalSetupDone(f: PhysicalSetupFacts): boolean {
  return physicalSteps(f).every((s) => s.done)
}
