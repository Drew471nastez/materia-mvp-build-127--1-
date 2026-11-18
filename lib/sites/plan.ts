/**
 * What each plan may do with Sites.
 *
 * One table, read by the dashboard, the create flow, the domain screen and the
 * publish route. The brief lists these limits in prose across six sections; the
 * moment they are also written in prose in four components, they disagree — and
 * the disagreement shows up as a creator being told they can do something and
 * then being refused.
 *
 * The plan itself comes from `resolveSellerPlan` in lib/billing/fee-calculator,
 * which is already the single source of truth for what tier somebody is on.
 * This file does not re-derive it and must never start.
 */

export type SitePlan = "free" | "growth" | "pro"

export interface SiteLimits {
  /** How many sites of kind='site' may exist. */
  maxSites: number
  /** Pages per site. */
  maxPages: number
  /** May connect a domain from `custom_domains`. */
  customDomain: boolean
  /** May turn off "Built with Storelib". */
  removeBranding: boolean
  /** May paste scripts into SiteSettings.customHeadScripts. */
  customCode: boolean
  /** May use templates where `themes.is_free` is false (after purchase). */
  premiumTemplates: boolean
  /** Shopify Storefront API integration. */
  shopify: boolean
  /** AI edits per calendar month. */
  aiEditsPerMonth: number
}

const LIMITS: Record<SitePlan, SiteLimits> = {
  free: {
    maxSites: 2,
    maxPages: 5,
    customDomain: false,
    removeBranding: false,
    customCode: false,
    premiumTemplates: false,
    shopify: false,
    /**
     * Two hundred, not twenty.
     *
     * Twenty was set when an "AI edit" meant changing a word. It now means a
     * whole first generation — four pages, fourteen sections, questions asked
     * and answered along the way — and a creator building a site iterates a
     * dozen times before it looks like theirs. Twenty ran out mid-build, which
     * is the worst place for a quota to stop somebody: they have paid nothing,
     * seen nothing finished, and have no reason to come back.
     */
    aiEditsPerMonth: 200,
  },
  growth: {
    maxSites: 3,
    maxPages: 20,
    customDomain: true,
    removeBranding: true,
    customCode: false,
    premiumTemplates: true,
    shopify: false,
    /**
     * Raised with free rather than left where it was. Free went to 200, which
     * is what growth used to offer — a paid tier whose headline feature gives
     * you exactly what the free one does is not a tier. The ladder has to keep
     * climbing or the price has nothing behind it.
     */
    aiEditsPerMonth: 500,
  },
  pro: {
    maxSites: 10,
    maxPages: 50,
    customDomain: true,
    removeBranding: true,
    customCode: true,
    premiumTemplates: true,
    shopify: true,
    aiEditsPerMonth: 1000,
  },
}

export function siteLimits(plan: SitePlan): SiteLimits {
  return LIMITS[plan] ?? LIMITS.free
}

/**
 * The reason a thing is refused, in words a creator can act on — or null when
 * it is allowed.
 *
 * It returns the SENTENCE rather than a boolean because every call site needs
 * one, and a boolean means each of them writes its own. "Upgrade to connect a
 * domain" written five slightly different ways in five components is how a
 * product stops sounding like one product.
 */
export function siteGate(
  plan: SitePlan,
  capability: keyof Omit<SiteLimits, "maxSites" | "maxPages" | "aiEditsPerMonth">,
): string | null {
  if (siteLimits(plan)[capability]) return null
  const reasons: Record<typeof capability, string> = {
    customDomain: "Connecting your own domain is available on Grow.",
    removeBranding: "Removing Storelib branding is available on Grow.",
    customCode: "Custom code is available on Pro.",
    premiumTemplates: "Premium templates are available on Grow.",
    shopify: "Connecting another store is available on Pro.",
  }
  return reasons[capability]
}

/** Null when another site may be created, otherwise why not. */
export function siteCountGate(plan: SitePlan, current: number): string | null {
  const max = siteLimits(plan).maxSites
  if (current < max) return null
  return max === 1
    ? "The Free plan includes one site. Upgrade to build more."
    : `Your plan includes ${max} sites. Upgrade to build more.`
}

/** Null when another page may be added, otherwise why not. */
export function sitePageGate(plan: SitePlan, current: number): string | null {
  const max = siteLimits(plan).maxPages
  return current < max ? null : `Your plan includes ${max} pages per site.`
}
