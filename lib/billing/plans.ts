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

/**
 * PAYING YEARLY, the way Shopify offers it: the same plan, paid once a
 * year, for less per month. Pro yearly is $22 a month, $264 once a year,
 * against $29 a month: 24% less.
 *
 * NOT ON SALE YET. There is no yearly price in Stripe, so a yearly Pro
 * checkout would charge the monthly price. Until one exists the cards show
 * yearly prices when Yearly is picked, and Pro's button says it opens soon
 * rather than taking anyone to a checkout for a price they did not see.
 * Turning it on: create the yearly price in Stripe, send `interval` through
 * checkout, and set YEARLY_BILLING_LIVE to true.
 */
export type BillingInterval = "monthly" | "yearly"
export const PRO_YEARLY_MONTHLY_CENTS = 2200
export const PRO_YEARLY_TOTAL_CENTS = PRO_YEARLY_MONTHLY_CENTS * 12
export const YEARLY_SAVING_PERCENT = Math.round((1 - PRO_YEARLY_MONTHLY_CENTS / PRO_PRICE_CENTS) * 100)
export const YEARLY_BILLING_LIVE = false

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
    /* "Start here" read as a place to stay: Free is the basics, and Pro has everything. */
    pill: "Basics",
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
    pill: "Everything included",
    priceNote: "per month",
    summary: "Keep more of every sale.",
    features: proFeatures(),
    excluded: [],
    /* A monthly Stripe subscription, cancelled from Billing
       (app/api/billing/subscription/cancel). */
    note: "Billed monthly. Cancel anytime.",
  },
]

/**
 * What a card says about its price for the interval picked. Free is the
 * same either way; Pro yearly is its monthly equivalent, with the yearly
 * total (or, until it is on sale, when it opens) in the small print.
 */
export function pricedFor(plan: OfferedPlan, interval: BillingInterval): Pick<OfferedPlan, "price" | "priceNote" | "note"> {
  if (interval === "monthly" || plan.priceCents === 0) return { price: plan.price, priceNote: plan.priceNote, note: plan.note }
  return {
    price: formatPlanPrice(PRO_YEARLY_MONTHLY_CENTS),
    priceNote: "per month, billed yearly",
    note: YEARLY_BILLING_LIVE ? `${formatPlanPrice(PRO_YEARLY_TOTAL_CENTS)} once a year. Cancel anytime.` : "Yearly opens soon. Pay monthly for now.",
  }
}

export function offeredPlan(id: OfferedPlanId): OfferedPlan {
  return OFFERED_PLANS.find((p) => p.id === id) ?? OFFERED_PLANS[0]
}

/**
 * The small print under the cards. True for every plan. The rule for the
 * fixed $0.25 (orders of $4.00 or more, lib/billing/fee-calculator) is how
 * the fee is worked out, not something to read under a price: the owner
 * asked for the standard line.
 */
export const PLAN_FOOTNOTE = "Prices in US dollars. Stripe's payment processing fees apply on every plan."

/* ─── Compare plans, and the questions under it ───────────────────────── */

/** A cell: words, or included / not included (drawn as a check or a cross). */
export type ComparisonValue = string | boolean

export interface ComparisonSection {
  title: string
  rows: { label: string; free: ComparisonValue; pro: ComparisonValue }[]
}

/**
 * THE TABLE UNDER THE CARDS on the upgrade page. Every row is written from
 * the table that decides it (fees, site limits, storage), the same way the
 * cards are, so the comparison cannot say something the plan does not do.
 * The rows every plan shares are the ones the Free card already lists.
 */
