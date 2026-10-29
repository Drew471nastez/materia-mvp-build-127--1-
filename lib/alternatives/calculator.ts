/**
 * ===========================================================================
 *  THE FEE CALCULATOR'S SUMS
 * ===========================================================================
 * One month of selling: a price and a number of sales. For each plan, what
 * the platform takes (its plan and its cut of each sale), what card
 * processing costs where the rate is known, and what is left.
 *
 * Storelib's cut is lib/payments/fees itself, the function checkout calls,
 * so the small order rule (under $4.00, no fixed part) is charged here
 * exactly as it is at checkout. Stripe's processing on Storelib is Stripe's
 * published US rate. Each fee is worked out per sale and rounded to the cent
 * the way a card charge is, then multiplied by the number of sales.
 *
 * Pure: the page renders it on the server for the first paint and the
 * browser runs it again as the numbers change. tests/alternatives.test.ts
 * pins the arithmetic.
 */
import type { CompetitorPlan, Rate } from "./types"
import { STORELIB, STRIPE_US_RATE, storelibFeeCents, type StorelibPlanId } from "./storelib"

export interface CalcInput {
  /** Price of one sale, in cents. */
  priceCents: number
  /** Sales in the month. */
  sales: number
}

export interface PlanCost {
  key: string
  platform: string
  plan: string
  isStorelib: boolean
  /** The subscription for the month, billed monthly. */
  planCents: number
  /** The platform's own cut of the month's sales. */
  feeCents: number
  /** Card processing for the month, or null when no rate could be confirmed. */
  processingCents: number | null
  processingLabel: string
  /** planCents + feeCents + (processingCents ?? 0). */
  totalCents: number
  /** Gross minus total. */
  keepCents: number
  /** True when processing is not in the total because its rate is unknown. */
  totalExcludesProcessing: boolean
}

/** Limits on what the inputs accept, so a typo cannot ask for a billion sales. */
export const MAX_PRICE_CENTS = 1_000_000
export const MAX_SALES = 100_000

export function clampInput(input: CalcInput): CalcInput {
  const price = Number.isFinite(input.priceCents) ? Math.round(input.priceCents) : 0
  const sales = Number.isFinite(input.sales) ? Math.round(input.sales) : 0
  return { priceCents: Math.min(MAX_PRICE_CENTS, Math.max(0, price)), sales: Math.min(MAX_SALES, Math.max(0, sales)) }
}

/** One sale's charge at `rate`, rounded to the cent. Nothing on a free sale. */
export function perSaleCents(priceCents: number, rate: Rate): number {
  if (priceCents <= 0) return 0
  return Math.min(priceCents, Math.round((priceCents * rate.percent) / 100) + rate.fixedCents)
}

export function grossCents(input: CalcInput): number {
  const { priceCents, sales } = clampInput(input)
  return priceCents * sales
}

export function competitorCost(platform: string, plan: CompetitorPlan, raw: CalcInput): PlanCost {
  const input = clampInput(raw)
  const feeCents = perSaleCents(input.priceCents, plan.fee) * input.sales
  const processingCents = plan.processing ? perSaleCents(input.priceCents, plan.processing) * input.sales : plan.processingKnown ? 0 : null
  const totalCents = plan.monthlyCents + feeCents + (processingCents ?? 0)
  return {
    key: `${platform}:${plan.id}`,
    platform,
    plan: plan.name,
    isStorelib: false,
    planCents: plan.monthlyCents,
    feeCents,
    processingCents,
    processingLabel: plan.processingLabel,
    totalCents,
    keepCents: grossCents(input) - totalCents,
    totalExcludesProcessing: processingCents === null,
  }
}

export function storelibCost(planId: StorelibPlanId, raw: CalcInput): PlanCost {
  const input = clampInput(raw)
  const planCents = planId === "free" ? 0 : STORELIB.proPriceCents
  const feeCents = input.priceCents > 0 ? storelibFeeCents(input.priceCents, planId) * input.sales : 0
  const processingCents = perSaleCents(input.priceCents, STRIPE_US_RATE) * input.sales
  const totalCents = planCents + feeCents + processingCents
  return {
    key: `storelib:${planId}`,
    platform: "Storelib",
    plan: planId === "free" ? "Free" : "Pro",
    isStorelib: true,
    planCents,
    feeCents,
    processingCents,
    processingLabel: "Stripe, 2.9% + 30¢ (US cards)",
    totalCents,
    keepCents: grossCents(input) - totalCents,
    totalExcludesProcessing: false,
  }
}

/** Every row the calculator draws: the competitor's plans that can sell a digital product, then Storelib's two. */
export function compare(platform: string, plans: CompetitorPlan[], input: CalcInput): PlanCost[] {
  return [...plans.filter((p) => p.sellsDigital).map((p) => competitorCost(platform, p, input)), storelibCost("free", input), storelibCost("growth", input)]
}

/** What a row is judged on: the whole month, or only what the platform itself takes. */
export type Basis = "total" | "platform"

const costOn = (r: PlanCost, basis: Basis) => (basis === "total" ? r.totalCents : r.planCents + r.feeCents)

/** The cheapest of some rows on `basis`. */
export function cheapest(rows: PlanCost[], basis: Basis): PlanCost | null {
  return rows.reduce<PlanCost | null>((best, r) => (!best || costOn(r, basis) < costOn(best, basis) ? r : best), null)
}

/**
 * The sentence under the table: Storelib's cheaper plan against the
 * competitor's cheaper plan. On the whole month, processing included, when
 * every rate is known; when a competitor's processing rate is not known it
 * cannot be totalled honestly, so both sides are judged on what the
 * platform itself takes (its plan and its cut), and the sentence says so.
 * It says plainly when the competitor comes out cheaper.
 */
export function verdict(rows: PlanCost[]): { storelib: PlanCost; competitor: PlanCost; differenceCents: number; cheaper: "storelib" | "competitor" | "same"; basis: Basis } | null {
  const theirs = rows.filter((r) => !r.isStorelib)
  const basis: Basis = theirs.every((r) => !r.totalExcludesProcessing) ? "total" : "platform"
  const storelib = cheapest(rows.filter((r) => r.isStorelib), basis)
  const competitor = cheapest(theirs, basis)
  if (!storelib || !competitor) return null
  const a = costOn(storelib, basis)
  const b = costOn(competitor, basis)
  return { storelib, competitor, differenceCents: Math.abs(a - b), cheaper: a < b ? "storelib" : a > b ? "competitor" : "same", basis }
}
