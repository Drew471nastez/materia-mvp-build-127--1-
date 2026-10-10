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
  /** Whether a buyer can pay this store today (lib/payments/service). Null when it could not be read: then nothing is claimed either way. */
  paymentsReady?: boolean | null
}

export interface PhysicalStep {
  id: "fulfilment" | "location" | "delivery" | "product" | "package" | "payments"
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

/**
 * WHAT STILL STOPS A SALE, beside the five steps. Not a step of shipping, so
 * it is not counted in "N of 5", but while it is open the setup is not done:
 * a store with every shipping step ticked and no way to take payment cannot
 * sell anything, and the card says so first.
 */
export function physicalBlockers(f: PhysicalSetupFacts): PhysicalStep[] {
  return f.paymentsReady === false ? [{ id: "payments" as PhysicalStep["id"], label: "Set up payments to get paid", line: "Buyers can't pay for anything until this is done.", done: false, href: "/app/payouts" }] : []
}

export function physicalSetupDone(f: PhysicalSetupFacts): boolean {
  return physicalSteps(f).every((s) => s.done) && physicalBlockers(f).length === 0
}