export function planComparison(): ComparisonSection[] {
  const free = siteLimits("free")
  const pro = siteLimits(PRO_CHECKOUT_PLAN_ID)
  const storage = (id: PlanId) => formatBytes(PLAN_LIMITS[id].storageQuotaBytes)
  const fee = (id: PlanId) => getFeeDescription(id).replace(" per transaction", "")
  return [
    {
      title: "Selling",
      rows: [
        { label: "Fee per sale", free: fee("free"), pro: fee(PRO_CHECKOUT_PLAN_ID) },
        { label: "Digital products and courses", free: "Unlimited", pro: "Unlimited" },
        { label: "Payouts to your bank through Stripe", free: true, pro: true },
        { label: "Email your buyers and subscribers", free: true, pro: true },
        { label: "Sales and visitor analytics", free: true, pro: true },
      ],
    },
    {
      title: "Websites",
      rows: [
        { label: "Websites", free: String(free.maxSites), pro: String(pro.maxSites) },
        { label: "Pages per website", free: String(free.maxPages), pro: String(pro.maxPages) },
        { label: "Your own domain", free: free.customDomain, pro: pro.customDomain },
        { label: "No Storelib branding", free: free.removeBranding, pro: pro.removeBranding },
        { label: "Premium templates", free: free.premiumTemplates, pro: pro.premiumTemplates },
        { label: "AI edits a month", free: String(free.aiEditsPerMonth), pro: String(pro.aiEditsPerMonth) },
      ],
    },
    {
      title: "Your account",
      rows: [
        { label: "File storage", free: storage("free"), pro: storage(PRO_CHECKOUT_PLAN_ID) },
        { label: "Creator page and OnePage", free: true, pro: true },
        { label: "Verified badge", free: false, pro: true },
      ],
    },
  ]
}

/**
 * THE QUESTIONS UNDER THE TABLE. Each answer is what the code does:
 * cancelling is `cancel_at_period_end` (app/api/billing/subscription/cancel),
 * the fee is lib/billing/fee-calculator, and the break even is the fee
 * difference against the price, worked out here rather than typed.
 */
export function planQuestions(): { q: string; a: string }[] {
  const proPrice = formatPlanPrice(PRO_PRICE_CENTS)
  const freeFee = getFeeDescription("free").replace(" per transaction", "")
  const proFee = getFeeDescription(PRO_CHECKOUT_PLAN_ID).replace(" per transaction", "")
  const rate = (s: string) => Number(/([\d.]+)%/.exec(s)?.[1] ?? 0) / 100
  const saved = rate(freeFee) - rate(proFee)
  const breakEven = saved > 0 ? Math.ceil(PRO_PRICE_CENTS / 100 / saved / 10) * 10 : 0
  const pro = siteLimits(PRO_CHECKOUT_PLAN_ID)
  return [
    {
      q: "How do I decide which plan is best for me?",
      a: `Free opens your store with no monthly fee, so you can start selling today. Pro is for when your store is earning: a lower fee on every sale (${proFee} instead of ${freeFee}), your own domain, no Storelib branding, and room for ${pro.maxSites} websites.`,
    },
    ...(breakEven
      ? [
          {
            q: "When does Pro pay for itself?",
            a: `Pro costs ${proPrice} a month and takes ${Math.round(saved * 1000) / 10}% less of every sale. Once you sell about $${breakEven.toLocaleString("en-US")} a month, the lower fee alone covers the plan, and everything past that is yours.`,
          },
        ]
      : []),
    {
      q: "What fees are taken from a sale?",
      a: `Storelib's fee for your plan (${freeFee} on Free, ${proFee} on Pro), and Stripe's card processing fee, which Stripe charges on every plan. There is nothing else.`,
    },
    {
      q: "How do I change or cancel my plan?",
      a: "From Billing in Settings, at any time. An upgrade starts straight away. When you cancel, Pro stays active until the end of the period you paid for, then your account moves to Free.",
    },
    {
      q: "What happens when I move back to Free?",
      a: "Your products, pages, customers and orders stay exactly as they are. The Free fee applies to new sales, and the things only Pro has, like your own domain and hidden branding, stop at the end of your paid period.",
    },
    {
      q: "Do I need a card to start?",
      a: "No. Free asks for no card. You only add one when you upgrade to Pro.",
    },
  ]
}
