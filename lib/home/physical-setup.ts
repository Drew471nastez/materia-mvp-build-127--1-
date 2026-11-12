import { tt } from "@/lib/i18n/text"
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
    { id: "fulfilment", label: tt("Choose how you fulfil orders"), line: tt("Yourself, a warehouse, print on demand, a supplier or a mix."), done: f.fulfilmentChosen, href: "/app/settings?tab=shipping" },
    { id: "location", label: tt("Add where your stock is"), line: tt("Your home, a shop or a warehouse: where orders ship from."), done: f.locations > 0, href: "/app/settings?tab=locations" },
    { id: "delivery", label: tt("Set how buyers get it"), line: f.rates === 0 && f.pickupLocations === 0 ? tt("A shipping rate for where you sell, or local pickup.") : tt("Shipping rates or local pickup are set."), done: f.rates > 0 || f.pickupLocations > 0, href: "/app/settings?tab=shipping" },
    { id: "product", label: tt("Add a physical product with stock"), line: f.physicalProducts > 0 && f.stockedProducts === 0 ? tt("Your product has no stock yet. Add some so buyers can order it.") : tt("Its photos, price, variants and how many you have."), done: f.stockedProducts > 0, href: f.physicalProducts > 0 ? "/app/inventory" : "/app/products/new?type=physical" },
    { id: "package", label: tt("Add the box you ship in"), line: tt("Its size and weight make shipping by weight and labels right."), done: f.packages > 0, href: "/app/settings?tab=shipping" },
  ]
}

/**
 * WHAT STILL STOPS A SALE, beside the five steps. Not a step of shipping, so
 * it is not counted in "N of 5", but while it is open the setup is not done:
 * a store with every shipping step ticked and no way to take payment cannot
 * sell anything, and the card says so first.
 */
export function physicalBlockers(f: PhysicalSetupFacts): PhysicalStep[] {
  return f.paymentsReady === false ? [{ id: "payments" as PhysicalStep["id"], label: tt("Set up payments to get paid"), line: tt("Buyers can't pay for anything until this is done."), done: false, href: "/app/payouts" }] : []
}

/**
 * WHETHER THE STORE HAS STARTED SELLING THINGS IT SHIPS (round AS). Physical
 * commerce being on for the platform is not a reason to show a creator who
 * sells only digital products a shipping checklist. The card appears once the
 * store itself has done something physical: made a physical product, chosen
 * how it fulfils, added a location (made by the physical product editor or
 * shipping onboarding, never at sign up), a shipping rate, local pickup or a
 * package. Read off the same facts the steps use, so it costs no extra query.
 */
export function physicalSetupStarted(f: PhysicalSetupFacts): boolean {
  return f.physicalProducts > 0 || f.fulfilmentChosen || f.locations > 0 || f.rates > 0 || f.pickupLocations > 0 || f.packages > 0
}

export function physicalSetupDone(f: PhysicalSetupFacts): boolean {
  return physicalSteps(f).every((s) => s.done) && physicalBlockers(f).length === 0
}
