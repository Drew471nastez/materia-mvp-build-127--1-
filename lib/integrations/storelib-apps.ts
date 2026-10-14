/**
 * ===========================================================================
 *  STORELIB'S OWN APPS, AND THE ESSENTIALS
 * ===========================================================================
 * "Add some more Storelib built-in integrations, like a little interesting
 * app catalog." Every app here is a feature Storelib already has, shown in
 * the integrations directory as a card that goes straight to where it is set
 * up, with its state read off the store (GET /api/store/integrations/apps,
 * lib/integrations/storelib-apps-server.ts). Nothing here is a feature that
 * isn't built: each `href` is a real page and each state a real read.
 *
 * Storelib Reviews and Courier tracking stay in lib/integrations/catalog.ts,
 * because they have pages of their own there; they are listed here by id so
 * the Storelib apps pill and the Essentials hold them too.
 *
 * ESSENTIALS: the short list that gets a store from nothing to selling,
 * pinned first in the directory with "N of M set up". Each item is done by
 * the same state its card shows.
 *
 * Pure: no I/O, safe in the browser and in tests.
 */

/** On, Off (a switch the store turned off), Set up (nothing there yet). Unknown when a read failed: no badge, never a guess. */
export type AppState = "on" | "off" | "setup"

export interface StorelibApp {
  id: string
  name: string
  /** One line for the card. */
  summary: string
  /** Where it is set up. The apps route can point it somewhere more exact (the live website's editor). */
  href: string
  /** Only while physical commerce is on. */
  physical: boolean
  /**
   * Part of Storelib itself (payments, shipping, taxes...), not an app a
   * store adds: kept for the Essentials checklist, never listed as an
   * integration ("why are payments an integration? it doesn't make sense").
   */
  core?: boolean
}

export const STORELIB_APPS: StorelibApp[] = [
  { id: "storelib-payments", core: true, name: "Payments", summary: "Take cards, Apple Pay and Google Pay. Get paid out.", href: "/app/settings?tab=payments", physical: false },
  { id: "storelib-shipping", core: true, name: "Shipping rates", summary: "Rates by zone, free shipping over an amount, packages.", href: "/app/settings?tab=shipping", physical: true },
  { id: "storelib-pickup", core: true, name: "Local delivery and pickup", summary: "Deliver nearby or let buyers pick up from your location.", href: "/app/settings?tab=locations", physical: true },
  { id: "storelib-taxes", core: true, name: "Taxes", summary: "Your tax rates by country or region.", href: "/app/settings?tab=taxes", physical: false },
  { id: "storelib-customer-emails", core: true, name: "Customer emails", summary: "Order, shipping and receipt emails, sent for you.", href: "/app/settings?tab=emails", physical: false },
  { id: "storelib-analytics", core: true, name: "Analytics", summary: "Visits, sales and where buyers come from.", href: "/app/analytics", physical: false },
  { id: "storelib-email-marketing", name: "Email marketing", summary: "Newsletters and automated emails to your subscribers.", href: "/app/emails", physical: false },
  { id: "storelib-checkout-reminders", core: true, name: "Checkout reminders", summary: "Email buyers who stopped at checkout.", href: "/app/settings?tab=checkout", physical: false },
  { id: "storelib-discounts", core: true, name: "Discount codes", summary: "Codes for a percent or amount off.", href: "/app/coupons", physical: false },
  { id: "storelib-bundles", name: "Bundles and upsells", summary: "Buy together deals and checkout offers.", href: "/app/offers", physical: true },
  { id: "storelib-markets", name: "Languages & Currency", summary: "Sell in more currencies and languages.", href: "/app/settings?tab=markets", physical: false },
  { id: "storelib-accounts", core: true, name: "Customer accounts", summary: "Buyers sign in before they pay.", href: "/app/settings?tab=checkout", physical: false },
  { id: "storelib-domain", core: true, name: "Domain", summary: "Your website on your own address.", href: "/app/settings?tab=domains", physical: false },
  { id: "storelib-code", name: "GitHub and AI agents", summary: "Edit your website from GitHub, Claude Code or Codex.", href: "/app/website-builder", physical: false },
]

