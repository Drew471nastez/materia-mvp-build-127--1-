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
import { getFeeDescription } from "./fee-calculator"
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

/* ─── What each card says ─────────────────────────────────────────────── */

/**
 * The lines on the cards, each one written from the table that decides it
 * where there is one, so a card cannot promise what the plan does not get.
 * The rest name things every plan has, and tests/pricing-plans.test.ts ties
 * each of those to the code that provides it.
 */
const websitesLine = (id: PlanId) => `${siteLimits(id as SitePlan).maxSites} websites, ${siteLimits(id as SitePlan).maxPages} pages each`
const storageLine = (id: PlanId) => `${formatBytes(PLAN_LIMITS[id].storageQuotaBytes)} of file storage`
const aiEditsLine = (id: PlanId) => `${siteLimits(id as SitePlan).aiEditsPerMonth} AI edits a month`

/** What Free includes, in the order a seller weighs it. */
function freeFeatures(): string[] {
  return [
    feeLine("free"),
    "Unlimited digital products and courses",
    `A creator page and ${siteLimits("free").maxSites} websites`,
    "Payouts to your bank through Stripe",
    "Email your buyers and subscribers",
    "Sales and visitor analytics",
    storageLine("free"),
  ]
}

/** What Free does not have that Pro does, shown crossed out so the cards compare. */
function freeExcluded(): string[] {
  const free = siteLimits("free")
  const lines: string[] = []
  if (!free.customDomain && siteLimits(PRO_CHECKOUT_PLAN_ID).customDomain) lines.push("Your own domain")
  return lines
}

/** What Pro adds, after everything Free has. */
function proFeatures(): string[] {
  const pro = siteLimits(PRO_CHECKOUT_PLAN_ID)
  const lines = ["Everything in Free", feeLine(PRO_CHECKOUT_PLAN_ID)]
  if (pro.customDomain) lines.push("Your own domain")
  if (pro.removeBranding) lines.push("No Storelib branding")
  lines.push(websitesLine(PRO_CHECKOUT_PLAN_ID), storageLine(PRO_CHECKOUT_PLAN_ID), aiEditsLine(PRO_CHECKOUT_PLAN_ID))
  lines.push("Verified badge")
  return lines
}

export interface OfferedPlan {
  id: OfferedPlanId
  name: string
  priceCents: number
  price: string
  /** Beside the price where it is written in one line: "/month", or "forever". */
  period: string
  /** The small label at the top of the card. A plain fact about who it is for, never a claim nobody can check. */
  pill: string
  /** The small line under the price. */
  priceNote: string
  /** One line under that. */
  summary: string
  /** What the plan includes. Pro starts with "Everything in Free". */
  features: string[]
  /** What it does not include, drawn greyed with a cross, so both cards have as many lines. */
  excluded: string[]
  /** The small print under the button. */
  note: string
}

export const OFFERED_PLANS: readonly OfferedPlan[] = [
  {
    id: "free",
    name: planDisplayName("free"),
    priceCents: 0,
    price: formatPlanPrice(0),
    period: "forever",
    pill: "Start here",
    priceNote: "No monthly fee",
    summary: "Open your store and start selling today.",
    features: freeFeatures(),
    excluded: freeExcluded(),
    /* Free has no checkout: signing up asks for no card. */
    note: "No card needed",
  },
  {
    id: PRO_CHECKOUT_PLAN_ID,
    name: planDisplayName(PRO_CHECKOUT_PLAN_ID),
    priceCents: PRO_PRICE_CENTS,
    price: formatPlanPrice(PRO_PRICE_CENTS),
    period: "/month",
    pill: "For growing stores",
    priceNote: "per month",
    summary: "Keep more of every sale.",
    features: proFeatures(),
    excluded: [],
    /* A monthly Stripe subscription, cancelled from Billing
       (app/api/billing/subscription/cancel). */
    note: "Billed monthly. Cancel anytime.",
  },
]

export function offeredPlan(id: OfferedPlanId): OfferedPlan {
  return OFFERED_PLANS.find((p) => p.id === id) ?? OFFERED_PLANS[0]
}

/** The small print under the cards. True for every plan. */
export const PLAN_FOOTNOTE =
  "The $0.25 is added to orders of $3.00 or more. Stripe's card processing fees are separate."
