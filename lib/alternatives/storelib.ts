/**
 * ===========================================================================
 *  WHAT THE COMPARISON PAGES SAY ABOUT STORELIB, READ FROM THE CODE
 * ===========================================================================
 * Every number a comparison page prints about Storelib comes from here, and
 * everything here comes from lib/marketing/facts, which reads the tables
 * checkout and billing use: the fee
 * rules (lib/payments/fees), the plan price (lib/billing/plans), the site
 * limits (lib/sites/plan) and storage (lib/storage/plans). Change a fee and
 * every comparison page, its calculator and its FAQ change with it.
 *
 * Pure and client safe, so the calculator can import it.
 */
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { ratePercentLabel } from "@/lib/payments/fees/config"
import { PRO_CHECKOUT_PLAN_ID } from "@/lib/billing/plans"
import { FEES, PLANS, proBreakEvenDollars as factsBreakEven } from "@/lib/marketing/facts"
import type { Rate, Source } from "./types"
import { CHECKED_ON } from "./checked"

export type StorelibPlanId = "free" | typeof PRO_CHECKOUT_PLAN_ID

/** The words every page uses for Storelib's plans and fees, from lib/marketing/facts (which reads them from the code). */
export const STORELIB = {
  proPrice: PLANS.pro.price,
  proPriceCents: PLANS.pro.monthlyCents,
  freeRate: ratePercentLabel(PLANS.free.rate),
  proRate: ratePercentLabel(PLANS.pro.rate),
  freeSmallRate: ratePercentLabel(PLANS.free.smallOrderRate),
  proSmallRate: ratePercentLabel(PLANS.pro.smallOrderRate),
  fixed: FEES.fixed,
  smallOrderBelow: FEES.smallOrderBelow,
  /** "5% + $0.25" */
  freeFee: PLANS.free.feeLabel,
  proFee: PLANS.pro.feeLabel,
  freeSites: PLANS.free.websites,
  proSites: PLANS.pro.websites,
  freeStorage: PLANS.free.storage,
  proStorage: PLANS.pro.storage,
  proCustomDomain: PLANS.pro.ownDomain,
  freeCustomDomain: PLANS.free.ownDomain,
} as const

/**
 * The monthly sales at which Pro's lower rate pays for its price, rounded up
 * to the next $10, the same sum the pricing page's FAQ does (lib/billing/plans planQuestions).
 */
export function proBreakEvenDollars(): number {
  return factsBreakEven()
}

/** Storelib's fee on one sale of `priceCents` in US dollars, exactly as checkout charges it. */
export function storelibFeeCents(priceCents: number, plan: StorelibPlanId): number {
  return calculateStorelibFee({ grossMinor: priceCents, currency: "USD", sellerPlan: plan === "free" ? "free" : "paid" }).totalStorelibFeeMinor
}

/**
 * Stripe's card processing, which applies on every Storelib plan
 * (lib/billing/plans PLAN_FOOTNOTE). Storelib does not set it; this is
 * Stripe's published standard rate for a domestic card in the US, sourced
 * like any competitor fact.
 */
export const STRIPE_US_RATE: Rate = { percent: 2.9, fixedCents: 30 }

export const STRIPE_PRICING_SOURCE: Source = {
  id: "stripe-pricing",
  title: "Stripe pricing and fees",
  url: "https://stripe.com/pricing",
  publisher: "Stripe",
  checkedOn: CHECKED_ON,
}

/** Where a reader checks Storelib's own numbers. */
export const STORELIB_FEE_HELP_PATH = "/orders-and-payouts/fees"