/** Storelib's own apps that have a page in the catalog (lib/integrations/catalog.ts). */
export const STORELIB_CATALOG_APPS = ["storelib-reviews", "courier-tracking"] as const

export function storelibApps(physical: boolean): StorelibApp[] {
  return STORELIB_APPS.filter((a) => physical || !a.physical)
}

export function storelibAppById(id: string | null | undefined): StorelibApp | null {
  return STORELIB_APPS.find((a) => a.id === id) ?? null
}

/**
 * THE ESSENTIALS, in the order a store does them: get paid, get it there,
 * charge the right tax, tell buyers what happened, earn trust, see what
 * works, bring people back, look like a real shop.
 */
export const ESSENTIALS: { id: string; physical: boolean }[] = [
  { id: "storelib-payments", physical: false },
  { id: "storelib-shipping", physical: true },
  { id: "storelib-taxes", physical: false },
  { id: "storelib-customer-emails", physical: false },
  { id: "storelib-reviews", physical: false },
  { id: "storelib-analytics", physical: false },
  { id: "storelib-email-marketing", physical: false },
  { id: "storelib-domain", physical: false },
]

export function essentialIds(physical: boolean): string[] {
  return ESSENTIALS.filter((e) => physical || !e.physical).map((e) => e.id)
}

/** "4 of 8": done is On, read off the store. Unknown counts as not done, so the count never runs ahead. */
export function essentialsProgress(physical: boolean, states: Record<string, AppState | null | undefined>): { done: number; total: number } {
  const ids = essentialIds(physical)
  return { done: ids.filter((id) => states[id] === "on").length, total: ids.length }
}

/**
 * WHAT THE STATES ARE READ FROM. Each null is a read that failed or a table
 * a database doesn't have yet: its app gets no badge rather than a guess.
 */
export interface AppFacts {
  paymentsReady: boolean | null
  shippingRates: number | null
  pickupOrLocal: number | null
  taxRegions: number | null
  reviewsOn: boolean | null
  /** An automation on or a campaign sent, or Klaviyo or Omnisend connected with a key. */
  emailMarketing: boolean | null
  domainLive: boolean | null
  coupons: number | null
  activeOffers: number | null
  abandonedRecovery: boolean | null
  requireAccount: boolean | null
  /** Another language, or a market beyond the home one. */
  moreMarkets: boolean | null
  /** A GitHub repository linked, or an agent key that isn't revoked. */
  codeConnected: boolean | null
}

const has = (n: number | null): AppState | null => (n === null ? null : n > 0 ? "on" : "setup")
const yes = (b: boolean | null, no: AppState = "setup"): AppState | null => (b === null ? null : b ? "on" : no)

export function appStatesFrom(f: AppFacts): Record<string, AppState | null> {
  return {
    "storelib-payments": yes(f.paymentsReady),
    "storelib-shipping": f.shippingRates === null && f.pickupOrLocal === null ? null : (f.shippingRates ?? 0) > 0 || (f.pickupOrLocal ?? 0) > 0 ? "on" : "setup",
    "storelib-pickup": has(f.pickupOrLocal),
    "storelib-taxes": has(f.taxRegions),
    /* Sent for every order with nothing to set up (Settings › Customer emails changes their words). */
    "storelib-customer-emails": "on",
    /* Storelib Analytics counts every store's visits and sales from the start. */
    "storelib-analytics": "on",
    "storelib-email-marketing": yes(f.emailMarketing),
    "storelib-checkout-reminders": yes(f.abandonedRecovery, "off"),
    "storelib-discounts": has(f.coupons),
    "storelib-bundles": has(f.activeOffers),
    "storelib-markets": yes(f.moreMarkets),
    "storelib-accounts": yes(f.requireAccount, "off"),
    "storelib-domain": yes(f.domainLive),
    "storelib-code": yes(f.codeConnected),
    "storelib-reviews": yes(f.reviewsOn, "off"),
    /* Built in for every store that ships: on by itself. */
    "courier-tracking": "on",
  }
}

export const APP_STATE_LABEL: Record<AppState, string> = { on: "On", off: "Off", setup: "Set up" }
