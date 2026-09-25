/**
 * The plans Storelib sells, and how every screen names them.
 *
 * Two plans are offered: Free and Pro at $29 a month. Pro is the internal plan
 * id `growth`, because that is the only $29 price that exists in Stripe. The
 * id stays `growth` everywhere money moves (checkout, webhooks, fees, limits);
 * only the name a person reads is "Pro".
 *
 * The internal `pro` plan ($99, 1.5%) is no longer offered. People already on
 * it keep it, and their billing screens still show it, also named "Pro".
 *
 * The feature lists are written FROM the entitlement tables rather than beside
 * them, so a card cannot promise something the plan does not get:
 *   fees     lib/billing/fee-calculator.ts
 *   sites    lib/sites/plan.ts
 *   storage  lib/storage/plans.ts
 *
 * Pure and client safe: every import here is a table, not a database client.
 */
import { getFeeDescription, getFeePreview } from "./fee-calculator"
import { siteLimits, type SitePlan } from "@/lib/sites/plan"
import { PLAN_LIMITS, formatBytes } from "@/lib/storage/plans"

export type PlanId = "free" | "growth" | "pro"
export type OfferedPlanId = "free" | "growth"

/** The plan id a Pro checkout sends. Never "pro": that is the $99 plan. */
export const PRO_CHECKOUT_PLAN_ID = "growth" as const

export const OFFERED_PLAN_IDS: readonly OfferedPlanId[] = ["free", PRO_CHECKOUT_PLAN_ID]

/** What the Stripe price for `growth` charges, in cents. */
export const PRO_PRICE_CENTS = 2900

const DISPLAY_NAMES: Record<PlanId, string> = {
  free: "Free",
  growth: "Pro",
  pro: "Pro",
}

/** The name a person reads for any plan id, including ones no longer sold. */
export function planDisplayName(id: string | null | undefined): string {
  const key = (id ?? "free").toLowerCase().trim()
  if (key === "professional") return DISPLAY_NAMES.pro
  return DISPLAY_NAMES[key as PlanId] ?? DISPLAY_NAMES.free
}

/** $29 rather than $29.00, and $29.90 only if a price really has cents. */
export function formatPlanPrice(cents: number): string {
  const dollars = cents / 100
  return `$${cents % 100 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`
}

/** Copies a plan row with the name people should read. */
export function withPlanLabel<T extends { id?: string; name?: string } | null | undefined>(plan: T): T {
  if (!plan || !plan.id) return plan
  return { ...plan, name: planDisplayName(plan.id) }
}

function feeLine(id: PlanId): string {
  return getFeeDescription(id).replace("per transaction", "per sale")
}

/**
 * What a plan includes, in the order it matters to a seller. Written for all
 * three ids so a legacy subscriber's billing screen is described as truthfully
 * as the plans on sale.
 */
export function planHighlights(id: PlanId): string[] {
  const sites = siteLimits(id as SitePlan)
  const storage = PLAN_LIMITS[id]
  const lines = [feeLine(id)]

  if (sites.customDomain) lines.push("Your own domain")
  if (sites.removeBranding) lines.push("No Storelib branding")
  if (id !== "free") lines.push("Verified badge")
  if (id === "free") lines.push("Unlimited digital products")

  lines.push(`${sites.maxSites} websites, ${sites.maxPages} pages each`)
  lines.push(`${formatBytes(storage.storageQuotaBytes)} of file storage`)
  lines.push(`${sites.aiEditsPerMonth} AI edits a month`)
  return lines
}

/**
 * The sale every card works through, so the fee is a number somebody keeps
 * rather than a percentage they have to multiply out. $50 because it is over
 * the $3.00 threshold for the fixed $0.25, so the example carries every part
 * of the fee.
 */
export const EXAMPLE_SALE_CENTS = 5000

export interface OfferedPlan {
  id: OfferedPlanId
  name: string
  priceCents: number
  price: string
  /** Beside the price: "/month", or "forever" for the plan that costs nothing. */
  period: string
  summary: string
  /** Who the plan is for, in one short line. */
  audience: string
  /** The line above the feature list. */
  featuresHeading: string
  features: string[]
  /** The fee on this plan, as a line: "6% + $0.25 per sale". */
  fee: string
  /** What the seller keeps of EXAMPLE_SALE_CENTS, from the fee table that charges it. */
  keepsCents: number
}

export const OFFERED_PLANS: readonly OfferedPlan[] = [
  {
    id: "free",
    name: planDisplayName("free"),
    priceCents: 0,
    price: formatPlanPrice(0),
    period: "forever",
    summary: "Everything you need to open a store and start selling.",
    audience: "For opening a store and making your first sales.",
    featuresHeading: "Includes",
    features: planHighlights("free"),
    fee: feeLine("free"),
    keepsCents: getFeePreview(EXAMPLE_SALE_CENTS, "free").sellerReceivesCents,
  },
  {
    id: PRO_CHECKOUT_PLAN_ID,
    name: planDisplayName(PRO_CHECKOUT_PLAN_ID),
    priceCents: PRO_PRICE_CENTS,
    price: formatPlanPrice(PRO_PRICE_CENTS),
    period: "/month",
    summary: "A lower fee on every sale, your own domain, and no Storelib branding.",
    audience: "For stores that sell every week and want their own address.",
    featuresHeading: "Everything in Free, plus",
    features: planHighlights(PRO_CHECKOUT_PLAN_ID).filter((line) => line !== "Unlimited digital products"),
    fee: feeLine(PRO_CHECKOUT_PLAN_ID),
    keepsCents: getFeePreview(EXAMPLE_SALE_CENTS, PRO_CHECKOUT_PLAN_ID).sellerReceivesCents,
  },
]

export function offeredPlan(id: OfferedPlanId): OfferedPlan {
  return OFFERED_PLANS.find((p) => p.id === id) ?? OFFERED_PLANS[0]
}

/** The small print under the cards. True for every plan. */
export const PLAN_FOOTNOTE =
  "The $0.25 is added to orders of $3.00 or more. Stripe's card processing fees are separate."
